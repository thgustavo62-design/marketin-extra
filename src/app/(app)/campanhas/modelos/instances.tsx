'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatBR } from '@/lib/domain'
import type { Instance } from '@/lib/data'
import { cancelInstanceAction, reconfirmInstanceAction } from './actions'

const EMPTY = { products: false, prices: false, validity: false, stock: false }
const CHECKS: [keyof typeof EMPTY, string][] = [
  ['products', 'Produtos conferidos'], ['prices', 'Preços conferidos'], ['validity', 'Validade conferida'], ['stock', 'Estoque conferido'],
]

export function Instances({ instances, canEdit }: { instances: Instance[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; kind: 'ok' | 'error'; text: string } | null>(null)
  const [checks, setChecks] = useState<Record<string, typeof EMPTY>>({})

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: (r: never) => string) {
    setBusy(id); setMsg(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg({ id, kind: 'error', text: (r as { error: string }).error }); return }
    setMsg({ id, kind: 'ok', text: okText(r as never) })
    router.refresh()
  }

  if (instances.length === 0) return <p className="empty">Nenhuma ocorrência gerada ainda. Use “Gerar próximas ocorrências” na lista de modelos.</p>
  return (
    <div className="cards">
      {instances.map((i) => {
        const c = checks[i.id] ?? EMPTY
        const pending = i.status === 'generated' && !i.reconfirmed_at
        return (
          <article key={i.id} className={`card${i.status === 'cancelled' ? ' muted-card' : ''}`} data-instance={i.occurrence_start} data-status={i.status}>
            <h3>{i.campaign_name ?? `Campanha de ${formatBR(i.occurrence_start)}`}</h3>
            <p className="muted">
              {formatBR(i.occurrence_start)}{i.occurrence_end !== i.occurrence_start ? ` a ${formatBR(i.occurrence_end)}` : ''} · {i.posts} {i.posts === 1 ? 'cartão' : 'cartões'} ({i.posts_done} aprovados ou além)
            </p>
            {i.status === 'cancelled' && <p><span className="pill off">Cancelada</span></p>}
            {i.status === 'generated' && i.reconfirmed_at && <p><span className="pill on">Reconfirmada por {i.reconfirmed_by_name ?? '—'} em {formatBR(i.reconfirmed_at.slice(0, 10))}</span></p>}
            {pending && (
              <fieldset className="offer">
                <legend><span className="pill off">Aguardando reconfirmação</span></legend>
                <p className="muted">Nada foi copiado da campanha anterior. Confirme com a loja antes de enviar para aprovação.</p>
                {canEdit && (
                  <>
                    <div className="check-grid">
                      {CHECKS.map(([k, label]) => (
                        <label key={k} className="check inline">
                          <input type="checkbox" checked={c[k]} onChange={(e) => setChecks((s) => ({ ...s, [i.id]: { ...c, [k]: e.target.checked } }))} /> {label}
                        </label>
                      ))}
                    </div>
                    <div className="form-actions">
                      <button type="button" className="primary" disabled={busy === i.id} onClick={() => run(i.id, () => reconfirmInstanceAction(i.id, c), () => 'Reconfirmado. Os cartões já podem seguir para aprovação.')}>Reconfirmar dados comerciais</button>
                    </div>
                  </>
                )}
              </fieldset>
            )}
            {msg?.id === i.id && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
            <div className="card-actions">
              {i.campaign_id && <Link href={`/producao?camp=${i.campaign_id}`}>Ver no quadro</Link>}
              {canEdit && i.status === 'generated' && (
                <button type="button" className="link-danger" disabled={busy === i.id} onClick={() => {
                  if (!window.confirm('Cancelar esta ocorrência? Os cartões ainda em preparo serão cancelados e ela não será gerada de novo.')) return
                  void run(i.id, () => cancelInstanceAction(i.id), (r: { cancelled: number; kept: number }) => `Ocorrência cancelada. ${r.cancelled} cartão(ões) cancelado(s)${r.kept ? `, ${r.kept} mantido(s) por já estarem adiantados` : ''}.`)
                }}>Cancelar ocorrência</button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
