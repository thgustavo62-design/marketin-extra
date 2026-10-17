'use client'

// Aba "Marca" do editor: logos, cores, fontes e textos oficiais da filial escolhida, com um clique para usar na peça.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FONT_CATEGORY_LABEL, PROMO_FONTS, fontStack } from '@/lib/domain/promo-fonts'
import type { KitColor, KitText } from '@/lib/domain/promo-brand'
import { loadFonts, loadPromoFonts } from '@/lib/promo/render'
import { getKitAction } from '../../criacao/marcas/actions'

type Kit = { colors: KitColor[]; fonts: string[]; texts: KitText[]; logos: { id: string; name: string; width: number; height: number }[] }
const KEY = 'promo_brand_kit'

export function BrandPanel({ brands, canEdit, busy, hasSelection, onLogo, onColor, onBgColor, onFont, onText }: {
  brands: { id: string; name: string }[]; canEdit: boolean; busy: boolean; hasSelection: boolean
  onLogo: (l: { id: string; name: string }) => void; onColor: (hex: string) => void; onBgColor: (hex: string) => void; onFont: (id: string) => void; onText: (t: string) => void
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const [kit, setKit] = useState<Kit | null>(null)
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v && brands.some((b) => b.id === v)) setBrandId(v) } catch { /* sem storage */ } }, [brands])
  useEffect(() => {
    if (!brandId) return
    let off = false
    setKit(null)
    void getKitAction(brandId).then((k) => { if (!off) setKit(k) })
    return () => { off = true }
  }, [brandId])
  useEffect(() => { if (kit?.fonts.length) void loadPromoFonts().then(() => loadFonts(kit.fonts)) }, [kit])
  if (brands.length === 0) return <section aria-label="Marca"><p className="empty">Você não tem acesso a nenhuma filial.</p></section>
  const dis = !canEdit || busy
  return (
    <section aria-label="Marca" className="brand-panel">
      <label htmlFor="bp-brand">Filial</label>
      <select id="bp-brand" value={brandId} onChange={(e) => { setBrandId(e.target.value); try { localStorage.setItem(KEY, e.target.value) } catch { /* ignora */ } }}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      {!kit ? <p className="muted">Carregando o kit…</p> : (
        <>
          <h4>Logos</h4>
          {kit.logos.length === 0 ? <p className="muted">Nenhum logo cadastrado para esta filial.</p> : (
            <div className="brand-logos">
              {kit.logos.map((l) => (
                <button key={l.id} type="button" className="bg-option" disabled={dis} aria-label={`Colocar o logo ${l.name} na peça`} title={l.name} onClick={() => onLogo(l)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/promocoes/biblioteca/${l.id}?mini=1`} alt="" style={{ objectFit: 'contain', background: 'repeating-conic-gradient(#eef2f6 0% 25%, #fff 0% 50%) 50% / 12px 12px' }} />
                </button>
              ))}
            </div>
          )}
          <h4>Cores {hasSelection ? '(clique para aplicar ao elemento selecionado)' : '(selecione um texto ou forma para aplicar)'}</h4>
          {kit.colors.length === 0 ? <p className="muted">Nenhuma cor cadastrada.</p> : (
            <div className="swatches">
              {kit.colors.map((c) => (
                <span key={c.hex} style={{ display: 'inline-grid', gap: 2, justifyItems: 'center' }}>
                  <button type="button" className="swatch" style={{ background: c.hex }} disabled={dis || !hasSelection} aria-label={`Aplicar a cor ${c.name}`} title={`${c.name} ${c.hex}`} onClick={() => onColor(c.hex)} />
                  {canEdit && <button type="button" className="link" style={{ fontSize: 10 }} aria-label={`Usar ${c.name} como fundo`} onClick={() => onBgColor(c.hex)}>fundo</button>}
                </span>
              ))}
            </div>
          )}
          <h4>Fontes aprovadas {hasSelection ? '(troca a fonte do texto selecionado)' : '(cria um texto novo)'}</h4>
          {kit.fonts.length === 0 ? <p className="muted">Nenhuma fonte aprovada.</p> : (
            <div className="brand-fonts">
              {kit.fonts.map((id) => { const d = PROMO_FONTS.find((f) => f.id === id); return d ? <button key={id} type="button" disabled={dis} style={{ fontFamily: fontStack(id) }} aria-label={`Usar a fonte ${d.label}`} onClick={() => onFont(id)}>{d.label} <small className="muted">{FONT_CATEGORY_LABEL[d.category]}</small></button> : null })}
            </div>
          )}
          <h4>Textos prontos</h4>
          {kit.texts.length === 0 ? <p className="muted">Nenhum texto cadastrado.</p> : (
            <div className="brand-texts">
              {kit.texts.map((t, i) => <button key={i} type="button" disabled={dis} aria-label={`Adicionar o texto ${t.label}`} title={t.text} onClick={() => onText(t.text)}><strong>{t.label}</strong><br /><small className="muted">{t.text.slice(0, 60)}</small></button>)}
            </div>
          )}
          <p className="muted" style={{ marginTop: 10 }}><Link href="/criacao/marcas">Gerenciar o kit de marca</Link></p>
        </>
      )}
    </section>
  )
}
