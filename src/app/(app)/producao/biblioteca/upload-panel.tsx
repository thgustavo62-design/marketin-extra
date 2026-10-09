'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Link2, Upload } from 'lucide-react'
import { createLinkAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }

// Envio de arquivo (até 4 MB) ou cadastro de link (vídeos e arquivos grandes).
export function UploadPanel({ brands, branches, defaultBrandId }: { brands: Brand[]; branches: Branch[]; defaultBrandId?: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const units = branches.filter((b) => b.brand_id === brandId)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setBusy(true); setMsg(null)
    try {
      if (mode === 'file') {
        const file = fileRef.current?.files?.[0]
        if (!file) { setMsg({ kind: 'error', text: 'Escolha um arquivo.' }); return }
        if (file.size > 4 * 1024 * 1024) { setMsg({ kind: 'error', text: 'O arquivo passa de 4 MB. Para vídeos e arquivos grandes, use "Link".' }); return }
        const res = await fetch('/api/media', { method: 'POST', body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar.' }); return }
      } else {
        const r = await createLinkAction({}, fd)
        if (r.error) { setMsg({ kind: 'error', text: r.error }); return }
      }
      form.reset()
      setMsg({ kind: 'ok', text: mode === 'file' ? 'Arquivo enviado.' : 'Link adicionado.' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card upload-panel" aria-label="Adicionar à biblioteca">
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={`tab${mode === 'file' ? ' active' : ''}`} onClick={() => setMode('file')}><Upload size={13} /> Arquivo (até 4 MB)</button>
        <button type="button" className={`tab${mode === 'link' ? ' active' : ''}`} onClick={() => setMode('link')}><Link2 size={13} /> Link (vídeos e arquivos grandes)</button>
      </div>
      <form onSubmit={submit} className="stack-form">
        <div className="grid-3">
          <div>
            <label htmlFor="up-brand">Filial</label>
            <select id="up-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="up-unit">Unidade</label>
            <select id="up-unit" name="branch_id" key={brandId} defaultValue="">
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="up-title">Título</label>
            <input id="up-title" name="title" type="text" maxLength={160} placeholder={mode === 'file' ? 'Opcional (usa o nome do arquivo)' : 'Ex.: Reels Corta Preço — vídeo final'} required={mode === 'link'} />
          </div>
        </div>
        {mode === 'file' ? (
          <>
            <label htmlFor="up-file">Arquivo (PNG, JPG, WEBP, GIF ou PDF)</label>
            <input id="up-file" ref={fileRef} name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
          </>
        ) : (
          <>
            <label htmlFor="up-url">Endereço (https://…)</label>
            <input id="up-url" name="url" type="text" inputMode="url" placeholder="https://drive.google.com/…" required />
          </>
        )}
        <label htmlFor="up-tags">Etiquetas (separe por vírgula)</label>
        <input id="up-tags" name="tags" type="text" placeholder="ofertas, limpeza, reels" />
        {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="form-actions"><button type="submit" className="primary" disabled={busy}>{busy ? 'Enviando…' : mode === 'file' ? 'Enviar arquivo' : 'Adicionar link'}</button></div>
      </form>
    </section>
  )
}
