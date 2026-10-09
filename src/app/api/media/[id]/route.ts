import { NextResponse } from 'next/server'
import { rowAllowed } from '@/lib/access'
import { pool } from '@/lib/db'
import { safeFileName } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'
import { getStorage } from '@/lib/storage'

// Download autorizado: só quem tem acesso à filial da mídia. Nada é público e nada é executado no navegador.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  // Mesma resposta para "não existe" e "sem acesso": não revela que a mídia existe.
  if (!isUuid(id) || !(await rowAllowed(user, 'media_assets', id))) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  const a = (await pool.query(
    `select kind, mime_type, original_name, checksum_sha256 from media_assets where id = $1 and deleted_at is null`, [id])).rows[0]
  if (!a || a.kind !== 'file') return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  const etag = `"${a.checksum_sha256}"`
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=300' } })

  const data = await getStorage().get(id)
  if (!data) return NextResponse.json({ error: 'Arquivo indisponível.' }, { status: 404 })
  const download = new URL(req.url).searchParams.get('baixar') === '1'
  const name = encodeURIComponent(safeFileName(a.original_name ?? 'arquivo'))
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': a.mime_type,
      'Content-Length': String(data.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
      ETag: etag,
      'Cache-Control': 'private, max-age=300',
      // Defesa extra: mesmo que um arquivo fosse interpretado como página, nada roda.
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
