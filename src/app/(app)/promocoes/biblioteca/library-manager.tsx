'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload } from 'lucide-react'
import { LIBRARY_CATEGORIES, MAX_LIBRARY_FILE_BYTES, categoryLabel, type LibraryCategory } from '@/lib/domain/promo-library'
import type { LibraryItem } from '@/lib/promo/library'
import { deleteLibraryItemAction, updateLibraryItemAction } from '../actions'

export function LibraryManager({ items, canEdit }: { items: LibraryItem[]; canEdit: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<LibraryCategory | 'todas'>('todas')
  const [category, setCategory] = useState<LibraryCategory>('icone')
  const [busy, start] = useTransition()
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const shown = filter === 'todas' ? items : items.filter((i) => i.category === filter)
  const count = (c: string) => items.filter((i) => i.category === c).length

  async function upload(files: File[]) {
    if (!files.length) return
    setMsg(null); setUploading({ done: 0, total: files.length })
    const erros: string[] = []
    let novas = 0, repetidas = 0
    for (const [i, f] of files.entries()) {
      if (f.size > MAX_LIBRARY_FILE_BYTES) { erros.push(`${f.name}: passa de 4 MB`); setUploading({ done: i + 1, total: files.length }); continue }
      const fd = new FormData(); fd.append('file', f); fd.append('category', category)
      try {
        const r = await fetch('/api/promocoes/biblioteca', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) erros.push(`${f.name}: ${j.error ?? 'falhou'}`)
        else if (j.duplicate) repetidas++
        else novas++
      } catch { erros.push(`${f.name}: sem conexão`) }
      setUploading({ done: i + 1, total: files.length })
    }
    setUploading(null)
    if (fileRef.current) fileRef.current.value = ''
    setMsg({ ok: erros.length === 0, text: `${novas} imagem(ns) adicionada(s)${repetidas ? ` · ${repetidas} já estava(m) na biblioteca` : ''}${erros.length ? ` · ${erros.length} com problema: ${erros.slice(0, 3).join('; ')}` : ''}.` })
    router.refresh()
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Não foi possível concluir.' }); router.refresh() })

  return (
    <>
      {canEdit && (
        <section className="card stack-form" aria-label="Enviar imagens">
          <div className="grid-2">
            <div>
              <label htmlFor="lib-cat">Categoria das imagens que vai enviar</label>
              <select id="lib-cat" value={category} disabled={!!uploading} onChange={(e) => setCategory(e.target.value as LibraryCategory)}>
                {LIBRARY_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lib-file">Imagens (PNG, JPG, WEBP, GIF ou SVG; até 4 MB cada; pode escolher várias)</label>
              <input id="lib-file" ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg" disabled={!!uploading} onChange={(e) => void upload([...(e.target.files ?? [])])} />
            </div>
          </div>
          {uploading && <p className="muted" role="status"><Upload size={13} style={{ verticalAlign: -2 }} /> Enviando {uploading.done} de {uploading.total}…</p>}
          {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        </section>
      )}

      <div className="canva-chips lib-filter" role="group" aria-label="Filtrar por categoria" style={{ margin: '14px 0 10px' }}>
        <button type="button" className={filter === 'todas' ? 'on' : ''} onClick={() => setFilter('todas')}>Todas ({items.length})</button>
        {LIBRARY_CATEGORIES.map((c) => <button key={c.id} type="button" className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.label} ({count(c.id)})</button>)}
      </div>

      {shown.length === 0 ? <p className="empty">Nenhuma imagem {filter === 'todas' ? 'na biblioteca' : `em ${categoryLabel(filter)}`} ainda.</p> : (
        <div className="lib-grid">
          {shown.map((i) => (
            <article key={i.id} className="lib-card" data-id={i.id}>
              <div className="lib-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/promocoes/biblioteca/${i.id}?mini=1`} alt={i.name} loading="lazy" />
              </div>
              {editing === i.id && canEdit ? (
                <form className="lib-edit" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setEditing(null); run(() => updateLibraryItemAction(i.id, String(fd.get('name') ?? ''), String(fd.get('category') ?? 'outro'))) }}>
                  <input name="name" aria-label="Nome da imagem" defaultValue={i.name} maxLength={80} autoFocus />
                  <select name="category" aria-label="Categoria da imagem" defaultValue={i.category}>{LIBRARY_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                  <span><button type="submit" className="mini-btn primary">Salvar</button> <button type="button" className="mini-btn" onClick={() => setEditing(null)}>Cancelar</button></span>
                </form>
              ) : (
                <div className="lib-info">
                  <strong title={i.name}>{i.name}</strong>
                  <small className="muted">{categoryLabel(i.category)} · {i.width}×{i.height}</small>
                  {canEdit && (
                    <span className="lib-actions">
                      <button type="button" className="mini-btn" disabled={busy} onClick={() => setEditing(i.id)}>Editar</button>
                      <button type="button" className="mini-btn danger" disabled={busy} aria-label={`Excluir ${i.name}`} onClick={() => { if (confirm(`Excluir "${i.name}" da biblioteca? Peças que já usaram esta imagem não mudam.`)) run(() => deleteLibraryItemAction(i.id)) }}><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  )
}
