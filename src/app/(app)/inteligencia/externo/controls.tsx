'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { ICMS_RATES } from '@/lib/domain'
import { archiveNoteAction, refreshSourceAction, saveIcmsAction, saveNoteAction } from './actions'
import type { FormState } from '@/lib/form'

export function SourceButton({ sourceKey, label }: { sourceKey: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  return (
    <div>
      <button type="button" className="secondary" disabled={busy} data-source={sourceKey} onClick={async () => {
        setBusy(true); setMsg(null)
        const r = await refreshSourceAction(sourceKey)
        setBusy(false)
        setMsg(r.ok ? { kind: 'ok', text: r.message } : { kind: 'error', text: r.error })
        if (r.ok) setTimeout(() => router.refresh(), 0)
      }}><RefreshCw size={13} /> {busy ? 'Atualizando… (pode levar 1 minuto)' : label}</button>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}

export function IcmsForm({ brandId, name, current, canEdit }: { brandId: string; name: string; current: number | null; canEdit: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(current === null ? '' : String(current))
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  return (
    <div className="icms-row" data-brand={name}>
      <label htmlFor={`icms-${brandId}`}><b>{name}</b> — alíquota de ICMS</label>
      <select id={`icms-${brandId}`} value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)}>
        <option value="">Não cadastrada</option>
        {ICMS_RATES.map((r) => <option key={r} value={r}>{String(r).replace('.', ',')}%</option>)}
      </select>
      {canEdit && <button type="button" className="secondary" onClick={async () => {
        const r = await saveIcmsAction(brandId, value === '' ? null : Number(value))
        setMsg(r.ok ? { kind: 'ok', text: 'Salvo.' } : { kind: 'error', text: r.error })
        if (r.ok) router.refresh()
      }}>Salvar</button>}
      {msg && <span className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}> {msg.text}</span>}
    </div>
  )
}

export function NoteForm({ today }: { today: string }) {
  const router = useRouter()
  const act = async (prev: FormState, fd: FormData) => {
    const r = await saveNoteAction(prev, fd)
    if (r.ok) setTimeout(() => router.refresh(), 0)
    return r
  }
  return (
    <details className="card new-request">
      <summary>Registrar uma pesquisa</summary>
      <ActionForm action={act} submit="Salvar nota">
        <div className="grid-3">
          <div><label htmlFor="nt-kind">Tipo</label><select id="nt-kind" name="kind" defaultValue="mercado"><option value="regra">Regra</option><option value="preco">Preço</option><option value="sazonalidade">Sazonalidade</option><option value="mercado">Mercado</option></select></div>
          <div><label htmlFor="nt-conf">Confiança na fonte</label><select id="nt-conf" name="confidence" defaultValue="media"><option value="alta">Alta (fonte oficial)</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div>
          <div><label htmlFor="nt-date">Acessado em</label><input id="nt-date" name="accessed_on" type="date" defaultValue={today} /></div>
        </div>
        <label htmlFor="nt-title">Título</label>
        <input id="nt-title" name="title" type="text" maxLength={160} />
        <label htmlFor="nt-sum">O que a fonte diz (com suas palavras, sem copiar trechos longos)</label>
        <textarea id="nt-sum" name="summary" rows={4} maxLength={2000} />
        <div className="grid-3">
          <div><label htmlFor="nt-src">Nome da fonte</label><input id="nt-src" name="source_name" type="text" maxLength={160} /></div>
          <div><label htmlFor="nt-url">Endereço da fonte (https://)</label><input id="nt-url" name="source_url" type="text" inputMode="url" /></div>
          <div><label htmlFor="nt-tags">Etiquetas</label><input id="nt-tags" name="tags" type="text" /></div>
        </div>
        <p className="muted">Toda nota exige fonte e data de acesso. Notas são referência para decidir, não aconselhamento jurídico.</p>
      </ActionForm>
    </details>
  )
}

export function ArchiveNote({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return <button type="button" className="mini-btn" disabled={busy} onClick={async () => { setBusy(true); await archiveNoteAction(id, !archived); setBusy(false); router.refresh() }}>{archived ? 'Reativar' : 'Arquivar'}</button>
}
