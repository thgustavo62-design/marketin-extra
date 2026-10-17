'use server'

import { revalidatePath } from 'next/cache'
import { audit, requireUser, writerOrError } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { getKit, saveKit } from '@/lib/promo/brand'
import { deleteLibraryItem } from '@/lib/promo/library'
import { pool } from '@/lib/db'

/** O kit de uma filial (para o editor e para a tela de cadastro). Só de filiais a que a pessoa tem acesso. */
export async function getKitAction(brandId: string) {
  const user = await requireUser()
  if (!isUuid(brandId) || !brandAllowed(user, brandId)) return null
  const kit = await getKit(brandId)
  return { ...kit, logos: kit.logos.map((l) => ({ id: l.id, name: l.name, width: l.width, height: l.height })) }
}

export async function saveKitAction(brandId: string, kit: unknown): Promise<{ ok: boolean; error?: string }> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { ok: false, error: NO_BRAND_ACCESS }
  const r = await saveKit(brandId, kit, g.user.id)
  if (r.ok) { revalidatePath('/criacao/marcas'); await audit('kit_de_marca_salvo', { userId: g.user.id, target: brandId }) }
  return { ok: r.ok, error: r.error }
}

export async function deleteLogoAction(brandId: string, logoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId) || !isUuid(logoId) || !brandAllowed(g.user, brandId)) return { ok: false, error: NO_BRAND_ACCESS }
  if (!(await pool.query(`select 1 from promo_library where id = $1 and brand_id = $2`, [logoId, brandId])).rowCount) return { ok: false, error: 'Logo não encontrado nesta filial.' }
  await deleteLibraryItem(logoId)
  revalidatePath('/criacao/marcas')
  return { ok: true }
}
