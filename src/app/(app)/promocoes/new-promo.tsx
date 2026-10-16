'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

type Report = { created: number; notInCatalog: { ean: string; name: string | null }[]; withoutPhoto: { ean: string; name: string }[] }

export function NewPromo({ themes }: { themes: { id: string; name: string }[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [done, setDone] = useState<{ id: string; report: Report; errors: { line: number; message: string }[]; sheets: { name: string; items: number }[] } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = fileRef.current?.files?.[0]
    if (!f) { setMsg({ kind: 'error', text: 'Escolha a planilha (.xlsx).' }); return }
    setBusy(true); setMsg(null); setDone(null)
    try {
      const fd = new FormData(e.currentTarget); fd.set('file', f)
      const res = await fetch('/api/promocoes/importar', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível importar.' }); return }
      setDone({ id: j.id, report: j.report, errors: j.errors ?? [], sheets: j.sheets ?? [] })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <section className="card" aria-label="Nova promoção">
      <h3><FileSpreadsheet size={16} style={{ verticalAlign: -3 }} /> Nova promoção a partir de planilha</h3>
      <p className="muted">Envie uma planilha com duas colunas: <strong>Código de barras</strong> e <strong>Valor aproximado</strong> (o preço que vai para a peça). O sistema acha o produto no catálogo, usa o nome do ERP e a foto do banco de imagens e monta as peças de story, feed e A4. <a href="/api/promocoes/modelo">Baixar planilha de exemplo</a>.</p>
      <form onSubmit={submit} className="stack-form wide">
        <div className="grid-3">
          <div><label htmlFor="np-name">Nome da promoção</label><input id="np-name" name="name" type="text" maxLength={120} placeholder="Ex.: Atacadão do Bebê — outubro" /></div>
          <div><label htmlFor="np-theme">Tema (arte)</label>
            <select id="np-theme" name="theme_id" defaultValue={themes[0]?.id ?? ''}>
              <option value="">Sem tema (arte padrão)</option>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div><label htmlFor="np-file">Planilha (.xlsx)</label><input id="np-file" ref={fileRef} type="file" accept=".xlsx" /></div>
        </div>
        <div className="grid-2">
          <div><label htmlFor="np-title">Título na peça (opcional)</label><input id="np-title" name="title" type="text" maxLength={60} placeholder="Ex.: ATACADÃO DO BEBÊ" /></div>
          <div><label htmlFor="np-val">Validade (opcional)</label><input id="np-val" name="validity" type="text" maxLength={80} placeholder="Ex.: Válido de 20 a 26/10" /></div>
        </div>
        {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="form-actions"><button type="submit" className="primary" disabled={busy}>{busy ? 'Montando…' : 'Montar promoção'}</button></div>
      </form>
      {done && (
        <div role="status" style={{ marginTop: 10 }}>
          <p className="form-ok">Promoção criada com {done.report.created} produto(s). <Link href={`/promocoes/${done.id}`} className="btn">Abrir e baixar as peças</Link></p>
          {done.sheets.length > 1 && <p className="muted">Abas lidas: {done.sheets.map((x) => `${x.name} (${x.items})`).join(' · ')}</p>}
          {done.report.withoutPhoto.length > 0 && <p className="muted"><strong>{done.report.withoutPhoto.length}</strong> sem foto no banco: {done.report.withoutPhoto.slice(0, 6).map((x) => x.name).join(' · ')}{done.report.withoutPhoto.length > 6 ? '…' : ''}</p>}
          {done.report.notInCatalog.length > 0 && <p className="muted"><strong>{done.report.notInCatalog.length}</strong> código(s) fora do catálogo: {done.report.notInCatalog.slice(0, 6).map((x) => x.ean).join(', ')}</p>}
          {done.errors.length > 0 && <ul className="files">{done.errors.slice(0, 8).map((e) => <li key={e.line}><strong>linha {e.line}</strong><span className="muted">{e.message}</span></li>)}</ul>}
        </div>
      )}
    </section>
  )
}
