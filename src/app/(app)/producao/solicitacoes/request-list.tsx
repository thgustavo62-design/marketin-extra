'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PRIORITIES, REQUEST_STATUS, REQUEST_TYPES, formatBR, nextRequestStatuses, type RequestStatus } from '@/lib/domain'
import type { RequestRow } from '@/lib/data'
import { confirmRequestInfoAction, convertRequestAction, moveRequestAction, saveOfferAction } from './actions'

const MOVE_LABEL: Partial<Record<RequestStatus, string>> = {
  precisa_info: 'Pedir informação', aceita: 'Aceitar', em_producao: 'Iniciar produção', concluida: 'Concluir', cancelada: 'Cancelar', recebida: 'Reabrir',
}

type Offer = { item: string; price: string; until: string }

export function RequestList({ rows, canEdit }: { rows: RequestRow[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; kind: 'ok' | 'error'; text: string } | null>(null)
  const [offer, setOffer] = useState<Record<string, Offer>>({})

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setBusy(id); setMsg(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg({ id, kind: 'error', text: r.error ?? 'Não foi possível concluir.' }); return }
    if (okText) setMsg({ id, kind: 'ok', text: okText })
    setOffer((s) => { const { [id]: _drop, ...rest } = s; return rest })
    router.refresh()
  }

  if (rows.length === 0) return <p className="empty">Nenhuma solicitação neste recorte.</p>
  return (
    <div className="cards">
      {rows.map((r) => {
        const o: Offer = offer[r.id] ?? { item: r.offer_item ?? '', price: r.offer_price === null ? '' : String(r.offer_price).replace('.', ','), until: r.offer_valid_until ?? '' }
        const setO = (patch: Partial<Offer>) => setOffer((s) => ({ ...s, [r.id]: { ...o, ...patch } }))
        const open = r.status !== 'concluida' && r.status !== 'cancelada'
        return (
          <article key={r.id} className="card request" data-status={r.status}>
            <h3>{r.title} <span className="pill soft">{REQUEST_STATUS[r.status]}</span></h3>
            <p className="muted">
              {REQUEST_TYPES[r.type]} · {r.brand_name}{r.branch_name ? ` · ${r.branch_name}` : ''} · prioridade {PRIORITIES[r.priority].toLowerCase()}
              {r.due_at ? ` · prazo ${formatBR(r.due_at)}` : ''} · por {r.requested_by_name ?? '—'}
            </p>
            {r.briefing && <p className="pre">{r.briefing}</p>}
            {(r.offer_item || canEdit) && open && !r.linked_post_id && (
              <fieldset className="offer">
                <legend>
                  Oferta{' '}
                  {r.info_confirmed_at
                    ? <span className="pill on">confirmada por {r.info_confirmed_by_name ?? '—'}</span>
                    : r.offer_item ? <span className="pill off">não confirmada</span> : null}
                </legend>
                <div className="grid-3">
                  <input aria-label="Item da oferta" placeholder="Item" value={o.item} disabled={!canEdit} onChange={(e) => setO({ item: e.target.value })} />
                  <input aria-label="Preço da oferta" placeholder="Preço (R$)" inputMode="decimal" value={o.price} disabled={!canEdit} onChange={(e) => setO({ price: e.target.value })} />
                  <input aria-label="Validade da oferta" type="date" value={o.until} disabled={!canEdit} onChange={(e) => setO({ until: e.target.value })} />
                </div>
                {canEdit && (
                  <div className="form-actions">
                    <button type="button" className="secondary" disabled={busy === r.id} onClick={() => run(r.id, () => saveOfferAction(r.id, o), 'Oferta salva. Confirme de novo.')}>Salvar oferta</button>
                    {r.offer_item && !r.info_confirmed_at && (
                      <button type="button" className="secondary" disabled={busy === r.id} onClick={() => run(r.id, () => confirmRequestInfoAction(r.id), 'Preço e validade confirmados.')}>Confirmar preço e validade</button>
                    )}
                  </div>
                )}
              </fieldset>
            )}
            {msg?.id === r.id && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
            <div className="card-actions">
              {r.linked_post_id && <Link href={`/producao?abrir=${r.linked_post_id}`} className="inline-link">Abrir o conteúdo gerado</Link>}
              {canEdit && !r.linked_post_id && open && (
                <button type="button" className="primary" disabled={busy === r.id} onClick={() => run(r.id, async () => {
                  const x = await convertRequestAction(r.id)
                  if (x.ok) router.push(`/producao?abrir=${x.postId}`)
                  return x
                })}>Converter em conteúdo</button>
              )}
              {canEdit && nextRequestStatuses(r.status).map((to) => (
                <button key={to} type="button" className="mini-btn" disabled={busy === r.id} onClick={() => run(r.id, () => moveRequestAction(r.id, to))}>{MOVE_LABEL[to] ?? REQUEST_STATUS[to]}</button>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
