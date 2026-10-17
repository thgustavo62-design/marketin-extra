import { NextResponse } from 'next/server'
import { sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getThumb, saveThumb } from '@/lib/promo/store'
import { getSession } from '@/lib/session'

// Miniatura da primeira peça (o editor gera e envia; corpo = imagem, até 400 KB).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const r = await saveThumb(id, Buffer.from(await req.arrayBuffer()))
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 })
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const t = await getThumb(id)
  if (!t) return NextResponse.json({ error: 'Sem miniatura.' }, { status: 404 })
  const etag = `"${new Date(t.at).getTime()}"`
  const h = { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' }
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: h })
  return new NextResponse(new Uint8Array(t.data), { headers: { ...h, 'Content-Type': 'image/webp', 'Content-Length': String(t.data.length), 'X-Content-Type-Options': 'nosniff' } })
}
