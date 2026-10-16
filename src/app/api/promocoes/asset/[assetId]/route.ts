import { NextResponse } from 'next/server'
import { getAsset } from '@/lib/promo/store'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'

// Imagem usada como elemento numa peça (logo, selo, adesivo). Só para quem está logado; o navegador guarda pela impressão digital.
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(assetId)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const a = await getAsset(assetId, new URL(req.url).searchParams.get('mini') === '1')
  if (!a) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const etag = `"${a.sha}"`
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=86400, immutable' } })
  return new NextResponse(new Uint8Array(a.data), { headers: { 'Content-Type': a.mime, 'Content-Length': String(a.data.length), ETag: etag, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' } })
}
