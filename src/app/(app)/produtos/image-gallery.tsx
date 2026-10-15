'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Download, Search, Star, Trash2, Undo2, Upload } from 'lucide-react'
import type { ImageMeta } from '@/lib/catalog/store'
import { deleteImageAction, openImageAction, setPrimaryAction, unlinkImageAction } from './actions'

const SOURCE: Record<string, string> = { proprio: 'Arquivo próprio', upload: 'Enviada', open_beauty_facts: 'Open Beauty Facts', open_food_facts: 'Open Food Facts' }

export function ImageGallery({ productId, hasEan, images, canEdit }: { productId: string; hasEan: boolean; images: ImageMeta[]; canEdit: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, startTransition] = useTransition()
  const [sending, setSending] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn()
      setMsg(r.message ? { kind: r.ok ? 'ok' : 'error', text: r.message } : null)
      router.refresh()
    })

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setSending(true); setMsg(null)
    try {
      let ok = 0, fail = ''
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('product_id', productId); fd.append('file', f)
        const res = await fetch('/api/produtos/imagens', { method: 'POST', body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) fail = j.error ?? 'Não foi possível enviar.'
        else for (const r of j.results ?? []) { if (r.status === 'ligada') ok++; else if (r.status === 'duplicada') fail = 'Esta imagem já estava no produto.'; else fail = r.error ?? 'Imagem não aceita.' }
      }
      setMsg(fail ? { kind: 'error', text: fail } : { kind: 'ok', text: `${ok} imagem(ns) adicionada(s).` })
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } finally { setSending(false) }
  }

  return (
    <section className="card" aria-label="Imagens do produto">
      <div className="card-head">
        <h3>Imagens ({images.length})</h3>
        {canEdit && (
          <div className="form-actions" style={{ margin: 0 }}>
            <button type="button" className="secondary" onClick={() => fileRef.current?.click()} disabled={sending}><Upload size={14} /> {sending ? 'Enviando…' : 'Enviar imagem'}</button>
            <button type="button" className="secondary" disabled={busy || !hasEan} title={hasEan ? '' : 'Cadastre o código de barras para buscar'} onClick={() => run(() => openImageAction(productId))}><Search size={14} /> Buscar foto pelo EAN</button>
            <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files)} />
          </div>
        )}
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      {images.length === 0 ? (
        <p className="empty">Este produto ainda não tem imagem. Envie uma (PNG, JPG ou WEBP; fundo transparente é mantido){hasEan ? ' ou busque pelo código de barras nos bancos abertos' : ''}.</p>
      ) : (
        <div className="asset-grid">
          {images.map((i) => (
            <article key={i.id} className="asset-card">
              <span className="asset-thumb" style={{ height: 170 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="thumb" style={{ maxHeight: 170 }} src={`/api/produtos/imagem/${i.id}`} alt="" loading="lazy" />
              </span>
              <div className="asset-meta">
                {i.is_primary && <span className="pill on"><Star size={11} /> Principal</span>}
                <span className="badge">{SOURCE[i.source] ?? i.source}</span>
                {i.match_method === 'similar' && <span className="pill soft">Conferir</span>}
              </div>
              <small className="muted">{i.width}×{i.height} · {Math.round(i.size_bytes / 1024)} KB{i.original_name ? ` · ${i.original_name}` : ''}</small>
              {i.license && <small className="muted">Licença {i.license}. Crédito: {i.attribution}{i.source_url && <> · <a href={i.source_url} target="_blank" rel="noopener noreferrer">fonte</a></>}</small>}
              <div className="card-actions" style={{ marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                <a className="mini-btn" href={`/api/produtos/imagem/${i.id}?baixar=1`}><Download size={12} /> Baixar</a>
                {canEdit && !i.is_primary && <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => setPrimaryAction(i.id, productId))}><Star size={12} /> Tornar principal</button>}
                {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => unlinkImageAction(i.id, productId))}><Undo2 size={12} /> Não é deste produto</button>}
                {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => { if (confirm('Excluir esta imagem?')) run(() => deleteImageAction(i.id, productId)) }}><Trash2 size={12} /> Excluir</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
