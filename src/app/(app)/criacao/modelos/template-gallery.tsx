'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TEMPLATE_CATEGORIES, templateCategoryLabel } from '@/lib/domain/promo-templates'
import { createDesignFromTemplateAction, deleteTemplateAction } from '../../promocoes/actions'
import { templateFieldsAction } from './fields-action'

type T = { id: string; name: string; category: string; pages: number; formatLabel: string; hint: string; thumbAt: string | null; by: string | null; mine: boolean }
type Field = { id: string; text: string; page: number | null; format: string }

export function TemplateGallery({ templates, canEdit, isAdmin }: { templates: T[]; canEdit: boolean; userId: string; isAdmin: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('todas')
  const [using, setUsing] = useState<{ id: string; name: string; fields: Field[] } | null>(null)
  const [name, setName] = useState('')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()
  const shown = filter === 'todas' ? templates : templates.filter((t) => t.category === filter)

  function open(t: T) {
    setErr('')
    start(async () => {
      const r = await templateFieldsAction(t.id)
      if (!r) { setErr('Modelo não encontrado.'); return }
      setUsing({ id: t.id, name: t.name, fields: r.fields }); setName(t.name.slice(0, 100)); setTexts(Object.fromEntries(r.fields.map((f) => [f.id, f.text])))
    })
  }
  function create() {
    if (!using) return
    setErr('')
    // só manda o que a pessoa mudou
    const changed = Object.fromEntries(using.fields.filter((f) => (texts[f.id] ?? f.text) !== f.text).map((f) => [f.id, texts[f.id]]))
    start(async () => { const r = await createDesignFromTemplateAction(using.id, name, changed); if (r.ok && r.id) router.push(`/criacao/${r.id}`); else setErr(r.error ?? 'Não foi possível criar.') })
  }

  return (
    <>
      <div className="canva-chips" role="group" aria-label="Categoria dos modelos" style={{ margin: '8px 0 12px' }}>
        <button type="button" className={filter === 'todas' ? 'on' : ''} onClick={() => setFilter('todas')}>Todos ({templates.length})</button>
        {TEMPLATE_CATEGORIES.map((c) => <button key={c.id} type="button" className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.label} ({templates.filter((t) => t.category === c.id).length})</button>)}
      </div>
      {using && (
        <section className="card stack-form" aria-label="Criar a partir do modelo" data-using={using.id}>
          <h3>Criar a partir de &quot;{using.name}&quot;</h3>
          <label htmlFor="tpl-name">Nome do novo design</label>
          <input id="tpl-name" type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          {using.fields.length > 0 && <p className="muted">Troque os textos do modelo (deixe como está para manter):</p>}
          {using.fields.map((f, i) => (
            <div key={f.id}><label htmlFor={`tpl-f-${i}`}>Texto {i + 1}{f.page !== null ? ` (peça ${f.page + 1})` : ''}</label>
              <input id={`tpl-f-${i}`} type="text" value={texts[f.id] ?? ''} maxLength={300} onChange={(e) => setTexts({ ...texts, [f.id]: e.target.value })} /></div>
          ))}
          <div className="form-actions">
            <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy || name.trim().length < 2} onClick={create}>{busy ? 'Criando…' : 'Criar design'}</button>
            <button type="button" className="mini-btn" onClick={() => setUsing(null)}>Cancelar</button>
          </div>
        </section>
      )}
      {err && <p className="form-error" role="alert">{err}</p>}
      {shown.length === 0 ? <p className="empty">{templates.length === 0 ? 'Nenhum modelo ainda.' : 'Nenhum modelo nesta categoria.'}</p> : (
        <div className="cards">
          {shown.map((t) => (
            <article key={t.id} className="card design-card template-card" data-id={t.id}>
              {t.thumbAt
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="design-thumb" src={`/api/promocoes/miniatura/${t.id}?v=${encodeURIComponent(t.thumbAt)}`} alt="" loading="lazy" />
                : <span className="design-thumb empty">sem miniatura</span>}
              <h3>{t.name}</h3>
              <p className="muted"><span className="badge">{templateCategoryLabel(t.category)}</span><span className="badge">{t.formatLabel}</span>{t.pages} peça(s) · {t.hint}{t.by ? ` · ${t.by}` : ''}</p>
              <div className="row-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {canEdit && <button type="button" className="mini-btn primary" disabled={busy} onClick={() => open(t)}>Usar este modelo</button>}
                {canEdit && (isAdmin || t.mine) && <button type="button" className="mini-btn danger" disabled={busy} onClick={() => { if (confirm(`Excluir o modelo "${t.name}"? Designs já criados com ele não mudam.`)) start(async () => { const r = await deleteTemplateAction(t.id); if (!r.ok) setErr(r.error ?? 'Não foi possível excluir.'); router.refresh() }) }}>Excluir</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
