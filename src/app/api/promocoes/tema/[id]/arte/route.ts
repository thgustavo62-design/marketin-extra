import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { setThemeAsset, type ThemeRole } from '@/lib/promo/store'
import { getSession } from '@/lib/session'
import type { PromoFormat } from '@/lib/domain/promo'

export const maxDuration = 60

// Envio da arte de um tema (multipart: role, format, file). Até 4 MB por envio.
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
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a imagem.' }, { status: 400 })
  const r = await setThemeAsset(id, String(fd.get('role') ?? '') as ThemeRole, String(fd.get('format') ?? '') as PromoFormat, Buffer.from(await file.arrayBuffer()))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  await audit('promocao_arte_enviada', { userId: user.id, target: id, meta: { role: fd.get('role'), format: fd.get('format') } })
  return NextResponse.json({ ok: true })
}
