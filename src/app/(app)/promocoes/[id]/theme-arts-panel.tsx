'use client'

// Aba "Artes do tema" do editor: as artes fixas do tema (bonecos, logos, fundos) que entram nesta promoção, com liga/desliga por promoção.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PROMO_FORMATS, type PromoFormat } from '@/lib/domain/promo'
import { SHOW_LABEL, artKindLabel } from '@/lib/domain/promo-fixed'
import type { Layer } from '@/lib/domain/promo-layers'
import type { ThemeArt } from '@/lib/promo/store'

export function ThemeArtsPanel({ themeId, themeName, format, fixed, arts, hidden, canEdit, busy, onToggle }: {
  themeId: string | null; themeName: string | null; format: PromoFormat; fixed: Layer[]; arts: ThemeArt[]; hidden: string[]; canEdit: boolean; busy: boolean; onToggle: (id: string, show: boolean) => void
}) {
  // resposta imediata no clique (o servidor confirma em seguida)
  const [local, setLocal] = useState(hidden)
  const key = hidden.join(',')
  useEffect(() => setLocal(hidden), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!themeId) return <section aria-label="Artes do tema"><p className="empty">Escolha um tema na aba Tema para usar as artes fixas dele.</p></section>
  return (
    <section aria-label="Artes do tema" className="theme-arts-panel">
      <p className="muted">Artes fixas do tema <strong>{themeName}</strong> ({PROMO_FORMATS[format].label.split(' ')[0]}): entram sozinhas em toda promoção que usa o tema. Desligue as que não servem para esta promoção.</p>
      {fixed.length === 0 ? <p className="empty">Este tema ainda não tem artes fixas neste formato.</p> : (
        <ul className="theme-arts-list">
          {fixed.map((l) => {
            const a = arts.find((x) => x.id === l.asset)
            if (!a) return null
            const on = !local.includes(l.id)
            return (
              <li key={l.id} data-fixed={l.id} className={on ? '' : 'off'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/promocoes/tema-arte/${a.id}?mini=1`} alt="" />
                <span className="canva-name">{a.name}<small>{artKindLabel(a.kind)} · {SHOW_LABEL[l.show ?? 'all']}{l.under ? ' · por baixo' : ''}</small></span>
                <label className="color-item"><input type="checkbox" aria-label={`Usar ${a.name} nesta promoção`} checked={on} disabled={!canEdit || busy} onChange={(e) => { setLocal(e.target.checked ? local.filter((x) => x !== l.id) : [...local, l.id]); onToggle(l.id, e.target.checked) }} /> Usar</label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted" style={{ marginTop: 10 }}><Link href={`/promocoes/temas/${themeId}`}>Gerenciar as artes do tema</Link></p>
    </section>
  )
}
