import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { brandAllowed, canWrite } from '@/lib/perms'
import { audit, sameOrigin } from '@/lib/auth'
import { pool, withTx } from '@/lib/db'
import { MAX_UPLOAD_BYTES, ALLOWED_MIME, parseTags, safeFileName, sniffMime } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'
import { getStorage } from '@/lib/storage'

// Envio de arquivo (multipart). Por que não Server Action: o corpo de uma action tem limite de 1 MB.
// Valida: sessão, origem (CSRF), perfil, acesso à filial, tamanho, e o tipo REAL pelos bytes (não pelo nome).
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })

  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB).' }, { status: 413 }) }

  const file = fd.get('file')
  const brandId = String(fd.get('brand_id') ?? '')
  const branchId = String(fd.get('branch_id') ?? '')
  const parentId = String(fd.get('parent_id') ?? '')
  const title = String(fd.get('title') ?? '').trim().slice(0, 160)
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha um arquivo.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'O arquivo passa de 4 MB. Para vídeos e arquivos grandes, cadastre como link.' }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime) return NextResponse.json({ error: 'Tipo de arquivo não aceito. Use PNG, JPG, WEBP, GIF ou PDF.' }, { status: 415 })
  const checksum = createHash('sha256').update(bytes).digest('hex')

  // Nova versão de uma peça existente: herda filial, unidade, grupo e etiquetas.
  let group: { group_id: string; brand_id: string; branch_id: string | null; title: string; next: number } | null = null
  if (parentId) {
    if (!isUuid(parentId)) return NextResponse.json({ error: 'Peça inválida.' }, { status: 400 })
    const r = await pool.query(
      `select a.group_id, a.brand_id, a.branch_id, a.title, (select max(version_number) + 1 from media_assets where group_id = a.group_id) as next
         from media_assets a where a.id = $1 and a.deleted_at is null`, [parentId])
    group = r.rows[0] ?? null
    if (!group) return NextResponse.json({ error: 'Peça não encontrada.' }, { status: 404 })
  }
  const brand = group?.brand_id ?? brandId
  if (!isUuid(brand) || !brandAllowed(user, brand)) return NextResponse.json({ error: 'Você não tem acesso a esta filial.' }, { status: 403 })
  const branch = group ? group.branch_id : branchId || null
  if (branch) {
    if (!isUuid(branch) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branch, brand])).rowCount) {
      return NextResponse.json({ error: 'Unidade inválida para esta filial.' }, { status: 400 })
    }
  }
  // O mesmo arquivo não entra duas vezes na mesma filial.
  const dup = (await pool.query(`select id, title from media_assets where brand_id = $1 and checksum_sha256 = $2 and deleted_at is null`, [brand, checksum])).rows[0]
  if (dup) return NextResponse.json({ error: `Este arquivo já está na biblioteca como "${dup.title}".`, existingId: dup.id }, { status: 409 })

  const name = safeFileName(file.name)
  const finalTitle = group?.title ?? (title || name.replace(/\.[^.]+$/, '') || 'Arquivo')
  const tags = parseTags(String(fd.get('tags') ?? ''))
  const id = await withTx(async (db) => {
    const r = await db.query(
      `insert into media_assets (brand_id, branch_id, kind, title, original_name, mime_type, size_bytes, checksum_sha256, storage_provider, group_id, version_number, uploaded_by)
       values ($1,$2,'file',$3,$4,$5,$6,$7,$8,coalesce($9::uuid, gen_random_uuid()),coalesce($10::int, 1),$11) returning id`,
      [brand, branch, finalTitle, name, mime, bytes.length, checksum, getStorage().name, group?.group_id ?? null, group?.next ?? null, user.id],
    )
    const assetId = r.rows[0].id as string
    await db.query(`insert into media_blobs (asset_id, data) values ($1, $2)`, [assetId, bytes])
    const useTags = group
      ? (await db.query(`select tag from media_asset_tags where asset_id = (select id from media_assets where group_id = $1 and version_number = $2)`, [group.group_id, group.next - 1])).rows.map((x) => x.tag as string)
      : tags
    for (const t of useTags) await db.query(`insert into media_asset_tags (asset_id, tag) values ($1, $2) on conflict do nothing`, [assetId, t])
    return assetId
  })
  await audit('midia_enviada', { userId: user.id, target: id, meta: { tipo: mime, tamanho: bytes.length, versao: group?.next ?? 1 } })
  return NextResponse.json({ ok: true, id, ext: ALLOWED_MIME[mime] })
}
