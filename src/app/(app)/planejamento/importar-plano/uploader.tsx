'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FileUp } from 'lucide-react'
import type { Branch, Brand } from '@/lib/data'

const MAX_MB = 4

export function PlanUploader({ brands, branches, defaultBrandId }: { brands: Brand[]; branches: Branch[]; defaultBrandId?: string }) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; existingId?: string } | null>(null)
  const units = branches.filter((b) => b.brand_id === brandId)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) { setError({ text: 'Escolha o PDF do plano.' }); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError({ text: `O PDF passa de ${MAX_MB} MB. Exporte de novo sem imagens pesadas.` }); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/plano/analisar', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string; existingId?: string }
      if (!res.ok || !json.ok || !json.id) { setError({ text: json.error ?? 'Não foi possível ler o PDF.', existingId: json.existingId }); setBusy(false); return }
      router.push(`/planejamento/importar-plano/${json.id}`)
    } catch {
      setError({ text: 'Falha de conexão ao enviar o PDF. Tente de novo.' }); setBusy(false)
    }
  }

  return (
    <form className="stack-form" onSubmit={submit} noValidate>
      <div className="grid-3">
        <div>
          <label htmlFor="pi-brand">Filial</label>
          <select id="pi-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pi-branch">Unidade</label>
          <select id="pi-branch" name="branch_id" key={brandId} defaultValue="">
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pi-file">PDF do plano (até {MAX_MB} MB)</label>
          <input id="pi-file" name="file" type="file" accept="application/pdf,.pdf" required />
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error.text}{error.existingId && <> <Link href={`/planejamento/importar-plano/${error.existingId}`} className="inline-link">Ver a importação anterior</Link>.</>}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy}><FileUp size={15} /> {busy ? 'Lendo o PDF… (pode levar até 1 minuto)' : 'Ler o PDF e ver a prévia'}</button>
      </div>
    </form>
  )
}
