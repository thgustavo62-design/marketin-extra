'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { FORMATS, FREQUENCIES, PRIORITIES, type Frequency } from '@/lib/domain'
import type { Template } from '@/lib/data'
import { saveTemplateAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }
type Person = { id: string; display_name: string }

const ROWS = 6
const DOW_LABEL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

export function TemplateForm({
  template, brands, branches, people, defaultBrandId,
}: { template?: Template; brands: Brand[]; branches: Branch[]; people: Record<string, Person[]>; defaultBrandId?: string }) {
  const [brandId, setBrandId] = useState(template?.brand_id ?? defaultBrandId ?? brands[0]?.id ?? '')
  const [freq, setFreq] = useState<Frequency>(template?.frequency ?? 'weekly')
  const units = branches.filter((b) => b.brand_id === brandId)
  const team = people[brandId] ?? []
  const dels = template?.deliverables ?? [{ format: 'feed' as const, quantity: 1, publish_offset_days: 0 }]
  const locked = Boolean(template)

  return (
    <ActionForm action={saveTemplateAction} submit={template ? 'Salvar modelo' : 'Criar modelo'} secondary={<Link href="/campanhas/modelos" className="btn">Voltar</Link>}>
      {template && <input type="hidden" name="id" value={template.id} />}
      {locked && <input type="hidden" name="brand_id" value={brandId} />}

      <h3 className="eyebrow">Identificação</h3>
      <div className="grid-3">
        <div>
          <label htmlFor="tp-name">Nome</label>
          <input id="tp-name" name="name" type="text" maxLength={120} defaultValue={template?.name ?? ''} placeholder="Ex.: Fim de Semana da Limpeza" />
        </div>
        <div>
          <label htmlFor="tp-brand">Filial</label>
          <select id="tp-brand" name={locked ? undefined : 'brand_id'} value={brandId} disabled={locked} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tp-unit">Unidade</label>
          <select id="tp-unit" name="branch_id" key={brandId} defaultValue={template && template.brand_id === brandId ? (template.branch_id ?? '') : ''}>
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor="tp-obj">Objetivo</label>
      <input id="tp-obj" name="objective" type="text" maxLength={500} defaultValue={template?.objective ?? ''} placeholder="Ex.: aumentar a venda de limpeza no fim de semana" />
      <label htmlFor="tp-brief">Briefing padrão</label>
      <textarea id="tp-brief" name="briefing" rows={3} maxLength={4000} defaultValue={template?.briefing ?? ''} placeholder="Tom, público e orientações. Não coloque preços nem validades aqui: eles são confirmados a cada campanha." />

      <h3 className="eyebrow">Quando acontece</h3>
      <div className="grid-3">
        <div>
          <label htmlFor="tp-freq">Frequência</label>
          <select id="tp-freq" name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
            {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {freq === 'weekly' && (
          <div>
            <label htmlFor="tp-dow">Começa na</label>
            <select id="tp-dow" name="start_dow" defaultValue={String(template?.start_dow ?? 5)}>
              {DOW_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {freq === 'biweekly' && (
          <div>
            <label htmlFor="tp-anchor">Primeira ocorrência</label>
            <input id="tp-anchor" name="anchor_date" type="date" defaultValue={template?.anchor_date ?? ''} />
          </div>
        )}
        {freq === 'monthly' && (
          <div>
            <label htmlFor="tp-dom">Dia do mês</label>
            <input id="tp-dom" name="day_of_month" type="number" min={1} max={31} defaultValue={template?.day_of_month ?? 1} />
          </div>
        )}
        <div>
          <label htmlFor="tp-dur">Dura (dias)</label>
          <input id="tp-dur" name="duration_days" type="number" min={1} max={31} defaultValue={template?.duration_days ?? 1} />
        </div>
      </div>
      {freq === 'dates' && (
        <>
          <label htmlFor="tp-dates">Datas (uma por linha: 24/12/2026 ou 2026-12-24)</label>
          <textarea id="tp-dates" name="specific_dates" rows={4} defaultValue={(template?.specific_dates ?? []).join('\n')} />
        </>
      )}
      <div className="grid-3">
        <div><label htmlFor="tp-vf">Vigência: de</label><input id="tp-vf" name="valid_from" type="date" defaultValue={template?.valid_from ?? ''} /></div>
        <div><label htmlFor="tp-vt">Vigência: até</label><input id="tp-vt" name="valid_to" type="date" defaultValue={template?.valid_to ?? ''} /></div>
      </div>

      <h3 className="eyebrow">Prazos (dias antes do início)</h3>
      <div className="grid-3">
        <div><label htmlFor="tp-lead">Gerar com antecedência de</label><input id="tp-lead" name="lead_days" type="number" min={0} max={60} defaultValue={template?.lead_days ?? 7} /></div>
        <div><label htmlFor="tp-bd">Briefing pronto em D-</label><input id="tp-bd" name="briefing_days" type="number" min={0} max={60} defaultValue={template?.briefing_days ?? 7} /></div>
        <div><label htmlFor="tp-cd">Peças criadas em D-</label><input id="tp-cd" name="creation_days" type="number" min={0} max={60} defaultValue={template?.creation_days ?? 5} /></div>
        <div><label htmlFor="tp-ad">Aprovação em D-</label><input id="tp-ad" name="approval_days" type="number" min={0} max={60} defaultValue={template?.approval_days ?? 2} /></div>
        <div>
          <label htmlFor="tp-prio">Prioridade</label>
          <select id="tp-prio" name="priority" defaultValue={template?.priority ?? 'normal'}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <h3 className="eyebrow">Entregas</h3>
      <p className="muted">Cada linha vira cartões no quadro. “Publica no dia” conta a partir do início da campanha (0 = no primeiro dia).</p>
      {Array.from({ length: ROWS }, (_, i) => {
        const d = dels[i]
        return (
          <div className="grid-3 deliverable-row" key={`${i}-${d ? d.format : ''}`}>
            <select name={`del_format_${i}`} aria-label={`Formato da entrega ${i + 1}`} defaultValue={d?.format ?? ''}>
              <option value="">{i === 0 ? 'Escolha o formato' : '— nenhuma —'}</option>
              {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name={`del_qty_${i}`} type="number" min={1} max={10} aria-label={`Quantidade da entrega ${i + 1}`} placeholder="Qtd." defaultValue={d?.quantity ?? ''} />
            <input name={`del_off_${i}`} type="number" min={0} max={31} aria-label={`Publica no dia (deslocamento) da entrega ${i + 1}`} placeholder="Publica no dia +" defaultValue={d?.publish_offset_days ?? ''} />
          </div>
        )
      })}

      <h3 className="eyebrow">Equipe e conferência</h3>
      <div className="grid-3">
        <div>
          <label htmlFor="tp-owner">Responsável padrão</label>
          <select id="tp-owner" name="default_owner" key={`o-${brandId}`} defaultValue={template?.default_owner ?? ''}>
            <option value="">Sem responsável</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tp-rev">Aprovador padrão</label>
          <select id="tp-rev" name="default_reviewer" key={`r-${brandId}`} defaultValue={template?.default_reviewer ?? ''}>
            <option value="">Só administrador</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor="tp-check">Checklist de conferência (um item por linha)</label>
      <textarea id="tp-check" name="checklist" rows={4} defaultValue={(template?.checklist ?? []).join('\n')} placeholder={'Conferir estoque nas lojas\nConferir texto legal da oferta'} />
      <p className="muted">Os marcos de prazo e a reconfirmação de produtos, preços, validade e estoque entram sozinhos em todo cartão gerado.</p>
    </ActionForm>
  )
}
