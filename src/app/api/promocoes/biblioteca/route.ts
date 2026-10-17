import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed, canWrite } from '@/lib/perms'
import { addLibraryImage } from '@/lib/promo/library'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Envio de uma imagem para a biblioteca (multipart: file, category). Uma por requisição (a Vercel limita o corpo a 4,5 MB).
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB).' }, { status: 413 }) }
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a imagem.' }, { status: 400 })
  const brandId = String(fd.get('brand_id') ?? '') || null
  if (brandId && (!isUuid(brandId) || !brandAllowed(user, brandId))) return NextResponse.json({ error: NO_BRAND_ACCESS }, { status: 403 })
  const r = await addLibraryImage({ buf: Buffer.from(await file.arrayBuffer()), fileName: file.name, category: brandId ? 'logo' : String(fd.get('category') ?? 'outro'), userId: user.id, brandId })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  if (!r.duplicate) await audit('promocao_biblioteca_imagem', { userId: user.id, target: r.id })
  return NextResponse.json({ ok: true, id: r.id, duplicate: r.duplicate })
}
