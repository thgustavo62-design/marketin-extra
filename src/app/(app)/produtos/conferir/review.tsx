'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Trash2, Undo2 } from 'lucide-react'
import type { PendingImage } from '@/lib/catalog/store'
import { assignImageAction, confirmImageAction, deleteImageAction, unlinkImageAction } from '../actions'
import { ProductPicker } from '../product-picker'

type Similar = { id: string; original_name: string | null; match_score: number | null; product_id: string; description: string }

export function Review({ pending, similar, canEdit }: { pending: PendingImage[]; similar: Similar[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message ?? 'Não foi possível concluir.'); router.refresh() })

  return (
    <>
      {msg && <p className="form-error" role="alert">{msg}</p>}

      <section className="card">
        <h3>Sem produto definido ({pending.length})</h3>
        <p className="muted">O nome do arquivo não bateu com segurança com nenhuma descrição do ERP. Escolha o produto certo (ou exclua a imagem).</p>
        {pending.length === 0 ? <p className="empty">Nada pendente.</p> : (
          <div className="asset-grid">
            {pending.map((p) => (
              <article key={p.id} className="asset-card">
                <span className="asset-thumb" style={{ height: 150 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="thumb" style={{ maxHeight: 150 }} src={`/api/produtos/imagem/${p.id}?mini=1`} alt="" loading="lazy" />
                </span>
                <small className="muted" style={{ overflowWrap: 'anywhere' }}>{p.original_name ?? 'sem nome'}</small>
                {canEdit && (
                  <>
                    {p.suggestions.length > 0 && (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <small className="muted">Parecidos:</small>
                        {p.suggestions.slice(0, 4).map((s) => (
                          <button key={s.id} type="button" className="mini-btn" style={{ justifyContent: 'flex-start', height: 'auto', padding: '5px 8px', textAlign: 'left' }} disabled={busy} onClick={() => run(() => assignImageAction(p.id, s.id))}>
                            <Check size={12} /> {s.description} <span className="muted">({Math.round(s.score * 100)}%)</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <ProductPicker label="Buscar outro produto" placeholder="Outro produto…" onPick={(prod) => run(() => assignImageAction(p.id, prod.id))} />
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => { if (confirm('Excluir esta imagem?')) run(() => deleteImageAction(p.id)) }}><Trash2 size={12} /> Excluir imagem</button>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <h3>Ligadas por semelhança ({similar.length})</h3>
        <p className="muted">O sistema ligou sozinho porque o nome é muito parecido, mas vale uma olhada. Confirme ou desfaça.</p>
        {similar.length === 0 ? <p className="empty">Nada para conferir.</p> : (
          <div className="asset-grid">
            {similar.map((s) => (
              <article key={s.id} className="asset-card">
                <span className="asset-thumb" style={{ height: 150 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="thumb" style={{ maxHeight: 150 }} src={`/api/produtos/imagem/${s.id}?mini=1`} alt="" loading="lazy" />
                </span>
                <small className="muted" style={{ overflowWrap: 'anywhere' }}>Arquivo: {s.original_name ?? 'sem nome'}</small>
                <Link href={`/produtos/${s.product_id}`} style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{s.description}</Link>
                {s.match_score != null && <small className="muted">Semelhança {Math.round(s.match_score * 100)}%</small>}
                {canEdit && (
                  <div className="card-actions" style={{ marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => confirmImageAction(s.id))}><Check size={12} /> Está certo</button>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => unlinkImageAction(s.id))}><Undo2 size={12} /> Não é este</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
