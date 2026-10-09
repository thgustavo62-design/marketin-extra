'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import type { Branch, Brand } from '@/lib/data'
import { saveMappingAction } from './actions'

export function MappingForm({ brands, branches, discovered }: { brands: Brand[]; branches: Branch[]; discovered: { instagram: string[]; ads: string[] } }) {
  const [kind, setKind] = useState<'instagram' | 'ads'>('ads')
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const mine = branches.filter((b) => b.brand_id === brandId && b.active)
  return (
    <ActionForm action={saveMappingAction} submit="Associar conta" pending="Salvando…">
      <div className="grid-2">
        <div>
          <label htmlFor="kind">Tipo de conta</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'instagram' | 'ads')}>
            <option value="ads">Anúncios (Meta Ads)</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div>
          <label htmlFor="account_name">Nome da conta no Windsor</label>
          <input id="account_name" name="account_name" type="text" list="discovered" autoComplete="off" required />
          <datalist id="discovered">{discovered[kind].map((n) => <option key={n} value={n} />)}</datalist>
        </div>
      </div>
      <div className="grid-2">
        <div>
          <label htmlFor="brand_id">Filial</label>
          <select id="brand_id" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="branch_id">Unidade</label>
          <select id="branch_id" name="branch_id" key={brandId} defaultValue="">
            <option value="">Filial inteira (todas as unidades)</option>
            {mine.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
    </ActionForm>
  )
}
