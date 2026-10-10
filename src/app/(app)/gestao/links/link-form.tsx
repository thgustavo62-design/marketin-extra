'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { UTM_SUGGESTED_MEDIUMS, buildFinalUrl, normalizeUtm, slugUtm, validateDestination } from '@/lib/domain'
import type { FormState } from '@/lib/form'
import { createLinkAction } from './actions'

type Brand = { id: string; name: string }
type Branch = { id: string; brand_id: string; name: string }
type Camp = { id: string; brand_id: string; name: string }

export function LinkForm({ brands, branches, campaigns, defaultBrandId }: { brands: Brand[]; branches: Branch[]; campaigns: Camp[]; defaultBrandId?: string }) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '')
  const [dest, setDest] = useState('')
  const [source, setSource] = useState('instagram'), [medium, setMedium] = useState('social'), [campaign, setCampaign] = useState(''), [term, setTerm] = useState(''), [content, setContent] = useState('')
  const units = branches.filter((b) => b.brand_id === brandId)

  // Prévia do link final enquanto digita (a validação definitiva é do servidor).
  const preview = useMemo(() => {
    if (!dest.trim()) return null
    const d = validateDestination(dest)
    if (!d.ok) return { error: d.error }
    const u = normalizeUtm({ source, medium, campaign, term, content })
    if (!u.ok) return { error: u.error }
    return { url: buildFinalUrl(d.url, u.utm), removed: d.removedParams }
  }, [dest, source, medium, campaign, term, content])

  const act = async (prev: FormState, fd: FormData) => {
    const r = await createLinkAction(prev, fd)
    if (r.ok) setTimeout(() => router.refresh(), 0)
    return r
  }
  return (
    <details className="card new-request">
      <summary>Novo link</summary>
      <ActionForm action={act} submit="Criar link (rascunho)">
        <div className="grid-3">
          <div>
            <label htmlFor="lk-brand">Filial</label>
            <select id="lk-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div>
            <label htmlFor="lk-unit">Unidade</label>
            <select id="lk-unit" name="branch_id" key={brandId} defaultValue=""><option value="">Todas as unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
          <div>
            <label htmlFor="lk-camp">Campanha (opcional)</label>
            <select id="lk-camp" name="campaign_id" key={`c-${brandId}`} defaultValue=""><option value="">Nenhuma</option>{campaigns.filter((c) => c.brand_id === brandId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
        </div>
        <label htmlFor="lk-label">Nome do link</label>
        <input id="lk-label" name="label" type="text" maxLength={120} placeholder="Ex.: Cartaz do balcão — Clube de vantagens" />
        <label htmlFor="lk-dest">Destino (https://…)</label>
        <input id="lk-dest" name="destination" type="text" inputMode="url" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="https://www.seusite.com.br/clube" />
        <div className="grid-3">
          <div><label htmlFor="lk-src">Origem (utm_source)</label><input id="lk-src" name="utm_source" type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="instagram, cartaz, whatsapp" /></div>
          <div>
            <label htmlFor="lk-med">Meio (utm_medium)</label>
            <input id="lk-med" name="utm_medium" type="text" list="lk-mediums" value={medium} onChange={(e) => setMedium(e.target.value)} />
            <datalist id="lk-mediums">{UTM_SUGGESTED_MEDIUMS.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div><label htmlFor="lk-utmc">Campanha (utm_campaign)</label><input id="lk-utmc" name="utm_campaign" type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="fim-de-semana-da-limpeza" /></div>
          <div><label htmlFor="lk-term">Termo (opcional)</label><input id="lk-term" name="utm_term" type="text" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          <div><label htmlFor="lk-cont">Conteúdo (opcional)</label><input id="lk-cont" name="utm_content" type="text" value={content} onChange={(e) => setContent(e.target.value)} placeholder="reels-1, story-2" /></div>
        </div>
        {campaign && slugUtm(campaign) !== campaign && <p className="muted">Será gravado como <b>{slugUtm(campaign, 80)}</b> (minúsculas, sem acento, sem espaços).</p>}
        {preview && ('error' in preview
          ? <p className="muted" data-preview="erro">{preview.error}</p>
          : <p className="preview-url" data-preview="ok"><small className="muted">Link final</small><br /><code>{preview.url}</code>{preview.removed.length > 0 && <><br /><small className="muted">Parâmetros que já estavam no destino e serão substituídos: {preview.removed.join(', ')}</small></>}</p>)}
        <label htmlFor="lk-notes">Observação (opcional)</label>
        <input id="lk-notes" name="notes" type="text" maxLength={500} />
        <p className="muted">O sistema não mede cliques: para ver visitas, use o analytics do site de destino filtrando pelos parâmetros UTM. Nenhum dado pessoal vai no link.</p>
      </ActionForm>
    </details>
  )
}
