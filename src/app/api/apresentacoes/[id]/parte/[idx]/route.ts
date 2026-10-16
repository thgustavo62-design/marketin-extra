import { NextResponse } from 'next/server'
import { sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { getChunk, getPresentation, putChunk } from '@/lib/presentations'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Envia uma parte (corpo binário, até 3,5 MB). Só quem iniciou o envio.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  if (!isUuid(id) || !/^\d{1,3}$/.test(idx)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const r = await putChunk(id, Number(idx), Buffer.from(await req.arrayBuffer()), user.id)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status })
}

// Lê uma parte do arquivo (o navegador remonta e apresenta). Respeita o acesso à filial.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isUuid(id) || !/^\d{1,3}$/.test(idx)) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const p = await getPresentation(id, user)
  if (!p || (p.brand_id && !brandAllowed(user, p.brand_id))) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const data = await getChunk(id, Number(idx))
  if (!data) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(data.length), 'Cache-Control': 'private, max-age=3600, immutable', 'X-Content-Type-Options': 'nosniff' } })
}
