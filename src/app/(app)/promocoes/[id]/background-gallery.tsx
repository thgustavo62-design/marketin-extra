'use client'

// Galeria "Imagem de Fundo": o fundo da promoção pode ser o do tema, um fundo pronto, duas cores, uma imagem enviada ou o fundo de outro tema.
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { BACKGROUND_PRESETS, PROMO_FORMATS, type BackgroundChoice, type PromoFormat } from '@/lib/domain/promo'
import type { Campaign } from '@/lib/promo/store'
import { drawBackgroundChoice } from '@/lib/promo/render'

/** Miniatura de um fundo pronto, desenhada com o mesmo código da peça. */
function PresetThumb({ id, W, H }: { id: string; W: number; H: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = 120; c.height = Math.round((120 * H) / W)
    const ctx = c.getContext('2d')!
    ctx.scale(120 / W, 120 / W)
    drawBackgroundChoice(ctx, { kind: 'preset', id }, W, H)
  }, [id, W, H])
  return <canvas ref={ref} aria-hidden="true" />
}

const same = (a: BackgroundChoice | undefined, b: BackgroundChoice): boolean => !!a && JSON.stringify(a) === JSON.stringify(b)

export function BackgroundGallery({ campaign, format, canEdit, busy, onChoose, onUpload, onDeleteAsset, uploading }: {
  campaign: Campaign; format: PromoFormat; canEdit: boolean; busy: boolean
  onChoose: (bg: BackgroundChoice | null) => void; onUpload: (file: File) => void; onDeleteAsset: (id: string) => void; uploading: boolean
}) {
  const cur = campaign.overrides.background
  const { w: W, h: H } = PROMO_FORMATS[format]
  const fileRef = useRef<HTMLInputElement>(null)
  const [c1, setC1] = useState(cur?.kind === 'color' ? cur.color : '#1d5fe0')
  const [c2, setC2] = useState(cur?.kind === 'color' ? (cur.color2 ?? cur.color) : '#0b2f87')
  const dis = !canEdit || busy
  return (
    <section aria-label="Imagem de fundo" className="bg-gallery">
      <p className="muted">Escolha o fundo desta promoção. Vale para todas as peças e formatos; produtos, nomes e preços continuam por cima.</p>
      <button type="button" className={`bg-option wide${!cur ? ' on' : ''}`} disabled={dis} onClick={() => onChoose(null)}>Fundo do tema{!cur ? ' ✓' : ''}</button>

      <h4>Fundos prontos</h4>
      <div className="bg-grid" role="group" aria-label="Fundos prontos">
        {BACKGROUND_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`bg-option${same(cur, { kind: 'preset', id: p.id }) ? ' on' : ''}`} disabled={dis} title={p.label} aria-label={`Fundo ${p.label}`} onClick={() => onChoose({ kind: 'preset', id: p.id })}>
            <PresetThumb id={p.id} W={W} H={H} />
            <small>{p.label}</small>
          </button>
        ))}
      </div>

      <h4>Duas cores</h4>
      <div className="bg-colors">
        <label className="color-item"><input type="color" aria-label="Cor de cima do fundo" value={c1} disabled={dis} onChange={(e) => setC1(e.target.value)} /> Topo</label>
        <label className="color-item"><input type="color" aria-label="Cor de baixo do fundo" value={c2} disabled={dis} onChange={(e) => setC2(e.target.value)} /> Base</label>
        <button type="button" className="mini-btn" disabled={dis} onClick={() => onChoose({ kind: 'color', color: c1, color2: c2 })}>Aplicar</button>
      </div>

      <h4>Minhas imagens</h4>
      {canEdit && (
        <>
          <button type="button" className="secondary" disabled={uploading || busy} onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> {uploading ? 'Enviando…' : 'Enviar imagem de fundo'}</button>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Enviar imagem de fundo" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
        </>
      )}
      {campaign.assets.length === 0 ? <p className="muted">Nenhuma imagem enviada ainda. As imagens enviadas como elemento também aparecem aqui.</p> : (
        <div className="bg-grid" role="group" aria-label="Minhas imagens">
          {campaign.assets.map((a) => (
            <div key={a.id} className="bg-asset">
              <button type="button" className={`bg-option${same(cur, { kind: 'asset', asset: a.id }) ? ' on' : ''}`} disabled={dis} aria-label="Usar esta imagem como fundo" onClick={() => onChoose({ kind: 'asset', asset: a.id })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/promocoes/asset/${a.id}?mini=1`} alt="" />
                <small>{a.width}×{a.height}</small>
              </button>
              {canEdit && !a.used && <button type="button" className="bg-del" disabled={busy} aria-label="Excluir esta imagem" title="Excluir" onClick={() => onDeleteAsset(a.id)}><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}

      {campaign.themeBackgrounds.length > 0 && (
        <>
          <h4>Fundos de outros temas</h4>
          <div className="bg-grid" role="group" aria-label="Fundos de outros temas">
            {campaign.themeBackgrounds.map((t) => {
              const f = t.formats.includes(format) ? format : t.formats[0]
              return (
                <button key={t.id} type="button" className={`bg-option${same(cur, { kind: 'theme', themeId: t.id }) ? ' on' : ''}`} disabled={dis} aria-label={`Fundo do tema ${t.name}`} onClick={() => onChoose({ kind: 'theme', themeId: t.id })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/promocoes/tema/${t.id}/background/${f}`} alt="" />
                  <small>{t.name}</small>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
