'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { FileSpreadsheet, ImagePlus } from 'lucide-react'

const BATCH_BYTES = 3_500_000 // o servidor aceita 4 MB por envio
const BATCH_FILES = 12

type Row = { file: string; status: string; method?: string; description?: string; error?: string }
type Summary = { ligada: number; similar: number; pendente: number; duplicada: number; invalida: number; erros: Row[] }

export function Importer() {
  const router = useRouter()
  const erpRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const [erpMsg, setErpMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [erpBusy, setErpBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [sum, setSum] = useState<Summary | null>(null)
  const [drag, setDrag] = useState(false)

  async function sendErp() {
    const f = erpRef.current?.files?.[0]
    if (!f) { setErpMsg({ kind: 'error', text: 'Escolha a planilha do ERP.' }); return }
    setErpBusy(true); setErpMsg(null)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch('/api/produtos/importar-erp', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErpMsg({ kind: 'error', text: j.error ?? 'Não foi possível importar.' }); return }
      setErpMsg({ kind: 'ok', text: `${j.unique.toLocaleString('pt-BR')} produtos únicos (${j.created.toLocaleString('pt-BR')} novos, ${j.updated.toLocaleString('pt-BR')} atualizados) a partir de ${j.rows.toLocaleString('pt-BR')} linhas. ${j.enriched.toLocaleString('pt-BR')} enriquecidos com a lista da CMED; ${j.withoutEan.toLocaleString('pt-BR')} sem código de barras. ${j.outOfStock.toLocaleString('pt-BR')} sem estoque e ${j.medicines.toLocaleString('pt-BR')} medicamentos deixados de fora (o banco de imagens não inclui medicamentos).` })
      if (erpRef.current) erpRef.current.value = ''
      router.refresh()
    } finally { setErpBusy(false) }
  }

  async function sendImages(list: File[]) {
    const files = list.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name) || f.type.startsWith('image/'))
    if (!files.length) return
    const s: Summary = { ligada: 0, similar: 0, pendente: 0, duplicada: 0, invalida: 0, erros: [] }
    setSum(null); setProgress({ done: 0, total: files.length })
    let done = 0
    let i = 0
    while (i < files.length) {
      const batch: File[] = []
      let bytes = 0
      while (i < files.length && batch.length < BATCH_FILES && (batch.length === 0 || bytes + files[i].size <= BATCH_BYTES)) { bytes += files[i].size; batch.push(files[i++]) }
      if (batch.length === 1 && batch[0].size > 4 * 1024 * 1024) {
        s.invalida++; s.erros.push({ file: batch[0].name, status: 'invalida', error: 'Passa de 4 MB: reduza a imagem antes de enviar.' })
      } else {
        const fd = new FormData(); for (const f of batch) fd.append('file', f)
        try {
          const res = await fetch('/api/produtos/imagens', { method: 'POST', body: fd })
          const j = await res.json().catch(() => ({}))
          if (!res.ok) for (const f of batch) { s.invalida++; s.erros.push({ file: f.name, status: 'invalida', error: j.error ?? 'Falha no envio.' }) }
          else for (const r of j.results as Row[]) {
            if (r.status === 'ligada') { if (r.method === 'similar') s.similar++; else s.ligada++ }
            else if (r.status === 'pendente') s.pendente++
            else if (r.status === 'duplicada') s.duplicada++
            else { s.invalida++; s.erros.push(r) }
          }
        } catch {
          for (const f of batch) { s.invalida++; s.erros.push({ file: f.name, status: 'invalida', error: 'Sem conexão.' }) }
        }
      }
      done += batch.length
      setProgress({ done, total: files.length })
    }
    setProgress(null); setSum(s)
    if (imgRef.current) imgRef.current.value = ''
    router.refresh()
  }

  return (
    <>
      <section className="card">
        <h3><FileSpreadsheet size={16} style={{ verticalAlign: -3 }} /> 1. Cadastro de produtos (planilha do ERP)</h3>
        <p className="muted">Exporte do ERP em Excel (.xlsx) com as colunas <strong>Descrição</strong> e <strong>Barras</strong> (ou Código); Grupo, Princípio Ativo e Registro MS são aproveitados quando existirem. Entram só produtos com estoque maior que zero. Medicamentos (CMED, registro MS de medicamento ou grupo genérico/similar/ético/OTC) são ignorados. Serve para as duas lojas: o mesmo produto vira um só e as duas descrições são guardadas. Reenviar atualiza sem duplicar. Limite de 4 MB por planilha.</p>
        <div className="form-actions">
          <input ref={erpRef} type="file" accept=".xlsx" aria-label="Planilha do ERP" />
          <button type="button" className="primary" onClick={sendErp} disabled={erpBusy}>{erpBusy ? 'Importando…' : 'Importar produtos'}</button>
        </div>
        {erpMsg && <p className={erpMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role={erpMsg.kind === 'error' ? 'alert' : 'status'}>{erpMsg.text}</p>}
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <h3><ImagePlus size={16} style={{ verticalAlign: -3 }} /> 2. Imagens dos produtos</h3>
        <p className="muted">Selecione ou arraste várias imagens (PNG, JPG, WEBP; recortes com fundo transparente são mantidos). O sistema liga cada imagem ao produto pelo <strong>nome do arquivo</strong> comparado à descrição do ERP (ou pelo código de barras, se o arquivo se chamar só com o número). O que não tiver certeza vai para a fila de <Link href="/produtos/conferir">conferência</Link> com sugestões.</p>
        <div
          className="empty"
          style={{ textAlign: 'center', borderColor: drag ? 'var(--blue)' : undefined, background: drag ? '#eef4ff' : undefined }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void sendImages(Array.from(e.dataTransfer.files)) }}
        >
          <p>Arraste as imagens aqui ou</p>
          <input ref={imgRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Imagens" onChange={(e) => void sendImages(Array.from(e.target.files ?? []))} disabled={!!progress} />
        </div>
        {progress && <p role="status" className="muted">Enviando {progress.done} de {progress.total}…</p>}
        {sum && (
          <div role="status" style={{ marginTop: 10 }}>
            <p className="form-ok">
              {sum.ligada} ligadas automaticamente · {sum.similar} ligadas por semelhança (conferir) · {sum.pendente} na fila para você decidir · {sum.duplicada} repetidas · {sum.invalida} recusadas.
            </p>
            {sum.erros.length > 0 && <ul className="files">{sum.erros.slice(0, 20).map((r, k) => <li key={k}><strong>{r.file}</strong><span className="muted">{r.error}</span></li>)}</ul>}
            {(sum.pendente > 0 || sum.similar > 0) && <p><Link href="/produtos/conferir" className="btn">Conferir agora</Link></p>}
          </div>
        )}
      </section>
    </>
  )
}
