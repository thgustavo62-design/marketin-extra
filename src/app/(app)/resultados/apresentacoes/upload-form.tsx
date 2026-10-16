'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { CHUNK_BYTES, MAX_PRESENTATION_BYTES, chunkCountFor, kindFromName, titleFromFileName } from '@/lib/domain/presentations'

type Brand = { id: string; name: string }

/** Envia o PPTX/PDF em partes de 3,5 MB (a Vercel limita cada requisição a 4,5 MB) e fecha o envio no fim. */
export function UploadForm({ brands, defaultBrandId }: { brands: Brand[]; defaultBrandId?: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [brandId, setBrandId] = useState(defaultBrandId ?? '')
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function pick(f: File | undefined) {
    setMsg(null)
    setFile(f ?? null)
    if (f && !title) setTitle(titleFromFileName(f.name))
  }

  async function send() {
    if (!file) return
    const kind = kindFromName(file.name)
    if (!kind) { setMsg({ ok: false, text: 'Use um arquivo PPTX ou PDF.' }); return }
    if (file.size > MAX_PRESENTATION_BYTES) { setMsg({ ok: false, text: `O arquivo passa de ${MAX_PRESENTATION_BYTES / 1024 / 1024} MB. Exporte um PDF mais leve.` }); return }
    setBusy(true); setPct(0); setMsg(null)
    try {
      const chunks = chunkCountFor(file.size)
      const start = await fetch('/api/apresentacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title || titleFromFileName(file.name), description: desc, fileName: file.name, kind, size: file.size, chunks, brandId }) })
      const s = await start.json().catch(() => ({}))
      if (!start.ok) throw new Error(s.error ?? 'Não foi possível iniciar o envio.')
      for (let i = 0; i < chunks; i++) {
        const part = file.slice(i * CHUNK_BYTES, Math.min(file.size, (i + 1) * CHUNK_BYTES))
        let ok = false, last = ''
        for (let t = 0; t < 3 && !ok; t++) { // até 3 tentativas por parte (rede instável)
          const r = await fetch(`/api/apresentacoes/${s.id}/parte/${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: part })
          if (r.ok) ok = true
          else last = (await r.json().catch(() => ({}))).error ?? 'Falha no envio.'
        }
        if (!ok) throw new Error(last)
        setPct(Math.round(((i + 1) / chunks) * 100))
      }
      const fin = await fetch(`/api/apresentacoes/${s.id}/concluir`, { method: 'POST' })
      const f = await fin.json().catch(() => ({}))
      if (!fin.ok) throw new Error(f.error ?? 'Não foi possível concluir o envio.')
      setMsg({ ok: true, text: 'Apresentação enviada.' })
      setFile(null); setTitle(''); setDesc('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha no envio.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="stack-form">
      <label htmlFor="ap-file">Arquivo (PPTX ou PDF, até {MAX_PRESENTATION_BYTES / 1024 / 1024} MB)</label>
      <input id="ap-file" ref={fileRef} type="file" accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      <div className="grid-2">
        <div><label htmlFor="ap-title">Título</label><input id="ap-title" type="text" value={title} maxLength={160} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <label htmlFor="ap-brand">Filial</label>
          <select id="ap-brand" value={brandId} disabled={busy} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Geral (todas as filiais)</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor="ap-desc">Descrição (opcional)</label>
      <input id="ap-desc" type="text" value={desc} maxLength={500} disabled={busy} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Reunião mensal com a diretoria" />
      <p className="muted">Dica: PDF exportado do PowerPoint fica idêntico ao original. O PPTX é desenhado pelo navegador e pode mudar fontes e efeitos.</p>
      <div className="form-actions">
        <button type="button" className="primary" style={{ width: 'auto' }} disabled={!file || busy} onClick={() => void send()}><Upload size={14} /> {busy ? `Enviando… ${pct}%` : 'Enviar apresentação'}</button>
      </div>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  )
}
