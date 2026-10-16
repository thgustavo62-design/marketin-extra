import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { addAsset } from '@/lib/promo/store'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Envio de uma imagem para usar como elemento livre na peça (multipart: file). Até 8 MB por envio.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Promoção inválida.' }, { status: 400 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais.' }, { status: 413 }) }
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a imagem.' }, { status: 400 })
  const r = await addAsset(id, Buffer.from(await file.arrayBuffer()), user.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  await audit('promocao_imagem_enviada', { userId: user.id, target: id })
  return NextResponse.json({ ok: true, id: r.id, width: r.width, height: r.height })
}
