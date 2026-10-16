'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { PROMO_FORMAT_KEYS, parsePrice, type PromoFormat } from '@/lib/domain/promo'
import { addItem, createTheme, deleteCampaign, deleteTheme, deleteThemeAsset, moveItem, removeItem, reorderItems, saveThemeConfig, THEME_ROLES, updateCampaign, updateItem, type ThemeRole } from '@/lib/promo/store'

type Out = { ok: boolean; error?: string; id?: string }
const NO: Out = { ok: false, error: 'Pedido inválido.' }

export async function createThemeAction(name: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  const r = await createTheme(String(name), g.user.id)
  if (r.ok) { await audit('promocao_tema_criado', { userId: g.user.id, target: r.id }); revalidatePath('/promocoes/temas'); return { ok: true, id: r.id } }
  return { ok: false, error: r.error }
}

export async function saveThemeAction(id: string, name: string, config: unknown): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await saveThemeConfig(id, String(name), config)
  if (r.ok) { await audit('promocao_tema_editado', { userId: g.user.id, target: id }); revalidatePath('/promocoes', 'layout') }
  return r
}

export async function deleteThemeAction(id: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  await deleteTheme(id); await audit('promocao_tema_excluido', { userId: g.user.id, target: id })
  revalidatePath('/promocoes', 'layout')
  return { ok: true }
}

export async function deleteArtAction(themeId: string, role: string, format: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(themeId) || !THEME_ROLES.includes(role as ThemeRole) || !PROMO_FORMAT_KEYS.includes(format as PromoFormat)) return g.ok ? NO : { ok: false, error: g.error }
  await deleteThemeAsset(themeId, role as ThemeRole, format as PromoFormat)
  revalidatePath('/promocoes', 'layout')
  return { ok: true }
}

export async function updateCampaignAction(id: string, v: { name: string; title: string; validity: string; themeId: string }): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await updateCampaign(id, { name: String(v.name), title: String(v.title).trim().slice(0, 60) || null, validity: String(v.validity).trim().slice(0, 80) || null, themeId: isUuid(v.themeId) ? v.themeId : null })
  if (r.ok) revalidatePath(`/promocoes/${id}`)
  return r
}

export async function deleteCampaignAction(id: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  await deleteCampaign(id); await audit('promocao_excluida', { userId: g.user.id, target: id })
  revalidatePath('/promocoes')
  return { ok: true }
}

export async function updateItemAction(campaignId: string, itemId: string, name: string, price: string, photoId: string | null): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  const p = parsePrice(price)
  if (p === null) return { ok: false, error: 'Preço inválido.' }
  const r = await updateItem(itemId, { name: String(name), price: p, photoImageId: photoId && isUuid(photoId) ? photoId : null })
  if (r.ok) revalidatePath(`/promocoes/${campaignId}`)
  return r
}

export async function removeItemAction(campaignId: string, itemId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId)) return g.ok ? NO : { ok: false, error: g.error }
  await removeItem(itemId); revalidatePath(`/promocoes/${campaignId}`)
  return { ok: true }
}

export async function moveItemAction(campaignId: string, itemId: string, dir: number): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || (dir !== -1 && dir !== 1)) return g.ok ? NO : { ok: false, error: g.error }
  await moveItem(itemId, dir); revalidatePath(`/promocoes/${campaignId}`)
  return { ok: true }
}

export async function addItemAction(campaignId: string, productId: string, price: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !isUuid(productId)) return g.ok ? NO : { ok: false, error: g.error }
  const p = parsePrice(price)
  if (p === null) return { ok: false, error: 'Informe o preço promocional.' }
  const r = await addItem(campaignId, productId, p)
  if (r.ok) revalidatePath(`/promocoes/${campaignId}`)
  return r
}

export async function reorderItemsAction(campaignId: string, ids: string[]): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !Array.isArray(ids) || !ids.every(isUuid)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await reorderItems(campaignId, ids)
  if (r.ok) revalidatePath(`/promocoes/${campaignId}`)
  return r
}
