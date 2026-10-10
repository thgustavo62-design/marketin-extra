'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Lock, Paperclip, Plus, Send, Trash2, X, XCircle } from 'lucide-react'
import { FORMATS, PILLARS, PRIORITIES, STAGES, STAGE_ORDER, formatBR, type Priority, type Stage } from '@/lib/domain'
import type { FullDetail } from './actions'
import { linkAssetAction, listPickerAction, unlinkAssetAction } from './biblioteca/actions'
import { DECISION_LABELS, formatBytes, type Decision } from '@/lib/domain'
import {
  addChecklistAction, addCommentAction, confirmPublicationAction, decideApprovalAction, deleteChecklistAction, getTaskDetailAction, moveCardAction, setPublicationMethodAction,
  toggleChecklistAction, updateTaskAction,
} from './actions'

const fmtTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

// Detalhe da tarefa: campos de produção, etapa, checklist, comentários e histórico. Quem só pode ver não vê os campos de edição.
export function TaskDrawer({ cardId, canEdit, onClose, onChanged }: { cardId: string | null; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState<FullDetail | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [item, setItem] = useState('')
  const [comment, setComment] = useState('')
  const [reason, setReason] = useState('')
  const [pubUrl, setPubUrl] = useState('')
  const [picker, setPicker] = useState<{ open: boolean; q: string; items: { id: string; title: string; kind: 'file' | 'link'; mime_type: string | null; version_number: number }[] }>({ open: false, q: '', items: [] })
  const upRef = useRef<HTMLInputElement>(null)
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

          <section data-section="publicacao">
            <h4>Publicação <small className="muted">o sistema não publica sozinho</small></h4>
            <label htmlFor="pub-method">Como será publicado</label>
            <select id="pub-method" value={detail.publication.method} disabled={!canEdit || busy} onChange={(e) => run(() => setPublicationMethodAction(c.id, e.target.value), 'Método de publicação salvo.')}>
              <option value="manual">Manual — alguém publica na rede e confirma aqui</option>
              <option value="assistido">Assistido — agenda e lembrete; alguém publica e confirma</option>
              <option value="api" disabled>API — indisponível (depende de prova de viabilidade)</option>
            </select>
            {c.stage === 'publicado' ? (
              <p className="form-ok">
                Publicação confirmada{detail.publication.confirmedByName ? ` por ${detail.publication.confirmedByName}` : ''}{detail.publication.confirmedAt ? ` em ${fmtTime(detail.publication.confirmedAt)}` : ''}.{' '}
                {detail.publication.url ? <a href={detail.publication.url} target="_blank" rel="noopener noreferrer" className="inline-link">Abrir publicação</a> : 'Sem endereço registrado.'}
              </p>
            ) : (c.stage === 'aprovado' || c.stage === 'agendado') && canEdit ? (
              <>
                <label htmlFor="pub-url">Endereço da publicação (depois de publicar na rede)</label>
                <input id="pub-url" type="text" inputMode="url" value={pubUrl} onChange={(e) => setPubUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" />
                <div className="form-actions">
                  <button type="button" className="primary" disabled={busy} onClick={async () => {
                    if (!window.confirm('Confirmar que este conteúdo foi publicado de verdade na rede? Agendar não é publicar.')) return
                    if (await run(() => confirmPublicationAction(c.id, pubUrl, c.revision), 'Publicação confirmada.')) setPubUrl('')
                  }}>Confirmar publicação</button>
                </div>
                <p className="muted">O endereço permite ligar a publicação às métricas coletadas. Sem aprovação válida (quando a filial exige), a confirmação é recusada.</p>
              </>
            ) : <p className="muted">A confirmação fica disponível quando o conteúdo está Aprovado ou Agendado.</p>}
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
            <h4>Arquivos</h4>
            <ul className="files">
              {detail.assets.map((a) => (
                <li key={a.asset_id}>
                  <Paperclip size={13} />
                  <a href={a.kind === 'link' ? (a.external_url ?? '#') : '/api/media/' + a.asset_id} target="_blank" rel="noopener noreferrer" className="inline-link">{a.title}</a>
                  <small className="muted">v{a.version_number}{a.kind === 'file' ? ' · ' + formatBytes(a.size_bytes ?? 0) : ' · link'}</small>
                  <select aria-label={'Papel de ' + a.title} value={a.role} disabled={!canEdit || busy} onChange={(e) => run(() => linkAssetAction(c.id, a.asset_id, e.target.value))}>
                    <option value="reference">Referência</option><option value="draft">Rascunho</option><option value="final">Final</option><option value="thumbnail">Miniatura</option>
                  </select>
                  {canEdit && <button type="button" className="ghost" aria-label={'Desvincular ' + a.title} onClick={() => run(() => unlinkAssetAction(c.id, a.asset_id))}><Trash2 size={14} /></button>}
                </li>
              ))}
              {detail.assets.length === 0 && <li className="muted">Nenhum arquivo anexado.</li>}
            </ul>
            {canEdit && (
              <>
                <div className="inline-add">
                  <input ref={upRef} type="file" aria-label="Arquivo para anexar" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
                  <button type="button" className="secondary" disabled={busy} onClick={async () => {
                    const file = upRef.current?.files?.[0]
                    if (!file) { setMsg({ kind: 'error', text: 'Escolha um arquivo.' }); return }
                    const body = new FormData(); body.set('file', file); body.set('brand_id', c.brand_id)
                    setBusy(true); setMsg(null)
                    const res = await fetch('/api/media', { method: 'POST', body })
                    const j = await res.json().catch(() => ({}))
                    setBusy(false)
                    const assetId: string | undefined = res.ok ? j.id : j.existingId
                    if (!assetId) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar.' }); return }
                    if (await run(() => linkAssetAction(c.id, assetId, 'draft'), res.ok ? 'Arquivo enviado e anexado.' : 'Esse arquivo já estava na biblioteca; foi só anexado.')) { if (upRef.current) upRef.current.value = '' }
                  }}>Enviar e anexar</button>
                  <button type="button" className="secondary" onClick={async () => {
                    const open = !picker.open
                    setPicker({ ...picker, open })
                    if (open) { const r = await listPickerAction(c.brand_id, ''); if (r.ok) setPicker({ open: true, q: '', items: r.items }) }
                  }}>Anexar da biblioteca</button>
                </div>
                {picker.open && (
                  <div className="picker">
                    <input type="text" aria-label="Buscar na biblioteca" placeholder="Buscar pelo título" value={picker.q} onChange={async (e) => {
                      const q = e.target.value
                      setPicker((p) => ({ ...p, q }))
                      const r = await listPickerAction(c.brand_id, q); if (r.ok) setPicker((p) => ({ ...p, items: r.items }))
                    }} />
                    <ul>
                      {picker.items.map((i) => (
                        <li key={i.id}><span>{i.title} <small className="muted">v{i.version_number}{i.kind === 'link' ? ' · link' : ''}</small></span>
                          <button type="button" className="mini-btn" disabled={busy} onClick={async () => { if (await run(() => linkAssetAction(c.id, i.id, 'draft'), 'Anexado.')) setPicker((p) => ({ ...p, open: false })) }}>Anexar</button></li>
                      ))}
                      {picker.items.length === 0 && <li className="muted">Nada encontrado.</li>}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <h4>Aprovação <small className="muted">{detail.approvalRequired ? 'exigida nesta filial' : 'opcional nesta filial'}</small></h4>
            {(() => {
              const ap = detail.approval.latest
              if (!ap) return <p className="muted">Nenhum envio para aprovação ainda.</p>
              if (ap.status === 'pending') return <p><b>Aguardando decisão</b> de {ap.reviewer_name ?? 'um administrador'} · versão {ap.version_number} enviada por {ap.submitted_by_name ?? '—'}.</p>
              if (ap.status === 'approved') return ap.valid
                ? <p className="form-ok"><CheckCircle2 size={14} style={{ verticalAlign: '-2px' }} /> Aprovado por {ap.decided_by_name ?? '—'} (versão {ap.version_number}). Vale para o conteúdo como está.</p>
                : <p className="form-error"><AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> A aprovação da versão {ap.version_number} está desatualizada: o conteúdo mudou depois dela.</p>
              if (ap.status === 'invalidated') return <p className="muted">Último envio invalidado: {ap.invalidated_reason ?? '—'}</p>
              return <p className="form-error"><XCircle size={14} style={{ verticalAlign: '-2px' }} /> {DECISION_LABELS[ap.status as Decision]} por {ap.decided_by_name ?? '—'}: {ap.reason}</p>
            })()}
            {canEdit && !['aprovacao', 'publicado', 'cancelado'].includes(c.stage) && (
              <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={() => run(() => moveCardAction(c.id, 'aprovacao', c.revision), 'Enviado para aprovação (versão congelada).')}><Send size={14} /> Enviar para aprovação</button></div>
            )}
            {detail.canDecide && (
              <div className="decide">
                <textarea aria-label="Motivo da decisão" rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obrigatório para reprovar ou pedir ajustes)" />
                <div className="form-actions">
                  <button type="button" className="primary" disabled={busy} onClick={async () => { if (await run(() => decideApprovalAction(c.id, 'approved', reason), 'Aprovado.')) setReason('') }}>Aprovar</button>
                  <button type="button" className="secondary" disabled={busy} onClick={async () => { if (await run(() => decideApprovalAction(c.id, 'changes_requested', reason), 'Ajustes solicitados.')) setReason('') }}>Pedir ajustes</button>
                  <button type="button" className="danger" disabled={busy} onClick={async () => { if (await run(() => decideApprovalAction(c.id, 'rejected', reason), 'Reprovado.')) setReason('') }}>Reprovar</button>
                </div>
              </div>
            )}
            {detail.approval.history.length > 0 && (
              <ol className="events">
                {detail.approval.history.map((h, i) => (
                  <li key={i}><b>{({ submitted: 'Enviado', approved: 'Aprovado', rejected: 'Reprovado', changes_requested: 'Ajustes solicitados', invalidated: 'Invalidado', withdrawn: 'Retirado' } as Record<string, string>)[h.event] ?? h.event}</b>{h.note && <> — {h.note}</>}<small className="muted"> · {h.actor_name ?? 'sistema'} · {fmtTime(h.created_at)}</small></li>
                ))}
              </ol>
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
