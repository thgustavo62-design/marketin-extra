'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import type { Brand, Campaign } from '@/lib/data'
import { formatBR } from '@/lib/domain'
import { generateWeekAction } from './actions'

export function GerarForm({ brands, campaigns, today, defaultBrandId }: { brands: Brand[]; campaigns: Campaign[]; today: string; defaultBrandId?: string }) {
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const mine = campaigns.filter((c) => c.brand_id === brandId)
  return (
    <ActionForm action={generateWeekAction} submit="Gerar rascunhos" pending="Gerando…">
      <label htmlFor="brand_id">Filial</label>
      <select id="brand_id" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <label htmlFor="start">Primeiro dia da semana</label>
      <input id="start" name="start" type="date" defaultValue={today} required />
      <label htmlFor="campaign_id">Campanha (opcional)</label>
      <select id="campaign_id" name="campaign_id" key={brandId} defaultValue="">
        <option value="">Sem campanha — temas institucionais</option>
        {mine.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatBR(c.starts_on)} a {formatBR(c.ends_on)})</option>)}
      </select>
    </ActionForm>
  )
}
