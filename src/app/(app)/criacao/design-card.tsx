'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCampaignAction, duplicateDesignAction } from '../promocoes/actions'

type D = { thumbAt: string | null; id: string; name: string; status: string; pages: number; format: string; formatLabel: string; hint: string; updated: string; by: string | null }

export function DesignCard({ design: d, canEdit }: { design: D; canEdit: boolean }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  return (
    <article className="card design-card" data-id={d.id}>
      <Link href={`/criacao/${d.id}`} className="thumb-link" aria-label={`Abrir ${d.name}`}>
        {d.thumbAt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="design-thumb" src={`/api/promocoes/miniatura/${d.id}?v=${encodeURIComponent(d.thumbAt)}`} alt="" loading="lazy" />
          : <span className="design-thumb empty">sem miniatura ainda</span>}
      </Link>
      <h3><Link href={`/criacao/${d.id}`}>{d.name}</Link></h3>
      <p className="muted">
        <span className="badge">{d.formatLabel.split(' ')[0]}</span>
        <span className="badge" style={d.status === 'aprovada' ? { background: '#e1f5ec', color: '#1a7f4b' } : undefined}>{d.status === 'aprovada' ? 'Aprovado' : 'Em edição'}</span>
        {d.pages} peça(s) · {d.hint} · {d.updated}{d.by ? ` · ${d.by}` : ''}
      </p>
      <div className="row-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <Link className="mini-btn primary" href={`/criacao/${d.id}`}>Abrir</Link>
        {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => start(async () => { const r = await duplicateDesignAction(d.id); if (r.ok && r.id) router.push(`/criacao/${r.id}`); else setErr(r.error ?? 'Não foi possível duplicar.') })}>Duplicar</button>}
        {canEdit && <button type="button" className="mini-btn danger" disabled={busy} onClick={() => { if (confirm(`Excluir "${d.name}"?`)) start(async () => { await deleteCampaignAction(d.id); router.refresh() }) }}>Excluir</button>}
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
    </article>
  )
}
