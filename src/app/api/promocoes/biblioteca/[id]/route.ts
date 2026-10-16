import { NextResponse } from 'next/server'
import { isUuid } from '@/lib/form'
import { getLibraryImage } from '@/lib/promo/library'
import { getSession } from '@/lib/session'

// Imagem da biblioteca (?mini=1 = miniatura). Só para quem está logado.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const a = await getLibraryImage(id, new URL(req.url).searchParams.get('mini') === '1')
  if (!a) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const etag = `"${a.sha}"`
  const h = { ETag: etag, 'Cache-Control': 'private, max-age=86400, immutable' }
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: h })
  return new NextResponse(new Uint8Array(a.data), { headers: { ...h, 'Content-Type': a.mime, 'Content-Length': String(a.data.length), 'X-Content-Type-Options': 'nosniff' } })
}
