'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FileText, Star, Trash2, Upload, X } from 'lucide-react'
import type { AssetDetail } from '@/lib/data'
import { formatBR, formatBytes } from '@/lib/domain'
import { deleteAssetAction, getAssetDetailAction, setFinalAction, setReusableAction, setTagsAction } from './actions'

const when = (iso: string) => formatBR(iso.slice(0, 10))

export function AssetPreview({ id, kind, mime, title, url }: { id: string; kind: 'file' | 'link'; mime: string | null; title: string; url?: string | null }) {
  if (kind === 'link') return <a href={url ?? '#'} target="_blank" rel="noopener noreferrer" className="thumb thumb-link" aria-label={`Abrir link: ${title}`}>🔗</a>
  if (mime?.startsWith('image/')) return <img className="thumb" src={`/api/media/${id}`} alt={title} loading="lazy" />
  return <a href={`/api/media/${id}`} target="_blank" rel="noopener noreferrer" className="thumb thumb-pdf"><FileText size={28} /><span>PDF</span></a>
}

export function AssetDialog({ assetId, canEdit, onClose, onChanged }: { assetId: string | null; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [d, setD] = useState<AssetDetail | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (id: string) => {
    const r = await getAssetDetailAction(id)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); setD(null); return }
    setD(r.detail); setTags(r.detail.asset.tags.join(', '))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (assetId) { setMsg(null); setD(null); if (!el.open) el.showModal(); void load(assetId) } else if (el.open) el.close()
  }, [assetId, load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) => {
    setBusy(true); setMsg(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error ?? 'Não foi possível concluir.' }); return false }
    if (okText) setMsg({ kind: 'ok', text: okText })
    if (assetId) await load(assetId)
    onChanged()
    return true
  }

  async function newVersion() {
    const file = fileRef.current?.files?.[0]
    if (!file || !d) return
    const fd = new FormData()
    fd.set('file', file); fd.set('parent_id', d.asset.id)
    const ok = await run(async () => {
      const res = await fetch('/api/media', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      return res.ok ? { ok: true } : { ok: false, error: j.error ?? 'Não foi possível enviar.' }
    }, 'Nova versão enviada.')
    if (ok && fileRef.current) fileRef.current.value = ''
  }

  const a = d?.asset
  return (
    <dialog ref={ref} className="modal light drawer" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close() }}>
      <div className="modal-head"><h3>{a ? a.title : 'Carregando…'}</h3><button type="button" className="ghost" aria-label="Fechar" onClick={() => ref.current?.close()}><X size={18} /></button></div>
      {!a || !d ? <div className="drawer-body">{msg ? <p className="form-error" role="alert">{msg.text}</p> : <p className="muted">Carregando…</p>}</div> : (
        <div className="drawer-body">
          <div className="asset-preview"><AssetPreview id={a.id} kind={a.kind} mime={a.mime_type} title={a.title} url={a.external_url} /></div>
          <p className="muted">{a.brand_name} · {a.branch_name ?? 'Todas as unidades'} · enviado por {a.uploaded_by_name ?? '—'}</p>
          {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

          <section>
            <h4>Versões</h4>
            <ul className="versions">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <b>v{v.version_number}</b>{v.is_final && <span className="pill on">Final</span>}
                  <small className="muted">{v.kind === 'file' ? `${v.mime_type} · ${formatBytes(v.size_bytes ?? 0)}` : 'link externo'} · {v.uploaded_by_name ?? '—'} · {when(v.created_at)}</small>
                  <span className="row-actions">
                    {v.kind === 'file'
                      ? <a className="mini-btn" href={`/api/media/${v.id}?baixar=1`}><Download size={13} /> Baixar</a>
                      : <a className="mini-btn" href={v.external_url ?? '#'} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir</a>}
                    {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => setFinalAction(v.id, !v.is_final), v.is_final ? 'Marca de final removida.' : 'Marcada como final aprovada.')}><Star size={13} /> {v.is_final ? 'Tirar final' : 'Marcar final'}</button>}
                  </span>
                </li>
              ))}
            </ul>
            {canEdit && a.kind === 'file' && (
              <div className="inline-add">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" aria-label="Arquivo da nova versão" />
                <button type="button" className="secondary" disabled={busy} onClick={newVersion}><Upload size={14} /> Enviar nova versão</button>
              </div>
            )}
          </section>

          <section>
            <h4>Etiquetas e uso</h4>
            <label htmlFor="asset-tags">Etiquetas (separe por vírgula)</label>
            <input id="asset-tags" type="text" value={tags} disabled={!canEdit} onChange={(e) => setTags(e.target.value)} />
            {canEdit && (
              <div className="form-actions" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="secondary" disabled={busy} onClick={() => run(() => setTagsAction(a.id, tags), 'Etiquetas salvas.')}>Salvar etiquetas</button>
                <label className="check inline"><input type="checkbox" checked={a.reusable_approved} disabled={busy} onChange={(e) => run(() => setReusableAction(a.id, e.target.checked))} /> Aprovada para reutilização</label>
              </div>
            )}
            <p className="muted" style={{ marginTop: 10 }}>Usada em: {d.usedIn.length === 0 ? 'nenhum conteúdo' : d.usedIn.map((u, i) => (
              <span key={u.post_id}>{i > 0 && ', '}<Link href={`/planejamento/conteudos/${u.post_id}`} className="inline-link">{u.title}</Link></span>
            ))}</p>
          </section>

          {canEdit && (
            <section>
              <button type="button" className="danger" disabled={busy} onClick={async () => {
                if (!window.confirm('Excluir esta peça (todas as versões) da biblioteca? Ela só some da lista; nada é apagado de verdade.')) return
                if (await run(() => deleteAssetAction(a.id))) ref.current?.close()
              }}><Trash2 size={14} /> Excluir da biblioteca</button>
            </section>
          )}
        </div>
      )}
    </dialog>
  )
}
