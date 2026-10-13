'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { PILLARS, STAGES, formatBR, type PlanKind, type PlanPreviewRow } from '@/lib/domain'
import { confirmPlanImportAction } from '../actions'

const KIND: Record<PlanKind, string> = { reel: 'Reel', institucional: 'Feed', carrossel: 'Carrossel', stories: 'Stories (Feed)', outro: 'Outro' }

export function PreviewForm({ id, rows, users, defaultCampaignName }: { id: string; rows: PlanPreviewRow[]; users: { id: string; display_name: string }[]; defaultCampaignName: string }) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(rows.filter((r) => r.checked).map((r) => r.index)))
  const [campaign, setCampaign] = useState(true)
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const n = sel.size

  return (
    <ActionForm action={confirmPlanImportAction} submit={`Importar ${n} ${n === 1 ? 'peça' : 'peças'}`} pending="Importando… (pode levar até 1 minuto)" className="stack-form pi-form">
      <input type="hidden" name="id" value={id} />

      <fieldset className="offer pi-options">
        <legend>Como importar</legend>
        <div className="pi-grid">
          <div>
            <label htmlFor="pi-stage">Etapa inicial</label>
            <select id="pi-stage" name="initial_stage" defaultValue="auto">
              <option value="auto">Automática (Briefing se o PDF traz o briefing; senão Ideia)</option>
              <option value="briefing">{STAGES.briefing}</option>
              <option value="ideia">{STAGES.ideia}</option>
            </select>
          </div>
          <div>
            <label htmlFor="pi-lead">Prazo de produção (dias antes da publicação)</label>
            <input id="pi-lead" name="lead_days" type="number" min={0} max={14} defaultValue={3} />
          </div>
          <div>
            <label htmlFor="pi-assigned">Responsável pelos cartões (opcional)</label>
            <select id="pi-assigned" name="assigned_to" defaultValue="">
              <option value="">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pi-reviewer">Revisor (opcional)</label>
            <select id="pi-reviewer" name="reviewer_id" defaultValue="">
              <option value="">Sem revisor</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </div>
        </div>
        <label className="check inline"><input type="checkbox" name="create_campaign" checked={campaign} onChange={(e) => setCampaign(e.target.checked)} /> Criar uma campanha para este plano e ligar as pautas a ela</label>
        {campaign && (
          <>
            <label htmlFor="pi-camp">Nome da campanha</label>
            <input id="pi-camp" name="campaign_name" type="text" maxLength={120} defaultValue={defaultCampaignName} />
          </>
        )}
      </fieldset>

      <div className="pi-toolbar" role="group" aria-label="Seleção">
        <b data-selected-count>{n} de {rows.length} marcadas</b>
        <button type="button" className="mini-btn" onClick={() => setSel(new Set(rows.map((r) => r.index)))}>Marcar todas</button>
        <button type="button" className="mini-btn" onClick={() => setSel(new Set())}>Desmarcar todas</button>
        <button type="button" className="mini-btn" onClick={() => setSel(new Set(rows.filter((r) => r.checked).map((r) => r.index)))}>Só futuras e novas</button>
      </div>

      <div className="table-wrap">
        <table data-table="previa" className="pi-table">
          <thead><tr><th><span className="sr-only">Importar</span></th><th>Data</th><th>Código</th><th>Formato</th><th>Tema</th><th>Pilar</th><th>Etapa</th><th>Tarefas</th><th>Atenção</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} data-code={r.code} data-past={r.past ? 'sim' : 'nao'} data-duplicate={r.duplicate ? 'sim' : 'nao'}>
                <td><input type="checkbox" name="sel" value={r.index} checked={sel.has(r.index)} onChange={() => toggle(r.index)} aria-label={`Importar ${r.code}`} /></td>
                <td><b>{formatBR(r.date).slice(0, 5)}</b> <small className="muted">{r.weekday}</small><br /><small className="muted">{r.timesText || 'sem horário'}</small></td>
                <td><code>{r.code}</code></td>
                <td>{KIND[r.kind]}</td>
                <td>{r.theme}</td>
                <td>
                  <select name={`pillar_${r.index}`} defaultValue={r.pillar} aria-label={`Pilar de ${r.code}`}>
                    {Object.entries(PILLARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><small>{STAGES[r.stage]}</small></td>
                <td>{r.tasks}</td>
                <td><div className="pi-flags">
                  {r.past && <span className="pill off">data já passou</span>}
                  {r.duplicate && <span className="pill off">já existe no calendário</span>}
                  {r.sameDay > 0 && !r.duplicate && <span className="pill soft">já há {r.sameDay} no dia</span>}
                  {!r.hasBrief && <span className="pill soft">sem briefing</span>}
                  {r.adIssues > 0 && <span className="pill soft">RDC 96: {r.adIssues} ponto(s)</span>}
                  {r.medicine && <span className="pill soft">cita medicamento</span>}
                  {r.notes.map((t, i) => <small key={i} className="pi-note">{t}</small>)}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  )
}
