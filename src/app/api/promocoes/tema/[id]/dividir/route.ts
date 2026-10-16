import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { PROMO_FORMAT_KEYS, type PromoFormat } from '@/lib/domain/promo'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { splitThemeArt } from '@/lib/promo/store'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Arte completa em branco (sem produtos nem preços) → o topo vira cabeçalho, a base vira rodapé e a imagem toda fica de fundo.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  if (!isUuid(id)) return NextResponse.json({ error: 'Tema inválido.' }, { status: 400 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB).' }, { status: 413 }) }
  const file = fd.get('file')
  const format = String(fd.get('format') ?? '') as PromoFormat
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a imagem.' }, { status: 400 })
  if (!PROMO_FORMAT_KEYS.includes(format)) return NextResponse.json({ error: 'Formato inválido.' }, { status: 400 })
  const headerPx = Number(fd.get('header_px')), footerPx = Number(fd.get('footer_px'))
  if (!Number.isFinite(headerPx) || !Number.isFinite(footerPx) || headerPx < 0 || footerPx < 0) return NextResponse.json({ error: 'Informe as alturas do cabeçalho e do rodapé em pixels (0 se não houver).' }, { status: 400 })
  const r = await splitThemeArt(id, format, Buffer.from(await file.arrayBuffer()), headerPx, footerPx)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  await audit('promocao_arte_dividida', { userId: user.id, target: id, meta: { format, headerPx, footerPx } })
  return NextResponse.json({ ok: true })
}
