'use client'

// Histórico: versões da arte (elementos, fundo e textos) com restauração, e o registro de quem mexeu em preço/nome/foto dos encartes.
import { useCallback, useEffect, useState, useTransition } from 'react'
import { History, X } from 'lucide-react'
import type { AuditRow, VersionRow } from '@/lib/promo/history'
import { createVersionAction, listHistoryAction, restoreVersionAction } from '../actions'

const KIND: Record<VersionRow['kind'], string> = { manual: 'Versão salva', aprovacao: 'Aprovação', auto: 'Automática', 'antes-de-restaurar': 'Antes de restaurar' }
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function HistoryPanel({ campaignId, isDesign, canEdit, flush, onClose }: { campaignId: string; isDesign: boolean; canEdit: boolean; flush: () => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<'versoes' | 'alteracoes'>('versoes')
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, start] = useTransition()

  const load = useCallback(async () => {
    const r = await listHistoryAction(campaignId)
    if (r) { setVersions(r.versions); setAudit(r.audit) }
  }, [campaignId])
  useEffect(() => { void load() }, [load])

  const save = () => start(async () => {
    await flush() // grava o que ainda está pendente na tela antes de tirar o retrato
    const r = await createVersionAction(campaignId, label)
    setMsg(r.ok ? { ok: true, text: 'Versão salva.' } : { ok: false, text: r.error ?? 'Não foi possível salvar.' })
    if (r.ok) { setLabel(''); await load() }
  })
  const restore = (v: VersionRow) => {
    if (!confirm(`Voltar a arte para a versão de ${when(v.created_at)}? O estado atual fica guardado em "Antes de restaurar".`)) return
    start(async () => {
      await flush()
      const r = await restoreVersionAction(campaignId, v.id)
      if (r.ok) window.location.reload(); else setMsg({ ok: false, text: r.error ?? 'Não foi possível restaurar.' })
    })
  }

  return (
    <section className="card history-panel" aria-label="Histórico">
      <div className="canva-check-head">
        <h3><History size={15} style={{ verticalAlign: -2 }} /> Histórico</h3>
        <div className="canva-chips" role="tablist" aria-label="Tipo de histórico" style={{ margin: 0 }}>
          <button type="button" role="tab" aria-selected={tab === 'versoes'} className={tab === 'versoes' ? 'on' : ''} onClick={() => setTab('versoes')}>Versões da arte ({versions.length})</button>
          {!isDesign && <button type="button" role="tab" aria-selected={tab === 'alteracoes'} className={tab === 'alteracoes' ? 'on' : ''} onClick={() => setTab('alteracoes')}>Alterações nos encartes ({audit.length})</button>}
        </div>
        <button type="button" className="mini-btn" onClick={onClose} aria-label="Fechar o histórico"><X size={12} /></button>
      </div>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      {tab === 'versoes' && (
        <>
          <p className="muted">Uma versão guarda os elementos livres, o fundo e os textos {isDesign ? 'e o número de peças ' : ''}do momento. {isDesign ? '' : 'Nome, preço e foto dos encartes não entram (veja "Alterações nos encartes"). '}Há uma versão automática a cada 20 minutos de edição e uma a cada aprovação.</p>
          {canEdit && (
            <div className="form-actions" style={{ alignItems: 'end' }}>
              <div style={{ flex: 1 }}><label htmlFor="ver-label">Nome da versão (opcional)</label><input id="ver-label" type="text" value={label} maxLength={80} placeholder="Ex.: Antes de trocar o fundo" onChange={(e) => setLabel(e.target.value)} /></div>
              <button type="button" className="secondary" disabled={busy} onClick={save}>Salvar versão agora</button>
            </div>
          )}
          {versions.length === 0 ? <p className="empty">Nenhuma versão ainda.</p> : (
            <ul className="history-list">
              {versions.map((v) => (
                <li key={v.id} data-version={v.id} data-kind={v.kind}>
                  <span className="badge">{KIND[v.kind]}</span>
                  <span className="canva-name">{v.label ?? KIND[v.kind]}<small>{when(v.created_at)}{v.user_name ? ` · ${v.user_name}` : ''} · {v.elements} elemento(s)</small></span>
                  {canEdit && <button type="button" className="mini-btn" disabled={busy} aria-label={`Restaurar a versão de ${when(v.created_at)}`} onClick={() => restore(v)}>Restaurar</button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'alteracoes' && !isDesign && (
        audit.length === 0 ? <p className="empty">Nenhuma alteração nos encartes registrada ainda.</p> : (
          <ul className="history-list">
            {audit.map((a) => (
              <li key={a.id} data-audit={a.field}>
                <span className="badge">{a.field}</span>
                <span className="canva-name">{a.item_name}<small>{a.old_value || a.new_value ? `${a.old_value ?? '—'} → ${a.new_value ?? '—'}` : ''} · {when(a.at)}{a.user_name ? ` · ${a.user_name}` : ''}</small></span>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
