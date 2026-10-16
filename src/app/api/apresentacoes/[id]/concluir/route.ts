import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { finishUpload } from '@/lib/presentations'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Fecha o envio: remonta as partes, confere o tipo pelos bytes e libera a apresentação.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const r = await finishUpload(id, user.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await audit('apresentacao_enviada', { userId: user.id, target: id })
  return NextResponse.json({ ok: true, id })
}
