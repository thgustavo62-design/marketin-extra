'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

export function NewPromo({ themes }: { themes: { id: string; name: string }[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = fileRef.current?.files?.[0]
    if (!f) { setMsg({ kind: 'error', text: 'Escolha a planilha (.xlsx).' }); return }
    setBusy(true); setMsg(null)
    try {
      const fd = new FormData(e.currentTarget); fd.set('file', f)
      if (!fd.get('group')) fd.set('group', '0') // caixa desmarcada não vai no formulário
      const res = await fetch('/api/promocoes/importar', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível importar.' }); return }
      router.push(`/promocoes/${j.id}`) // direto para o editor, para ajustar e aprovar os encartes
    } finally { setBusy(false) }
  }

  return (
    <section className="card" aria-label="Nova promoção">
      <h3><FileSpreadsheet size={16} style={{ verticalAlign: -3 }} /> Nova promoção a partir de planilha</h3>
      <p className="muted">Envie a planilha do ERP: o sistema lê só <strong>Código de barras</strong>, <strong>Descrição</strong> e <strong>Valor aproximado</strong> (o preço que vai para a peça), em todas as abas. A foto vem do banco de imagens pelo código de barras. As peças de story, feed e A4 são montadas sozinhas e você cai direto no editor para ajustar e aprovar. <a href="/api/promocoes/modelo">Baixar planilha de exemplo</a>.</p>
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
        <label><input type="checkbox" name="group" value="1" defaultChecked /> Agrupar variações no mesmo encarte (tamanhos de fralda com tabela de unidades; fragrâncias e sabores com uma foto só)</label>
        <div className="grid-2">
          <div><label htmlFor="np-title">Título na peça (opcional)</label><input id="np-title" name="title" type="text" maxLength={60} placeholder="Ex.: ATACADÃO DO BEBÊ" /></div>
          <div><label htmlFor="np-val">Validade (opcional)</label><input id="np-val" name="validity" type="text" maxLength={80} placeholder="Ex.: Válido de 20 a 26/10" /></div>
        </div>
        {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="form-actions"><button type="submit" className="primary" disabled={busy}>{busy ? 'Montando…' : 'Montar promoção'}</button></div>
      </form>
    </section>
  )
}
