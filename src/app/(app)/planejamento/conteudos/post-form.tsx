'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { FORMATS, PILLARS, STAGES, REELS_TEMPLATE_TIMES, emptyReels, type Format, type Pillar, type Stage } from '@/lib/domain'
import type { Branch, Brand, Campaign, Post } from '@/lib/data'
import { savePostAction } from './actions'

export function PostForm({
  brands, branches, campaigns, post, defaults,
}: {
  brands: Brand[]
  branches: Branch[]
  campaigns: Campaign[]
  post?: Post
  defaults?: { brand_id?: string; branch_id?: string; post_date?: string }
}) {
  const [brandId, setBrandId] = useState(post?.brand_id ?? defaults?.brand_id ?? brands[0]?.id ?? '')
  const [format, setFormat] = useState<Format>(post?.format ?? 'feed')
  const [pillar, setPillar] = useState<Pillar>(post?.pillar ?? 'institucional')
  const reels = post?.reels ?? emptyReels()
  const scenes = reels.scenes.length >= REELS_TEMPLATE_TIMES.length ? reels.scenes : emptyReels().scenes
  const myBranches = branches.filter((b) => b.brand_id === brandId && (b.active || b.id === post?.branch_id))
  const myCampaigns = campaigns.filter((c) => c.brand_id === brandId)

  return (
    <ActionForm action={savePostAction} submit={post ? 'Salvar alterações' : 'Criar conteúdo'} className="stack-form wide">
      {post && <input type="hidden" name="id" value={post.id} />}
      {post && <input type="hidden" name="revision" value={post.revision} />}
      <input type="hidden" name="scene_count" value={scenes.length} />

      <label htmlFor="title">Título (nome interno da pauta)</label>
      <input id="title" name="title" type="text" defaultValue={post?.title} required />

      <div className="grid-2">
        <div>
          <label htmlFor="brand_id">Filial</label>
          <select id="brand_id" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="branch_id">Unidade</label>
          <select id="branch_id" name="branch_id" key={brandId} defaultValue={post?.branch_id ?? defaults?.branch_id ?? ''}>
            <option value="">Todas as unidades</option>
            {myBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-3">
        <div>
          <label htmlFor="post_date">Data</label>
          <input id="post_date" name="post_date" type="date" defaultValue={post?.post_date ?? defaults?.post_date} required />
        </div>
        <div>
          <label htmlFor="post_time">Horário (opcional)</label>
          <input id="post_time" name="post_time" type="time" defaultValue={post?.post_time ?? ''} />
        </div>
        <div>
          <label htmlFor="stage">Etapa</label>
          <select id="stage" name="stage" defaultValue={post?.stage ?? 'ideia'}>
            {(Object.keys(STAGES) as Stage[]).map((s) => <option key={s} value={s}>{STAGES[s]}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-3">
        <div>
          <label htmlFor="format">Formato</label>
          <select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {(Object.keys(FORMATS) as Format[]).map((f) => <option key={f} value={f}>{FORMATS[f]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pillar">Pilar</label>
          <select id="pillar" name="pillar" value={pillar} onChange={(e) => setPillar(e.target.value as Pillar)}>
            {(Object.keys(PILLARS) as Pillar[]).map((p) => <option key={p} value={p}>{PILLARS[p]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="campaign_id">Campanha</label>
          <select id="campaign_id" name="campaign_id" key={brandId} defaultValue={post?.campaign_id ?? ''}>
            <option value="">Nenhuma</option>
            {myCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <label htmlFor="origin">Origem (informação, campanha ou referência que fundamenta a pauta)</label>
      <input id="origin" name="origin" type="text" defaultValue={post?.origin} />

      <label htmlFor="caption">Legenda</label>
      <textarea id="caption" name="caption" rows={6} defaultValue={post?.caption} />

      <label htmlFor="script">Roteiro ou briefing de criação</label>
      <textarea id="script" name="script" rows={4} defaultValue={post?.script} />

      {format === 'reels' && (
        <fieldset className="reels-box">
          <legend>Roteiro do Reels</legend>
          <p className="muted">Duração de referência de produção, não regra de desempenho do Instagram.</p>
          <label htmlFor="reels_hook">Gancho</label>
          <input id="reels_hook" name="reels_hook" type="text" defaultValue={reels.hook} />
          {scenes.map((s, i) => (
            <div className="scene" key={i}>
              <input type="hidden" name={`scene_time_${i}`} value={s.time} />
              <strong>{s.time || `Cena ${i + 1}`}</strong>
              <label htmlFor={`scene_scene_${i}`}>Cena</label>
              <input id={`scene_scene_${i}`} name={`scene_scene_${i}`} type="text" defaultValue={s.scene} />
              <div className="grid-2">
                <div>
                  <label htmlFor={`scene_speech_${i}`}>Fala</label>
                  <input id={`scene_speech_${i}`} name={`scene_speech_${i}`} type="text" defaultValue={s.speech} />
                </div>
                <div>
                  <label htmlFor={`scene_onscreen_${i}`}>Texto na tela</label>
                  <input id={`scene_onscreen_${i}`} name={`scene_onscreen_${i}`} type="text" defaultValue={s.onscreen} />
                </div>
              </div>
            </div>
          ))}
          <label htmlFor="reels_cta">Chamada para ação</label>
          <input id="reels_cta" name="reels_cta" type="text" defaultValue={reels.cta} />
        </fieldset>
      )}

      <label className="check">
        <input type="checkbox" name="pharma_review" defaultChecked={post?.pharma_review} />
        Revisão farmacêutica concluída
        {pillar === 'medicamentos' && <small> — obrigatória para aprovar ou publicar</small>}
      </label>
    </ActionForm>
  )
}
