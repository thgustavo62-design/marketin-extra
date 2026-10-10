'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FORMATS, engagementRate, fmtNum, fmtPct, formatBR, interactions, perThousandReach, type PubMetrics } from '@/lib/domain'
import type { PublicationRow } from '@/lib/data'
import { linkPublicationAction, unlinkPublicationAction } from './actions'

export type Cand = { id: string; title: string; post_date: string; format: string }
export type Row = PublicationRow & { age: number | null; mature: boolean; candidates: Cand[]; suggestion: Cand | null }

const METHOD: Record<string, string> = { manual: 'manual', verified_match: 'sugestão confirmada', api: 'API' }
const FORMAT_NAME: Record<string, string> = { ...FORMATS, story: 'Story', outro: 'Outro' }

function metricCells(m: PubMetrics | null) {
  if (!m) return Array.from({ length: 7 }, (_, i) => <td key={i} className="num muted">N/D</td>)
  const inter = interactions(m)
  return [
    <td key="r" className="num">{fmtNum(m.reach)}</td>,
    <td key="v" className="num">{fmtNum(m.views)}</td>,
    <td key="l" className="num">{fmtNum(m.likes)}</td>,
    <td key="c" className="num">{fmtNum(m.comments)}</td>,
    <td key="s" className="num">{fmtNum(m.saves)}</td>,
    <td key="h" className="num">{fmtNum(m.shares)}</td>,
    <td key="e" className="num"><b>{fmtPct(engagementRate(m))}</b><br /><small className="muted">{inter === null ? '' : `${fmtNum(perThousandReach(m.saves, m.reach), 1)} salv./mil`}</small></td>,
  ]
}

export function PublicationTable({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id); setMsg(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg({ id, text: (r as { error: string }).error }); return }
    router.refresh()
  }

  return (
    <div className="dark-table">
      <table>
        <thead>
          <tr>
            <th>Publicação</th><th>Formato</th><th className="num">Alcance</th><th className="num">Visualiz.</th><th className="num">Curtidas</th><th className="num">Coment.</th>
            <th className="num">Salv.</th><th className="num">Comp.</th><th className="num">Engajamento</th><th>Coletado</th><th>Conteúdo vinculado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-pub={r.external_media_id}>
              <td>
                {r.permalink ? <a href={r.permalink} target="_blank" rel="noopener noreferrer" style={{ color: '#7fc4ff' }}>{r.caption_excerpt?.slice(0, 60) ?? 'Ver publicação'}</a> : (r.caption_excerpt?.slice(0, 60) ?? '—')}
                <br /><small style={{ color: '#8aa3bc' }}>{r.published_on ? formatBR(r.published_on) : 'sem data'} · {r.account_name}</small>
              </td>
              <td>{FORMAT_NAME[r.format] ?? r.format}{r.age !== null && !r.mature && <><br /><small className="pill off">{r.age} d · recente</small></>}</td>
              {metricCells(r.metrics)}
              <td>
                {r.collected_on ? <>{formatBR(r.collected_on)}<br /><small style={{ color: '#8aa3bc' }}>{r.data_quality === 'partial' ? 'parcial' : 'completo'}</small></> : <span className="muted">nunca</span>}
              </td>
              <td className="link-cell">
                {r.content_id ? (
                  <>
                    <Link href={`/planejamento/conteudos/${r.content_id}`} style={{ color: '#7fc4ff' }}>{r.content_title}</Link>
                    <br /><small style={{ color: '#8aa3bc' }}>{r.link_method ? METHOD[r.link_method] : ''}{r.linked_by_name ? ` · ${r.linked_by_name}` : ''}</small>
                    {canEdit && <><br /><button type="button" className="mini-btn" disabled={busy === r.id} onClick={() => run(r.id, () => unlinkPublicationAction(r.id))}>Desvincular</button></>}
                  </>
                ) : canEdit ? (
                  <>
                    {r.suggestion && (
                      <div className="suggest">
                        <small>Sugestão (mesmo dia e formato): <b>{r.suggestion.title}</b></small><br />
                        <button type="button" className="mini-btn" disabled={busy === r.id} onClick={() => run(r.id, () => linkPublicationAction(r.id, r.suggestion!.id, 'verified_match'))}>Confirmar sugestão</button>
                      </div>
                    )}
                    <select aria-label="Conteúdo para vincular" value={pick[r.id] ?? ''} onChange={(e) => setPick((s) => ({ ...s, [r.id]: e.target.value }))}>
                      <option value="">{r.candidates.length ? 'Escolher conteúdo…' : 'Nenhum conteúdo próximo'}</option>
                      {r.candidates.map((c) => <option key={c.id} value={c.id}>{formatBR(c.post_date)} · {c.title}</option>)}
                    </select>{' '}
                    <button type="button" className="mini-btn" disabled={busy === r.id || !pick[r.id]} onClick={() => run(r.id, () => linkPublicationAction(r.id, pick[r.id], 'manual'))}>Vincular</button>
                  </>
                ) : <span className="muted">Não vinculada</span>}
                {msg?.id === r.id && <p className="form-error" role="alert">{msg.text}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
