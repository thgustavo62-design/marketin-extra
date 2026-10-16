import { NextResponse } from 'next/server'
import { getThemeAsset } from '@/lib/promo/store'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'

// Arte do tema (cabeçalho, rodapé, fundo ou selo). Só para quem está logado; o navegador guarda pela impressão digital da imagem.
export async function GET(req: Request, ctx: { params: Promise<{ id: string; role: string; format: string }> }) {
  const { id, role, format } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const a = await getThemeAsset(id, role, format)
  if (!a) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const etag = `"${a.sha}"`
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } })
  return new NextResponse(new Uint8Array(a.data), { headers: { 'Content-Type': a.mime, 'Content-Length': String(a.data.length), ETag: etag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } })
}
