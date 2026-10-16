'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { deletePresentation, getPresentation, updatePresentation } from '@/lib/presentations'

type Out = { ok: boolean; error?: string }

export async function updatePresentationAction(id: string, v: { title: string; description: string; brandId: string }): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id)) return { ok: false, error: 'Pedido inválido.' }
  const cur = await getPresentation(id, g.user)
  if (!cur) return { ok: false, error: 'Apresentação não encontrada.' }
  const brandId = v.brandId || null
  if (brandId && (!isUuid(brandId) || !brandAllowed(g.user, brandId))) return { ok: false, error: NO_BRAND_ACCESS }
  const r = await updatePresentation(id, { title: v.title, description: v.description, brandId })
  if (r.ok) { revalidatePath('/resultados/apresentacoes'); revalidatePath(`/resultados/apresentacoes/${id}`) }
  return r
}

export async function deletePresentationAction(id: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id)) return { ok: false, error: 'Pedido inválido.' }
  const cur = await getPresentation(id, g.user)
  if (!cur) return { ok: false, error: 'Apresentação não encontrada.' }
  await deletePresentation(id)
  await audit('apresentacao_excluida', { userId: g.user.id, target: id, meta: { title: cur.title } })
  revalidatePath('/resultados/apresentacoes')
  return { ok: true }
}
