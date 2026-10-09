'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckSquare, Lock, MessageSquare, Plus } from 'lucide-react'
import { FORMATS, PRIORITIES, STAGES, STAGE_ORDER, formatBR, type Stage } from '@/lib/domain'
import type { BoardCard } from '@/lib/data'
import { moveCardAction, quickCreateAction } from './actions'
import { TaskDrawer } from './task-drawer'

type Brand = { id: string; name: string }

const initials = (name: string | null) => (name ? name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '—')

export function Board({
  cards: initial, canEdit, today, brands, defaultBrandId, defaultBranchId, onlyStage,
}: {
  cards: BoardCard[]; canEdit: boolean; today: string; brands: Brand[]
  defaultBrandId?: string; defaultBranchId?: string; onlyStage?: string
}) {
  const router = useRouter()
  const [cards, setCards] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<Stage | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [adding, setAdding] = useState<Stage | null>(null)
  const [title, setTitle] = useState('')
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [addBusy, setAddBusy] = useState(false)

  useEffect(() => setCards(initial), [initial])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t) }, [toast])

  const stages = onlyStage && onlyStage in STAGES ? [onlyStage as Stage] : STAGE_ORDER

  async function move(card: BoardCard, to: Stage) {
    if (!canEdit || card.stage === to) return
    let confirm = false
    if (to === 'publicado') {
      confirm = window.confirm(`Confirmar que "${card.title}" foi publicado de verdade? Agendar não é publicar.`)
      if (!confirm) return
    }
    // Otimista: o cartão muda de coluna na hora; se o servidor recusar, volta.
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage: to } : c)))
    const r = await moveCardAction(card.id, to, card.revision, { confirmPublish: confirm })
    if (r.ok) {
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, revision: r.revision } : c)))
      router.refresh()
    } else {
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage: card.stage } : c)))
      setToast(r.error)
      if (r.conflict) router.refresh()
    }
  }

  async function addCard(stage: Stage) {
    setAddBusy(true)
    const r = await quickCreateAction({ title, stage, brandId, branchId: brandId === defaultBrandId ? defaultBranchId : undefined })
    setAddBusy(false)
    if (!r.ok) { setToast(r.error); return }
    setTitle(''); setAdding(null); router.refresh()
  }

  const brandOptions = brands

  return (
    <>
      {toast && <div className="toast" role="alert">{toast}</div>}
      <div className="kanban" role="list">
        {stages.map((stage) => {
          const col = cards.filter((c) => c.stage === stage)
          return (
            <section
              key={stage}
              role="listitem"
              aria-label={STAGES[stage]}
              className={`kcol${dragOver === stage ? ' over' : ''}`}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(stage) } }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(null)
                const id = e.dataTransfer.getData('text/plain')
                const card = cards.find((c) => c.id === id)
                if (card) void move(card, stage)
              }}
            >
              <h2 className="kcol-head"><span>{STAGES[stage]}</span><b>{col.length}</b></h2>
              <div className="kcards">
                {col.map((c) => {
                  const late = c.stage !== 'publicado' && c.stage !== 'cancelado' && (c.post_date < today || (c.due_at !== null && c.due_at < today))
                  return (
                    <article
                      key={c.id}
                      className={`kcard prio-${c.priority}${c.blocked_reason ? ' blocked' : ''}${c.stage === 'cancelado' ? ' cancelled' : ''}`}
                      draggable={canEdit}
                      data-card-id={c.id}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}
                    >
                      <button type="button" className="kcard-main" onClick={() => setOpen(c.id)} aria-label={`Abrir ${c.title}`}>
                        <span className="kcard-top">
                          <span className={`badge fmt-${c.format}`}>{FORMATS[c.format]}</span>
                          {(c.priority === 'urgent' || c.priority === 'high') && <span className={`prio-tag ${c.priority}`}>{PRIORITIES[c.priority]}</span>}
                          {c.blocked_reason && <span title={c.blocked_reason} className="ico-flag"><Lock size={13} /></span>}
                          {c.conflict && <span title="Outra publicação no mesmo dia e horário" className="ico-flag warn"><AlertTriangle size={13} /></span>}
                        </span>
                        <strong>{c.title}</strong>
                        <small className="muted">{c.brand_name}{c.branch_name ? ` · ${c.branch_name}` : ''}</small>
                        <small className={late ? 'late' : 'muted'}>
                          {late ? 'Atrasado · ' : ''}Publica {formatBR(c.post_date)}{c.due_at ? ` · prazo ${formatBR(c.due_at)}` : ''}
                        </small>
                      </button>
                      <span className="kcard-foot">
                        <span className="avatar xs" title={c.assigned_name ?? 'Sem responsável'}>{initials(c.assigned_name)}</span>
                        {c.checklist_total > 0 && <span title="Checklist"><CheckSquare size={13} /> {c.checklist_done}/{c.checklist_total}</span>}
                        {c.comments > 0 && <span title="Comentários"><MessageSquare size={13} /> {c.comments}</span>}
                        {canEdit && (
                          <select className="kmove" aria-label={`Mover ${c.title} para`} value={c.stage} onChange={(e) => void move(c, e.target.value as Stage)}>
                            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGES[s]}</option>)}
                          </select>
                        )}
                      </span>
                    </article>
                  )
                })}
                {col.length === 0 && <p className="muted kempty">Nada aqui.</p>}
              </div>
              {canEdit && stage !== 'publicado' && (
                adding === stage ? (
                  <form className="kadd" onSubmit={(e) => { e.preventDefault(); void addCard(stage) }}>
                    <input type="text" autoFocus value={title} maxLength={140} placeholder="Título do cartão" onChange={(e) => setTitle(e.target.value)} aria-label="Título do novo cartão" />
                    {brandOptions.length > 1 && (
                      <select value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Filial do novo cartão">
                        {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    )}
                    <span className="kadd-actions">
                      <button type="submit" className="primary" disabled={addBusy || title.trim().length < 2}>Adicionar</button>
                      <button type="button" className="ghost" onClick={() => { setAdding(null); setTitle('') }}>Cancelar</button>
                    </span>
                  </form>
                ) : (
                  <button type="button" className="kadd-btn" onClick={() => setAdding(stage)}><Plus size={14} /> Adicionar cartão</button>
                )
              )}
            </section>
          )
        })}
      </div>
      <TaskDrawer cardId={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={() => router.refresh()} />
    </>
  )
}
