import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { audit, sameOrigin } from '@/lib/auth'
import { pool } from '@/lib/db'
import { MAX_UPLOAD_BYTES, safeFileName } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { extractPdfPages, looksLikePdf } from '@/lib/plan/pdf'
import { createPreview } from '@/lib/plan/service'
import { clientIp, getSession } from '@/lib/session'

// Ler um PDF de 50+ páginas leva alguns segundos.
export const maxDuration = 60

// Envio do PDF do plano (multipart). Só LÊ e guarda a prévia: nada vira conteúdo até a pessoa confirmar.
// Valida: sessão, origem (CSRF), perfil, acesso à filial, tamanho e o tipo REAL pelos bytes.
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
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha o PDF do plano.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'O PDF passa de 4 MB. Exporte de novo sem imagens pesadas ou reduza o arquivo.' }, { status: 413 })
  if (!isUuid(brandId) || !brandAllowed(user, brandId)) return NextResponse.json({ error: 'Você não tem acesso a esta filial.' }, { status: 403 })
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) {
    return NextResponse.json({ error: 'Unidade inválida para esta filial.' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (!looksLikePdf(bytes)) return NextResponse.json({ error: 'O arquivo não é um PDF.' }, { status: 415 })
  const text = await extractPdfPages(bytes)
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 422 })

  const sha = createHash('sha256').update(bytes).digest('hex')
  const name = safeFileName(file.name)
  const r = await createPreview({ userId: user.id, brandId, branchId: branchId || null, fileName: name, sha, pages: text.pages })
  if (!r.ok) return NextResponse.json({ error: r.error, existingId: r.existingId }, { status: r.existingId ? 409 : 422 })
  await audit('plano_lido', { userId: user.id, ip: await clientIp(), target: r.id, meta: { arquivo: name, paginas: text.pages.length, pecas: r.plan.entries.length, avisos: r.plan.warnings.length } })
  return NextResponse.json({ ok: true, id: r.id, entries: r.plan.entries.length })
}
