'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { deleteLibraryItem, importLibraryToCampaign, updateLibraryItem } from '@/lib/promo/library'
import { isUuid } from '@/lib/form'
import { PROMO_FORMAT_KEYS, parsePrice, type ItemStyle, type PromoFormat, type PromoOverrides } from '@/lib/domain/promo'
import { addItem, approveCampaign, createTheme, deleteCampaign, deleteTheme, deleteThemeAsset, moveItem, patchItem, removeItem, reorderItems, deleteAsset, saveLayers, saveOverrides, saveThemeConfig, setItemProduct, THEME_ROLES, ungroupItem, updateCampaign, type SizeEdit, type ThemeRole } from '@/lib/promo/store'

type Out = { ok: boolean; error?: string; id?: string }
const refresh = (id: string) => { revalidatePath(`/promocoes/${id}`); revalidatePath(`/editor/${id}`) }
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
  if (r.ok) refresh(id)
  return r
}

export async function deleteCampaignAction(id: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  await deleteCampaign(id); await audit('promocao_excluida', { userId: g.user.id, target: id })
  revalidatePath('/promocoes')
  return { ok: true }
}

export async function updateItemAction(campaignId: string, itemId: string, name: string, price: string, photoId: string | null, sizes?: SizeEdit[]): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  const p = parsePrice(price)
  if (p === null) return { ok: false, error: 'Preço inválido.' }
  const r = await patchItem(itemId, { name: String(name), price: p, photoImageId: photoId && isUuid(photoId) ? photoId : null, sizes: Array.isArray(sizes) ? sizes.slice(0, 12).map((x) => ({ label: String(x?.label ?? ''), units: x?.units === null || x?.units === undefined ? null : Number(x.units) })) : undefined })
  if (r.ok) refresh(campaignId)
  return r
}

/** Edição fina do encarte: preço original, subtítulo, estilo (etiqueta, cores, alinhamento, tamanho do nome) e mostrar/ocultar fragrâncias ou tabela de tamanhos. */
export async function patchItemAction(campaignId: string, itemId: string, patch: { oldPrice?: string | null; note?: string | null; style?: ItemStyle; showVariants?: boolean }): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  let oldPrice: number | null | undefined
  if (patch.oldPrice !== undefined) {
    const raw = patch.oldPrice === null ? '' : String(patch.oldPrice).trim()
    oldPrice = raw === '' ? null : parsePrice(raw)
    if (oldPrice === null && raw !== '') return { ok: false, error: 'Preço original inválido.' }
  }
  const r = await patchItem(itemId, { oldPrice, note: patch.note === undefined ? undefined : patch.note === null ? null : String(patch.note), style: patch.style, showVariants: typeof patch.showVariants === 'boolean' ? patch.showVariants : undefined })
  if (r.ok) refresh(campaignId)
  return r
}

export async function setItemProductAction(campaignId: string, itemId: string, productId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || !isUuid(campaignId) || !isUuid(productId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await setItemProduct(itemId, productId)
  if (r.ok) refresh(campaignId)
  return r
}

export async function saveOverridesAction(campaignId: string, o: PromoOverrides): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await saveOverrides(campaignId, o)
  if (r.ok) refresh(campaignId)
  return r
}

export async function saveLayersAction(campaignId: string, layers: unknown): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await saveLayers(campaignId, layers)
  if (r.ok) refresh(campaignId)
  return { ok: r.ok, error: r.error }
}

export async function removeItemAction(campaignId: string, itemId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId)) return g.ok ? NO : { ok: false, error: g.error }
  await removeItem(itemId); refresh(campaignId)
  return { ok: true }
}

export async function moveItemAction(campaignId: string, itemId: string, dir: number): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(itemId) || (dir !== -1 && dir !== 1)) return g.ok ? NO : { ok: false, error: g.error }
  await moveItem(itemId, dir); refresh(campaignId)
  return { ok: true }
}

export async function addItemAction(campaignId: string, productId: string, price: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !isUuid(productId)) return g.ok ? NO : { ok: false, error: g.error }
  const p = parsePrice(price)
  if (p === null) return { ok: false, error: 'Informe o preço promocional.' }
  const r = await addItem(campaignId, productId, p)
  if (r.ok) refresh(campaignId)
  return r
}

export async function reorderItemsAction(campaignId: string, ids: string[]): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !Array.isArray(ids) || !ids.every(isUuid)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await reorderItems(campaignId, ids)
  if (r.ok) refresh(campaignId)
  return r
}

export async function approveCampaignAction(campaignId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await approveCampaign(campaignId, g.user.id)
  if (r.ok) { await audit('promocao_aprovada', { userId: g.user.id, target: campaignId }); refresh(campaignId); revalidatePath('/promocoes') }
  return r
}

export async function ungroupItemAction(campaignId: string, itemId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !isUuid(itemId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await ungroupItem(itemId)
  if (r.ok) refresh(campaignId)
  return r
}

export async function deleteAssetAction(campaignId: string, assetId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !isUuid(assetId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await deleteAsset(campaignId, assetId)
  if (r.ok) refresh(campaignId)
  return r
}

// ---------- biblioteca de imagens ----------
export async function updateLibraryItemAction(id: string, name: string, category: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await updateLibraryItem(id, { name, category })
  if (r.ok) revalidatePath('/promocoes/biblioteca')
  return r
}

export async function deleteLibraryItemAction(id: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(id)) return g.ok ? NO : { ok: false, error: g.error }
  if (!(await deleteLibraryItem(id))) return { ok: false, error: 'Imagem não encontrada.' }
  await audit('promocao_biblioteca_excluida', { userId: g.user.id, target: id })
  revalidatePath('/promocoes/biblioteca')
  return { ok: true }
}

/** Traz uma imagem da biblioteca para a promoção (para usar como elemento ou fundo). */
export async function useLibraryImageAction(campaignId: string, libraryId: string): Promise<{ ok: boolean; error?: string; id?: string; width?: number; height?: number }> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(campaignId) || !isUuid(libraryId)) return g.ok ? NO : { ok: false, error: g.error }
  const r = await importLibraryToCampaign(campaignId, libraryId, g.user.id)
  return r.ok ? { ok: true, id: r.id, width: r.width, height: r.height } : { ok: false, error: r.error }
}
