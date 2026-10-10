'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { TARGET_METRICS, type MetricKey } from '@/lib/domain'
import type { FormState } from '@/lib/form'
import { saveTargetAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }
type Person = { id: string; display_name: string }

export function TargetForm({ brands, branches, people, defaultBrandId, defaultMonth }: { brands: Brand[]; branches: Branch[]; people: Record<string, Person[]>; defaultBrandId?: string; defaultMonth: string }) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [key, setKey] = useState<MetricKey>('posts_published')
  const units = branches.filter((b) => b.brand_id === brandId)
  const def = TARGET_METRICS[key]
  const act = async (prev: FormState, fd: FormData) => {
    const r = await saveTargetAction(prev, fd)
    // atualiza a lista fora da ação: ela lê o Windsor e pode demorar; a mensagem de sucesso não deve esperar
    if (r.ok) setTimeout(() => router.refresh(), 0)
    return r
  }
  return (
    <details className="card new-request">
      <summary>Nova meta</summary>
      <ActionForm action={act} submit="Cadastrar meta">
        <div className="grid-3">
          <div>
            <label htmlFor="tg-brand">Filial</label>
            <select id="tg-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tg-unit">Unidade</label>
            <select id="tg-unit" name="branch_id" key={brandId} defaultValue="">
              <option value="">Filial inteira</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tg-month">Mês</label>
            <input id="tg-month" name="month" type="month" defaultValue={defaultMonth} />
          </div>
        </div>
        <div className="grid-3">
          <div>
            <label htmlFor="tg-metric">Indicador</label>
            <select id="tg-metric" name="metric_key" value={key} onChange={(e) => setKey(e.target.value as MetricKey)}>
              {Object.values(TARGET_METRICS).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tg-value">{def.direction === 'atMost' ? 'Teto' : 'Meta'} ({def.unit === 'brl' ? 'R$' : 'quantidade'})</label>
            <input id="tg-value" name="target_value" type="text" inputMode="decimal" placeholder={def.unit === 'brl' ? 'Ex.: 1500,00' : 'Ex.: 12'} />
          </div>
          <div>
            <label htmlFor="tg-owner">Responsável</label>
            <select id="tg-owner" name="owner_id" key={`o-${brandId}`} defaultValue="">
              <option value="">Sem responsável</option>
              {(people[brandId] ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        </div>
        <p className="muted">{def.note}</p>
        <label htmlFor="tg-notes">Observação</label>
        <input id="tg-notes" name="notes" type="text" maxLength={500} />
      </ActionForm>
    </details>
  )
}
