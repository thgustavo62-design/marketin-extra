'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import type { ProductDetail } from '@/lib/catalog/store'
import { saveProductAction } from './actions'

export function ProductForm({ product, canEdit }: { product?: ProductDetail; canEdit: boolean }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveProductAction, {})
  useEffect(() => { if (state.ok && state.id && !product) router.push(`/produtos/${state.id}`) }, [state, product, router])
  return (
    <form action={action} className="stack-form wide">
      {product && <input type="hidden" name="id" value={product.id} />}
      <label htmlFor="pf-desc">Descrição (como está no ERP)</label>
      <input id="pf-desc" name="description" type="text" maxLength={300} required defaultValue={product?.description ?? ''} disabled={!canEdit} />
      <div className="grid-3">
        <div><label htmlFor="pf-ean">Código de barras (EAN)</label><input id="pf-ean" name="ean" type="text" inputMode="numeric" maxLength={14} defaultValue={product?.ean ?? ''} disabled={!canEdit} /></div>
        <div><label htmlFor="pf-group">Grupo</label><input id="pf-group" name="group_name" type="text" maxLength={80} defaultValue={product?.group_name ?? ''} disabled={!canEdit} /></div>
        <div><label htmlFor="pf-lab">Laboratório / marca</label><input id="pf-lab" name="manufacturer" type="text" maxLength={120} defaultValue={product?.manufacturer ?? ''} disabled={!canEdit} /></div>
      </div>
      <label htmlFor="pf-ing">Princípio ativo</label>
      <input id="pf-ing" name="active_ingredient" type="text" maxLength={200} defaultValue={product?.active_ingredient ?? ''} disabled={!canEdit} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.ok && <p className="form-ok" role="status">{state.ok}</p>}
      {canEdit && <div className="form-actions"><button type="submit" className="primary" disabled={pending}>{pending ? 'Salvando…' : product ? 'Salvar alterações' : 'Cadastrar produto'}</button></div>}
    </form>
  )
}
