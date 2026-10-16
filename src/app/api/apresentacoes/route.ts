import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed, canWrite } from '@/lib/perms'
import { startUpload } from '@/lib/presentations'
import { getSession } from '@/lib/session'

// Início do envio de uma apresentação (JSON). As partes vão depois, uma a uma, em /api/apresentacoes/[id]/parte/[n].
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const brandId = typeof b.brandId === 'string' && b.brandId ? b.brandId : null
  if (brandId && (!isUuid(brandId) || !brandAllowed(user, brandId))) return NextResponse.json({ error: NO_BRAND_ACCESS }, { status: 403 })
  const r = await startUpload({
    title: String(b.title ?? ''), description: typeof b.description === 'string' ? b.description : null, fileName: String(b.fileName ?? 'apresentacao'),
    kind: String(b.kind ?? ''), size: Number(b.size), chunks: Number(b.chunks), brandId, userId: user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  await audit('apresentacao_envio_iniciado', { userId: user.id, target: r.id })
  return NextResponse.json({ ok: true, id: r.id })
}
