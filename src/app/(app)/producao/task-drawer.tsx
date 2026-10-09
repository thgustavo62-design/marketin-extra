'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, Lock, Plus, Trash2, X } from 'lucide-react'
import { FORMATS, PILLARS, PRIORITIES, STAGES, STAGE_ORDER, formatBR, type Priority, type Stage } from '@/lib/domain'
import type { TaskDetail } from '@/lib/data'
import {
  addChecklistAction, addCommentAction, deleteChecklistAction, getTaskDetailAction, moveCardAction, toggleChecklistAction, updateTaskAction,
} from './actions'

const fmtTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

// Detalhe da tarefa: campos de produção, etapa, checklist, comentários e histórico. Quem só pode ver não vê os campos de edição.
export function TaskDrawer({ cardId, canEdit, onClose, onChanged }: { cardId: string | null; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [item, setItem] = useState('')
  const [comment, setComment] = useState('')
  const [f, setF] = useState({ assigned_to: '', reviewer_id: '', priority: 'normal', due_at: '', blocked_reason: '', post_date: '' })

  const load = useCallback(async (id: string) => {
    const r = await getTaskDetailAction(id)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); setDetail(null); return }
    setDetail(r.detail)
    const c = r.detail.card
    setF({ assigned_to: c.assigned_to ?? '', reviewer_id: c.reviewer_id ?? '', priority: c.priority, due_at: c.due_at ?? '', blocked_reason: c.blocked_reason ?? '', post_date: c.post_date })
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (cardId) {
      setMsg(null); setDetail(null)
      if (!d.open) d.showModal()
      void load(cardId)
    } else if (d.open) d.close()
  }, [cardId, load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; conflict?: boolean; warning?: string }>, okText?: string) => {
    setBusy(true); setMsg(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error ?? 'Não foi possível concluir.' }); if (r.conflict && cardId) await load(cardId); onChanged(); return false }
    setMsg({ kind: 'ok', text: [okText, r.warning].filter(Boolean).join(' ') })
    if (cardId) await load(cardId)
    onChanged()
    return true
  }

  const c = detail?.card
  const stageLabel = (s: Stage | null) => (s ? STAGES[s] : 'Criado')

  return (
    <dialog ref={ref} className="modal light drawer" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close() }}>
      <div className="modal-head">
        <h3>{c ? c.title : 'Carregando…'}</h3>
        <button type="button" className="ghost" aria-label="Fechar" onClick={() => ref.current?.close()}><X size={18} /></button>
      </div>

      {!c ? (
        <div className="drawer-body">{msg ? <p className="form-error" role="alert">{msg.text}</p> : <p className="muted">Carregando…</p>}</div>
      ) : (
        <div className="drawer-body">
          <p className="muted">
            {c.brand_name} · {c.branch_name ?? 'Todas as unidades'} · {FORMATS[c.format]} · {PILLARS[c.pillar]}
            {c.campaign_name && <> · Campanha: {c.campaign_name}</>}
          </p>
          <p><Link href={`/planejamento/conteudos/${c.id}`} className="inline-link"><ExternalLink size={13} /> Abrir editor completo (legenda, roteiro, Reels)</Link></p>
          {c.blocked_reason && <div className="notice"><Lock size={16} /><span><b>Bloqueado:</b> {c.blocked_reason}</span></div>}
          {c.conflict && <div className="notice"><AlertTriangle size={16} /><span>Há outra publicação desta filial/unidade no mesmo dia e horário.</span></div>}
          {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

          <section>
            <h4>Etapa</h4>
            <select value={c.stage} disabled={!canEdit || busy} aria-label="Etapa"
              onChange={async (e) => {
                const to = e.target.value as Stage
                let confirm = false
                if (to === 'publicado') { confirm = window.confirm('Confirmar que este conteúdo foi publicado de verdade? Agendar não é publicar.'); if (!confirm) return }
                await run(() => moveCardAction(c.id, to, c.revision, { confirmPublish: confirm }), `Movido para ${STAGES[to]}.`)
              }}>
              {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGES[s]}</option>)}
            </select>
          </section>

          <section>
            <h4>Produção</h4>
            <div className="grid-2">
              <div><label>Responsável</label>
                <select aria-label="Responsável" value={f.assigned_to} disabled={!canEdit} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {detail.assignable.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select></div>
              <div><label>Revisor / aprovador</label>
                <select aria-label="Revisor" value={f.reviewer_id} disabled={!canEdit} onChange={(e) => setF({ ...f, reviewer_id: e.target.value })}>
                  <option value="">Sem revisor</option>
                  {detail.assignable.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select></div>
            </div>
            <div className="grid-3">
              <div><label>Prioridade</label>
                <select aria-label="Prioridade" value={f.priority} disabled={!canEdit} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                  {(Object.keys(PRIORITIES) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITIES[p]}</option>)}
                </select></div>
              <div><label>Prazo de produção</label><input aria-label="Prazo de produção" type="date" value={f.due_at} disabled={!canEdit} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></div>
              <div><label>Publicação planejada</label><input aria-label="Publicação planejada" type="date" value={f.post_date} disabled={!canEdit} onChange={(e) => setF({ ...f, post_date: e.target.value })} /></div>
            </div>
            <label>Bloqueio (deixe em branco se não houver)</label>
            <input aria-label="Bloqueio" type="text" maxLength={300} value={f.blocked_reason} disabled={!canEdit} placeholder="Ex.: aguardando preço do fornecedor" onChange={(e) => setF({ ...f, blocked_reason: e.target.value })} />
            {canEdit && (
              <div className="form-actions">
                <button type="button" className="primary" disabled={busy} onClick={() => run(() => updateTaskAction(c.id, c.revision, f), 'Alterações salvas.')}>Salvar produção</button>
              </div>
            )}
          </section>

          <section>
            <h4>Checklist <small className="muted">{detail.checklist.filter((i) => i.is_complete).length}/{detail.checklist.length}</small></h4>
            <ul className="checklist">
              {detail.checklist.map((i) => (
                <li key={i.id}>
                  <label className="check">
                    <input type="checkbox" checked={i.is_complete} disabled={!canEdit || busy} onChange={(e) => { const done = e.target.checked; setDetail((d) => d && { ...d, checklist: d.checklist.map((x) => (x.id === i.id ? { ...x, is_complete: done } : x)) }); void run(() => toggleChecklistAction(i.id, done)) }} />
                    <span className={i.is_complete ? 'done' : ''}>{i.label}</span>
                  </label>
                  {i.is_complete && i.completed_by_name && <small className="muted">{i.completed_by_name}</small>}
                  {canEdit && <button type="button" className="ghost" aria-label="Remover item" onClick={() => run(() => deleteChecklistAction(i.id))}><Trash2 size={14} /></button>}
                </li>
              ))}
              {detail.checklist.length === 0 && <li className="muted">Nenhum item.</li>}
            </ul>
            {canEdit && (
              <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (await run(() => addChecklistAction(c.id, item))) setItem('') }}>
                <input aria-label="Novo item do checklist" type="text" maxLength={200} value={item} onChange={(e) => setItem(e.target.value)} placeholder="Novo item (ex.: conferir preço e validade)" />
                <button type="submit" className="secondary" disabled={busy || !item.trim()}><Plus size={14} /> Adicionar</button>
              </form>
            )}
          </section>

          <section>
            <h4>Comentários</h4>
            <ul className="comments">
              {detail.comments.map((m) => (
                <li key={m.id}><b>{m.author_name ?? 'Usuário removido'}</b> <small className="muted">{fmtTime(m.created_at)}</small><p className="pre">{m.body}</p></li>
              ))}
              {detail.comments.length === 0 && <li className="muted">Nenhum comentário.</li>}
            </ul>
            {canEdit && (
              <form className="stack-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => addCommentAction(c.id, comment))) setComment('') }}>
                <textarea aria-label="Novo comentário" rows={2} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário (fica no histórico e não pode ser editado)" />
                <div className="form-actions"><button type="submit" className="secondary" disabled={busy || !comment.trim()}>Comentar</button></div>
              </form>
            )}
          </section>

          <section>
            <h4>Histórico</h4>
            <ol className="events">
              {detail.events.map((e) => (
                <li key={e.id}>
                  <b>{e.from_stage === e.to_stage ? STAGES[e.to_stage] : `${stageLabel(e.from_stage)} → ${STAGES[e.to_stage]}`}</b>
                  {e.note && <> — {e.note}</>}
                  <small className="muted"> · {e.actor_name ?? 'sistema'} · {fmtTime(e.created_at)}</small>
                </li>
              ))}
            </ol>
          </section>
          <p className="muted">Publicação planejada: {formatBR(c.post_date)}</p>
        </div>
      )}
    </dialog>
  )
}
