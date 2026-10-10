'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { FORMATS, REPORT_TYPES } from '@/lib/domain'
import { generateReportAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }
type Camp = { id: string; brand_id: string; name: string }

export function ReportForm({ brands, branches, campaigns, defaultBrandId, defaultBranchId, today }: { brands: Brand[]; branches: Branch[]; campaigns: Camp[]; defaultBrandId?: string; defaultBranchId?: string; today: string }) {
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [preset, setPreset] = useState<'semana' | 'mes' | 'custom'>('semana')
  const units = branches.filter((b) => b.brand_id === brandId)
  return (
    <ActionForm action={generateReportAction} submit="Gerar relatório" pending="Gerando…">
      <div className="grid-3">
        <div>
          <label htmlFor="rp-brand">Filial</label>
          <select id="rp-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rp-unit">Unidade</label>
          <select id="rp-unit" name="branch_id" key={brandId} defaultValue={brandId === defaultBrandId ? (defaultBranchId ?? '') : ''}>
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rp-type">Tipo</label>
          <select id="rp-type" name="type" defaultValue="operacional">
            {Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid-3">
        <div>
          <label htmlFor="rp-preset">Período</label>
          <select id="rp-preset" name="preset" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
            <option value="semana">Semana (segunda a domingo)</option>
            <option value="mes">Mês</option>
            <option value="custom">Personalizado (até 93 dias)</option>
          </select>
        </div>
        {preset !== 'custom' ? (
          <div>
            <label htmlFor="rp-ref">Contendo a data</label>
            <input id="rp-ref" name="ref" type="date" defaultValue={today} />
          </div>
        ) : (
          <>
            <div><label htmlFor="rp-from">De</label><input id="rp-from" name="from" type="date" defaultValue={today} /></div>
            <div><label htmlFor="rp-to">Até</label><input id="rp-to" name="to" type="date" defaultValue={today} /></div>
          </>
        )}
      </div>
      <div className="grid-3">
        <div>
          <label htmlFor="rp-format">Formato (opcional)</label>
          <select id="rp-format" name="format" defaultValue="">
            <option value="">Todos</option>
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rp-camp">Campanha (opcional)</label>
          <select id="rp-camp" name="campaign_id" key={`c-${brandId}`} defaultValue="">
            <option value="">Todas</option>
            {campaigns.filter((c) => c.brand_id === brandId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <p className="muted">O relatório usa só o que está guardado no sistema (conteúdos, publicações e coletas) e informa a data da última coleta. Orgânico (Instagram) e pago (Meta Ads) ficam em seções separadas.</p>
    </ActionForm>
  )
}
