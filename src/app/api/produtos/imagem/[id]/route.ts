import { NextResponse } from 'next/server'
import { getImageBytes } from '@/lib/catalog/store'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'

// Imagem do catálogo (miniatura com ?mini=1). Só para quem está logado; o conteúdo de um id nunca muda, então o navegador pode guardar.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const url = new URL(req.url)
  const img = await getImageBytes(id, url.searchParams.get('mini') === '1')
  if (!img) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const etag = `"${id}${url.searchParams.get('mini') === '1' ? 'm' : ''}"`
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=86400, immutable' } })
  const download = url.searchParams.get('baixar') === '1'
  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      'Content-Type': img.mime,
      'Content-Length': String(img.data.length),
      'Content-Disposition': download ? `attachment; filename="produto-${id.slice(0, 8)}.webp"` : 'inline',
      ETag: etag,
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
