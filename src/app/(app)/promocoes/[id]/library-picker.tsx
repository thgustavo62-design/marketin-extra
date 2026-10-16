'use client'

// Aba "Biblioteca" do editor: as imagens guardadas em Promoções → Biblioteca de imagens, prontas para usar na peça.
import { useState } from 'react'
import Link from 'next/link'
import { LIBRARY_CATEGORIES, type LibraryCategory } from '@/lib/domain/promo-library'
import type { LibraryItem } from '@/lib/promo/library'

export function LibraryPicker({ items, canEdit, busy, onAdd, onBackground }: { items: LibraryItem[]; canEdit: boolean; busy: boolean; onAdd: (i: LibraryItem) => void; onBackground: (i: LibraryItem) => void }) {
  const [filter, setFilter] = useState<LibraryCategory | 'todas'>('todas')
  const shown = filter === 'todas' ? items : items.filter((i) => i.category === filter)
  return (
    <section aria-label="Biblioteca de imagens">
      <p className="muted">Ícones, logos, selos e fotos guardados para as criações. Clique na imagem para colocá-la na peça; &quot;Fundo&quot; usa como fundo da promoção.</p>
      <div className="canva-chips" role="group" aria-label="Categoria">
        <button type="button" className={filter === 'todas' ? 'on' : ''} onClick={() => setFilter('todas')}>Todas</button>
        {LIBRARY_CATEGORIES.map((c) => <button key={c.id} type="button" className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.label}</button>)}
      </div>
      {shown.length === 0 ? <p className="empty">{items.length === 0 ? 'A biblioteca está vazia.' : 'Nenhuma imagem nesta categoria.'}</p> : (
        <div className="bg-grid lib-picker" role="group" aria-label="Imagens da biblioteca">
          {shown.map((i) => (
            <div key={i.id} className="lib-pick" data-id={i.id}>
              <button type="button" className="bg-option" disabled={!canEdit || busy} title={`Colocar "${i.name}" na peça`} aria-label={`Colocar ${i.name} na peça`} onClick={() => onAdd(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/promocoes/biblioteca/${i.id}?mini=1`} alt="" loading="lazy" />
                <small>{i.name}</small>
              </button>
              {canEdit && <button type="button" className="mini-btn lib-bg" disabled={busy} aria-label={`Usar ${i.name} como fundo`} onClick={() => onBackground(i)}>Fundo</button>}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: 10 }}><Link href="/promocoes/biblioteca">Gerenciar a biblioteca</Link></p>
    </section>
  )
}
