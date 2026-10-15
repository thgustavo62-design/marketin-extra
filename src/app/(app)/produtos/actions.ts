'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { assignImage, confirmImage, deleteImage, pickProducts, saveProduct, setPostProducts, setPrimaryImage, unlinkImage, type ProductCard } from '@/lib/catalog/store'
import { fetchProductImage } from '@/lib/catalog/open-data'
import { isUuid, str, type FormState } from '@/lib/form'
import { getSession } from '@/lib/session'

type Out = { ok: boolean; message?: string }
const BAD: Out = { ok: false, message: 'Pedido inválido.' }

function refresh(id?: string) {
  revalidatePath('/produtos'); revalidatePath('/produtos/conferir')
  if (id) revalidatePath(`/produtos/${id}`)
}

export async function saveProductAction(_prev: FormState, fd: FormData): Promise<FormState & { id?: string }> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const id = str(fd, 'id')
  if (id && !isUuid(id)) return { error: 'Produto inválido.' }
  const r = await saveProduct(id || null, {
    description: str(fd, 'description'), ean: str(fd, 'ean') || null, group_name: str(fd, 'group_name') || null,
    manufacturer: str(fd, 'manufacturer') || null, active_ingredient: str(fd, 'active_ingredient') || null,
  }, g.user.id)
  if (!r.ok) return { error: r.error }
  await audit(id ? 'produto_editado' : 'produto_criado', { userId: g.user.id, target: r.id })
  refresh(r.id)
  return { ok: 'Produto salvo.', id: r.id }
}

export async function setPrimaryAction(imageId: string, productId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(imageId)) return g.ok ? BAD : { ok: false, message: g.error }
  await setPrimaryImage(imageId); refresh(productId)
  return { ok: true }
}

export async function deleteImageAction(imageId: string, productId?: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(imageId)) return g.ok ? BAD : { ok: false, message: g.error }
  await deleteImage(imageId)
  await audit('produto_imagem_excluida', { userId: g.user.id, target: imageId })
  refresh(productId)
  return { ok: true }
}

export async function unlinkImageAction(imageId: string, productId?: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(imageId)) return g.ok ? BAD : { ok: false, message: g.error }
  await unlinkImage(imageId); refresh(productId)
  return { ok: true, message: 'A imagem voltou para a fila de conferência.' }
}

export async function confirmImageAction(imageId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(imageId)) return g.ok ? BAD : { ok: false, message: g.error }
  await confirmImage(imageId); refresh()
  return { ok: true }
}

export async function assignImageAction(imageId: string, productId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(imageId) || !isUuid(productId)) return g.ok ? BAD : { ok: false, message: g.error }
  const r = await assignImage(imageId, productId)
  if (!r.ok) return { ok: false, message: r.error }
  refresh(productId)
  return { ok: true }
}

export async function openImageAction(productId: string): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(productId)) return g.ok ? BAD : { ok: false, message: g.error }
  const r = await fetchProductImage(productId, g.user.id)
  if (r.ok) await audit('produto_imagem_aberta', { userId: g.user.id, target: productId })
  refresh(productId)
  return r
}

/** Busca para os seletores de produto (qualquer pessoa logada). */
export async function searchProductsAction(q: string): Promise<ProductCard[]> {
  const user = await getSession()
  if (!user || user.mustChange) return []
  return pickProducts(String(q).slice(0, 80), 10)
}

export async function setPostProductsAction(postId: string, productIds: string[]): Promise<Out> {
  const g = await writerOrError()
  if (!g.ok || !isUuid(postId) || !Array.isArray(productIds) || !productIds.every(isUuid)) return g.ok ? BAD : { ok: false, message: g.error }
  if (!(await rowAllowed(g.user, 'posts', postId))) return { ok: false, message: 'Conteúdo não encontrado.' }
  await setPostProducts(postId, productIds, g.user.id)
  revalidatePath('/planejamento/conteudos')
  return { ok: true }
}
