'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { ProductCard } from '@/lib/catalog/store'
import { searchProductsAction } from './actions'

export function Thumb({ id, size = 36 }: { id: string | null; size?: number }) {
  return id
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={`/api/produtos/imagem/${id}?mini=1`} alt="" width={size} height={size} loading="lazy" style={{ objectFit: 'contain', background: '#fff', borderRadius: 6, flex: 'none' }} />
    : <span style={{ width: size, height: size, display: 'grid', placeItems: 'center', background: '#eef2f6', borderRadius: 6, color: '#8a98a8', flex: 'none' }}><ImageOff size={Math.round(size / 2)} /></span>
}

// Busca de produto pelo nome, código de barras, laboratório ou princípio ativo.
export function ProductPicker({ onPick, placeholder = 'Buscar produto por nome ou código de barras', label = 'Buscar produto' }: { onPick: (p: ProductCard) => void; placeholder?: string; label?: string }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ProductCard[]>([])
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return }
    const mine = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      const r = await searchProductsAction(q).catch(() => [])
      if (mine === seq.current) { setRows(r); setBusy(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} />
      {q.trim().length >= 2 && (
        <ul>
          {rows.map((p) => (
            <li key={p.id}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Thumb id={p.thumb_id} />
                <span style={{ overflowWrap: 'anywhere' }}>{p.description}<small className="muted" style={{ display: 'block' }}>{p.ean ?? 'sem código de barras'}</small></span>
              </span>
              <button type="button" className="mini-btn" onClick={() => { onPick(p); setQ(''); setRows([]) }}>Escolher</button>
            </li>
          ))}
          {!busy && rows.length === 0 && <li className="muted">Nenhum produto encontrado.</li>}
        </ul>
      )}
    </div>
  )
}
