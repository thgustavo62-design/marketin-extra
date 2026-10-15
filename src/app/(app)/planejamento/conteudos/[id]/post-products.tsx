'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Download, X } from 'lucide-react'
import type { ProductCard } from '@/lib/catalog/store'
import { setPostProductsAction } from '../../../produtos/actions'
import { ProductPicker, Thumb } from '../../../produtos/product-picker'

// Produtos que aparecem neste conteúdo: dá acesso rápido à imagem certa na hora de produzir a arte.
export function PostProducts({ postId, initial, canEdit }: { postId: string; initial: ProductCard[]; canEdit: boolean }) {
  const [items, setItems] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const save = (next: ProductCard[]) => {
    const prev = items
    setItems(next); setMsg(null)
    start(async () => {
      const r = await setPostProductsAction(postId, next.map((p) => p.id))
      if (!r.ok) { setItems(prev); setMsg(r.message ?? 'Não foi possível salvar.') }
    })
  }

  return (
    <section className="card" style={{ marginTop: 14 }} aria-label="Produtos do conteúdo">
      <h3>Produtos neste conteúdo</h3>
      {items.length === 0 && <p className="muted">Nenhum produto vinculado. Vincule para achar a imagem de cada um com um clique.</p>}
      {items.length > 0 && (
        <ul className="files">
          {items.map((p) => (
            <li key={p.id}>
              <Thumb id={p.thumb_id} size={44} />
              <Link href={`/produtos/${p.id}`}>{p.description}</Link>
              <span className="muted">{p.image_count === 0 ? 'sem imagem' : `${p.image_count} imagem(ns)`}</span>
              {p.thumb_id && <a className="mini-btn" href={`/api/produtos/imagem/${p.thumb_id}?baixar=1`}><Download size={12} /> Baixar</a>}
              {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => save(items.filter((x) => x.id !== p.id))} aria-label={`Remover ${p.description}`}><X size={12} /></button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <ProductPicker label="Adicionar produto ao conteúdo" onPick={(p) => { if (!items.some((x) => x.id === p.id)) save([...items, p]) }} />}
      {msg && <p className="form-error" role="alert">{msg}</p>}
    </section>
  )
}
