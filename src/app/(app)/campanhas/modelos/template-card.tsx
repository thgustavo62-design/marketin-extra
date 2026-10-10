'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FORMATS, formatBR, type Format } from '@/lib/domain'
import { generateTemplateAction, toggleTemplateAction } from './actions'

export type Upcoming = { start: string; end: string; state: 'generated' | 'cancelled' | 'ready' | 'later'; generateFrom: string }
type Summary = {
  id: string; name: string; brand_name: string; branch_name: string | null; active: boolean; objective: string; lead_days: number
  deliverables: { format: Format; quantity: number; publish_offset_days: number }[]; pending_reconfirm: number
}

const STATE_LABEL: Record<Upcoming['state'], string> = { generated: 'Já gerada', cancelled: 'Cancelada', ready: 'Pronta para gerar', later: 'Ainda fora da janela' }

export function TemplateCard({ t, summary, upcoming, canEdit }: { t: Summary; summary: string; upcoming: Upcoming[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function generate() {
    setBusy(true); setMsg(null)
    const r = await generateTemplateAction(t.id)
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
    const text = r.none
      ? `Nenhuma ocorrência começa entre ${formatBR(r.from)} e ${formatBR(r.to)}.`
      : r.created === 0
        ? `Nada novo: ${r.existing} ${r.existing === 1 ? 'ocorrência já existia' : 'ocorrências já existiam'}.`
        : `${r.created} ${r.created === 1 ? 'campanha criada' : 'campanhas criadas'} com ${r.posts} ${r.posts === 1 ? 'cartão' : 'cartões'}${r.existing ? ` (${r.existing} já existiam)` : ''}. Reconfirme preços e validade antes de enviar para aprovação.`
    setMsg({ kind: 'ok', text })
    router.refresh()
  }

  async function toggle() {
    setBusy(true); setMsg(null)
    const r = await toggleTemplateAction(t.id, !t.active)
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
    router.refresh()
  }

  return (
    <article className={`card${t.active ? '' : ' muted-card'}`} data-template={t.name}>
      <h3>{t.name} {!t.active && <span className="pill off">Pausado</span>}</h3>
      <p className="muted">{t.brand_name} · {t.branch_name ?? 'todas as unidades'} · {summary}</p>
      {t.objective && <p>{t.objective}</p>}
      <p className="muted">
        Entregas: {t.deliverables.map((d) => `${d.quantity}× ${FORMATS[d.format]}`).join(', ') || '—'} · gera com {t.lead_days} dia{t.lead_days === 1 ? '' : 's'} de antecedência
      </p>
      {t.pending_reconfirm > 0 && (
        <p className="form-error"><b>{t.pending_reconfirm}</b> {t.pending_reconfirm === 1 ? 'campanha aguarda' : 'campanhas aguardam'} reconfirmação de preços e validade.</p>
      )}
      <ul className="occurrences">
        {upcoming.length === 0 && <li className="muted">Nenhuma ocorrência nos próximos dias.</li>}
        {upcoming.map((u) => (
          <li key={u.start} data-state={u.state}>
            <b>{formatBR(u.start)}{u.end !== u.start ? ` a ${formatBR(u.end)}` : ''}</b> — {STATE_LABEL[u.state]}
            {u.state === 'later' && <small className="muted"> (gera a partir de {formatBR(u.generateFrom)})</small>}
          </li>
        ))}
      </ul>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="card-actions">
        <Link href={`/campanhas/modelos/${t.id}`}>{canEdit ? 'Abrir e editar' : 'Abrir'}</Link>
        {canEdit && t.active && <button type="button" className="primary" disabled={busy} onClick={generate}>{busy ? 'Gerando…' : 'Gerar próximas ocorrências'}</button>}
        {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={toggle}>{t.active ? 'Pausar' : 'Retomar'}</button>}
      </div>
    </article>
  )
}
