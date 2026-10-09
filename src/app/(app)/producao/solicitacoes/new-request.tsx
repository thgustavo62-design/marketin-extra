'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { PRIORITIES, REQUEST_TYPES } from '@/lib/domain'
import type { FormState } from '@/lib/form'
import { createRequestAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }

export function NewRequest({ brands, branches, defaultBrandId }: { brands: Brand[]; branches: Branch[]; defaultBrandId?: string }) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const units = branches.filter((b) => b.brand_id === brandId)
  const act = async (prev: FormState, fd: FormData) => {
    const r = await createRequestAction(prev, fd)
    if (r.ok) router.refresh()
    return r
  }
  return (
    <details className="card new-request">
      <summary>Nova solicitação</summary>
      <ActionForm action={act} submit="Enviar solicitação">
        <div className="grid-3">
          <div>
            <label htmlFor="rq-brand">Filial</label>
            <select id="rq-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rq-unit">Unidade</label>
            <select id="rq-unit" name="branch_id" key={brandId} defaultValue="">
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rq-type">Tipo de peça</label>
            <select id="rq-type" name="type" defaultValue="arte">
              {Object.entries(REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="rq-title">Título</label>
        <input id="rq-title" name="title" type="text" maxLength={140} placeholder="Ex.: Arte da oferta de sábado" />
        <label htmlFor="rq-brief">Briefing</label>
        <textarea id="rq-brief" name="briefing" rows={3} maxLength={4000} placeholder="O que precisa ser comunicado, para quem e onde vai ser publicado." />
        <div className="grid-3">
          <div>
            <label htmlFor="rq-prio">Prioridade</label>
            <select id="rq-prio" name="priority" defaultValue="normal">
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rq-due">Prazo</label>
            <input id="rq-due" name="due_at" type="date" />
          </div>
        </div>
        <fieldset className="offer">
          <legend>Se for oferta (opcional)</legend>
          <div className="grid-3">
            <div><label htmlFor="rq-item">Item</label><input id="rq-item" name="offer_item" type="text" maxLength={200} /></div>
            <div><label htmlFor="rq-price">Preço (R$)</label><input id="rq-price" name="offer_price" type="text" inputMode="decimal" /></div>
            <div><label htmlFor="rq-until">Válida até</label><input id="rq-until" name="offer_valid_until" type="date" /></div>
          </div>
        </fieldset>
      </ActionForm>
    </details>
  )
}
