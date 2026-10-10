'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { formatBR } from '@/lib/domain'
import type { CampaignLink } from '@/lib/data'
import { approveLinkAction, archiveLinkAction } from './actions'

export function LinkList({ rows, canEdit, userId, role }: { rows: CampaignLink[]; canEdit: boolean; userId: string; role: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; kind: 'ok' | 'error'; text: string } | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setBusy(id); setMsg(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg({ id, kind: 'error', text: (r as { error: string }).error }); return }
    if (okText) setMsg({ id, kind: 'ok', text: okText })
    router.refresh()
  }
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setMsg({ id, kind: 'ok', text: 'Link copiado.' }) } catch { setMsg({ id, kind: 'error', text: 'Não foi possível copiar. Selecione o link e copie à mão.' }) }
  }

  if (rows.length === 0) return <p className="empty">Nenhum link neste recorte. Crie o primeiro acima.</p>
  return (
    <div className="cards">
      {rows.map((l) => {
        const mine = l.created_by === userId
        const canApprove = canEdit && l.status === 'rascunho' && (role === 'admin' || (role === 'editor' && !mine))
        return (
          <article key={l.id} className="card link-card" data-status={l.status} data-label={l.label}>
            <h3>{l.label} <span className={`pill ${l.status === 'aprovado' ? 'on' : l.status === 'rascunho' ? 'soft' : 'off'}`}>{l.status === 'aprovado' ? 'Aprovado' : l.status === 'rascunho' ? 'Rascunho' : 'Arquivado'}</span></h3>
            <p className="muted">{l.brand_name} · {l.branch_name ?? 'todas as unidades'}{l.campaign_name ? ` · campanha ${l.campaign_name}` : ''} · criado por {l.created_by_name ?? '—'} em {formatBR(l.created_at.slice(0, 10))}</p>
            <p className="preview-url"><small className="muted">Destino</small><br /><code>{l.destination_url}</code></p>
            <p className="preview-url"><small className="muted">Link final ({l.utm_source} / {l.utm_medium} / {l.utm_campaign}{l.utm_content ? ` / ${l.utm_content}` : ''})</small><br /><code>{l.final_url}</code></p>
            {l.status === 'aprovado' ? (
              <div className="qr-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/links/${l.id}/qr?formato=svg`} alt={`QR Code de ${l.label}`} width={140} height={140} />
                <div>
                  <p className="muted">Aprovado por {l.approved_by_name ?? '—'} em {l.approved_at ? formatBR(l.approved_at.slice(0, 10)) : '—'}.</p>
                  <a className="mini-btn" href={`/api/links/${l.id}/qr?formato=png&baixar=1`}>Baixar PNG</a>{' '}
                  <a className="mini-btn" href={`/api/links/${l.id}/qr?formato=svg&baixar=1`}>Baixar SVG</a>
                </div>
              </div>
            ) : l.status === 'rascunho' ? (
              <p className="muted">QR Code liberado só depois da aprovação de outra pessoa (ou de um administrador), que confirma ter aberto o destino.</p>
            ) : null}
            {canApprove && (
              <fieldset className="offer">
                <legend>Aprovar</legend>
                <label className="check inline"><input type="checkbox" checked={Boolean(checked[l.id])} onChange={(e) => setChecked((s) => ({ ...s, [l.id]: e.target.checked }))} /> Abri o destino e conferi que é a página certa</label>
                <div className="form-actions"><button type="button" className="primary" disabled={busy === l.id} onClick={() => run(l.id, () => approveLinkAction(l.id, Boolean(checked[l.id])), 'Aprovado. QR Code liberado.')}>Aprovar link</button></div>
              </fieldset>
            )}
            {l.status === 'rascunho' && canEdit && mine && role !== 'admin' && <p className="muted">Você criou este link, então outra pessoa precisa aprová-lo.</p>}
            {msg?.id === l.id && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
            <div className="card-actions">
              <button type="button" className="mini-btn" onClick={() => copy(l.id, l.final_url)}><Copy size={12} /> Copiar link final</button>
              <a className="mini-btn" href={l.destination_url} target="_blank" rel="noopener noreferrer">Abrir destino</a>
              {canEdit && l.status !== 'arquivado' && <button type="button" className="link-danger" disabled={busy === l.id} onClick={() => run(l.id, () => archiveLinkAction(l.id), 'Link arquivado.')}>Arquivar</button>}
            </div>
          </article>
        )
      })}
    </div>
  )
}
