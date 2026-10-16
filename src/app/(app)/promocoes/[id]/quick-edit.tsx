'use client'

// Edição rápida direto na peça: duplo clique em um encarte abre nome, subtítulo e preço ao lado dele.
import { useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

export type QuickValues = { name: string; note: string; price: string }

export function QuickEdit({ initial, left, top, disabled, onSave, onClose }: { initial: QuickValues; left: number; top: number; disabled: boolean; onSave: (v: QuickValues) => void; onClose: () => void }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLDivElement>(null)
  const save = () => { if (!disabled) onSave(v) }
  return (
    <div ref={ref} className="canva-quick" role="dialog" aria-label="Edição rápida do encarte" style={{ left: `min(${left}%, calc(100% - 262px))`, top: `${top}%` }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName === 'INPUT')) { e.preventDefault(); save() } }}
      onClick={(e) => e.stopPropagation()}>
      <label htmlFor="qe-name">Nome</label>
      <textarea id="qe-name" rows={2} autoFocus maxLength={160} value={v.name} disabled={disabled} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <label htmlFor="qe-note">Subtítulo</label>
      <input id="qe-note" type="text" maxLength={100} value={v.note} disabled={disabled} placeholder="opcional" onChange={(e) => setV({ ...v, note: e.target.value })} />
      <label htmlFor="qe-price">Preço (R$)</label>
      <input id="qe-price" type="text" inputMode="decimal" value={v.price} disabled={disabled} onChange={(e) => setV({ ...v, price: e.target.value })} />
      <div className="canva-quick-actions">
        <button type="button" className="mini-btn primary" disabled={disabled} onClick={save}><Check size={12} /> Salvar</button>
        <button type="button" className="mini-btn" onClick={onClose}><X size={12} /> Cancelar</button>
      </div>
    </div>
  )
}
