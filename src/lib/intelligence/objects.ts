// Ontologia do sistema: cada objeto (campanha, conteúdo, publicação) com os objetos ligados a ele e a linha do tempo do que aconteceu.
// Só leitura. O chamador confere o acesso à filial (rowAllowed) antes de chamar.
import { pool } from '../db'
import {
  FORMATS, PILLARS, STAGES, engagementRate, fmtNum, fmtPct, formatBR, interactions, isMature, median, mediaFormat, todayISO, type Format, type Pillar, type Stage,
} from '../domain'

export type ObjKind = 'campanha' | 'conteudo' | 'publicacao'
export const isObjKind = (v: unknown): v is ObjKind => v === 'campanha' || v === 'conteudo' || v === 'publicacao'
export const OBJ_LABEL: Record<ObjKind, string> = { campanha: 'Campanha', conteudo: 'Conteúdo', publicacao: 'Publicação' }

export type RelItem = { title: string; meta: string; href: string }
export type Relation = { label: string; total: number; items: RelItem[] }
export type TimelineItem = { at: string; text: string; href?: string }
export type ObjectView = {
  kind: ObjKind; id: string; brandId: string; brandName: string; title: string; subtitle: string; badges: string[]
  stats: { label: string; value: string }[]; relations: Relation[]; timeline: TimelineItem[]
}

const explore = (kind: ObjKind, id: string) => `/inteligencia/explorar/${kind}/${id}`
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const rel = (label: string, rows: RelItem[], total = rows.length): Relation => ({ label, total, items: rows.slice(0, 25) })
const FMT = (f: string) => FORMATS[f as Format] ?? f

type PubRow = {
  id: string; permalink: string | null; media_type: string | null; media_product_type: string | null; published_on: string | null
  reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; collected_on: string | null; content_id: string | null
}
const PUB_SQL = `
  select e.id, e.permalink, e.media_type, e.media_product_type, e.content_id, (e.published_at at time zone 'America/Sao_Paulo')::date::text as published_on,
         s.reach, s.views, s.likes, s.comments, s.saves, s.shares, s.collected_on::text as collected_on
    from external_publications e left join lateral (select * from publication_metric_snapshots x where x.publication_id = e.id order by x.collected_on desc limit 1) s on true`
const pubMetrics = (p: PubRow) => ({ reach: p.reach, views: p.views, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares, reel_interactions: null })
const pubItem = (p: PubRow): RelItem => {
  const m = pubMetrics(p)
  return { title: `${FMT(mediaFormat(p.media_product_type, p.media_type))} de ${p.published_on ? formatBR(p.published_on) : 'data N/D'}`, meta: `alcance ${fmtNum(p.reach)} · engajamento ${p.collected_on ? fmtPct(engagementRate(m)) : 'N/D'}`, href: explore('publicacao', p.id) }
}

export async function getObjectView(kind: ObjKind, id: string): Promise<ObjectView | null> {
  if (kind === 'campanha') return campaignView(id)
  if (kind === 'conteudo') return postView(id)
  return publicationView(id)
}

async function campaignView(id: string): Promise<ObjectView | null> {
  const c = (await pool.query(`select c.id, c.brand_id, b.name as brand_name, c.name, c.starts_on::text as s, c.ends_on::text as e, c.objective from campaigns c join brands b on b.id = c.brand_id where c.id = $1`, [id])).rows[0]
  if (!c) return null
  const today = todayISO()
  const posts = (await pool.query(`select id, title, stage, format, post_date::text as d from posts where campaign_id = $1 order by post_date, title`, [id])).rows as { id: string; title: string; stage: Stage; format: string; d: string }[]
  const postIds = posts.map((p) => p.id)
  const q = (sql: string, a: unknown[]) => pool.query(sql, a).then((r) => r.rows)
  const [pubs, links, insp, inst, reqs, alerts, ev, apr] = await Promise.all([
    postIds.length ? q(`${PUB_SQL} where e.content_id = any($1)`, [postIds]) as Promise<PubRow[]> : Promise.resolve([] as PubRow[]),
    q(`select id, label, status, final_url from campaign_links where campaign_id = $1 order by created_at desc`, [id]),
    q(`select id, title, kind from inspirations where campaign_id = $1 order by created_at desc`, [id]),
    q(`select i.id, i.template_id, t.name, i.occurrence_start::text as s, i.status from campaign_instances i join campaign_templates t on t.id = i.template_id where i.campaign_id = $1`, [id]),
    postIds.length ? q(`select id, title, status from content_requests where linked_post_id = any($1)`, [postIds]) : Promise.resolve([]),
    postIds.length ? q(`select title, severity, href from notification_events where object_type = 'post' and object_id = any($1) and resolved_at is null`, [postIds]) : Promise.resolve([]),
    postIds.length ? q(`select e.created_at::text as at, e.to_stage, e.from_stage, p.title, p.id from post_status_events e join posts p on p.id = e.post_id where e.post_id = any($1) order by e.created_at desc limit 40`, [postIds]) : Promise.resolve([]),
    postIds.length ? q(`select a.decided_at::text as at, a.status, p.title, p.id from approvals a join posts p on p.id = a.post_id where a.post_id = any($1) and a.decided_at is not null order by a.decided_at desc limit 20`, [postIds]) : Promise.resolve([]),
  ])
  const matureEng = pubs.filter((p) => p.collected_on && p.published_on && isMature(p.published_on, today)).map((p) => engagementRate(pubMetrics(p))).filter((x): x is number => x !== null)
  const timeline: TimelineItem[] = [
    ...ev.map((e: { at: string; to_stage: Stage; from_stage: Stage | null; title: string; id: string }) => ({ at: e.at, text: `${e.title}: ${e.from_stage ? STAGES[e.from_stage] + ' → ' : ''}${STAGES[e.to_stage]}`, href: explore('conteudo', e.id) })),
    ...apr.map((a: { at: string; status: string; title: string; id: string }) => ({ at: a.at, text: `Aprovação de "${a.title}": ${({ approved: 'aprovado', rejected: 'reprovado', changes_requested: 'ajustes solicitados' } as Record<string, string>)[a.status] ?? a.status}`, href: explore('conteudo', a.id) })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50).map((t) => ({ ...t, at: when(t.at) }))
  return {
    kind: 'campanha', id, brandId: c.brand_id, brandName: c.brand_name, title: c.name, subtitle: `${formatBR(c.s)} a ${formatBR(c.e)}${c.objective ? ' · ' + c.objective : ''}`,
    badges: [c.s > today ? 'Futura' : c.e < today ? 'Encerrada' : 'Vigente'],
    stats: [
      { label: 'Conteúdos', value: fmtNum(posts.length) }, { label: 'Publicados', value: fmtNum(posts.filter((p) => p.stage === 'publicado').length) },
      { label: 'Publicações reais ligadas', value: fmtNum(pubs.length) },
      { label: 'Engajamento (mediana, 7+ dias)', value: matureEng.length >= 3 ? `${fmtPct(median(matureEng))} (n=${matureEng.length})` : `amostra pequena (n=${matureEng.length})` },
      { label: 'Links UTM', value: fmtNum(links.length) },
    ],
    relations: [
      rel('Conteúdos', posts.map((p) => ({ title: p.title, meta: `${STAGES[p.stage]} · ${FMT(p.format)} · ${formatBR(p.d)}`, href: explore('conteudo', p.id) }))),
      rel('Publicações reais', pubs.map(pubItem)),
      rel('Modelo recorrente de origem', inst.map((i: { template_id: string; name: string; s: string; status: string }) => ({ title: i.name, meta: `ocorrência de ${formatBR(i.s)} (${i.status === 'generated' ? 'gerada' : 'cancelada'})`, href: `/campanhas/modelos/${i.template_id}` }))),
      rel('Links e QR', links.map((l: { label: string; status: string; final_url: string }) => ({ title: l.label, meta: `${l.status} · ${l.final_url}`, href: '/gestao/links' }))),
      rel('Solicitações que originaram conteúdo', reqs.map((r: { title: string; status: string }) => ({ title: r.title, meta: r.status, href: '/producao/solicitacoes' }))),
      rel('Inspirações', insp.map((i: { id: string; title: string; kind: string }) => ({ title: i.title, meta: i.kind, href: `/gestao/referencias?insp=${i.id}` }))),
      rel('Alertas ativos', alerts.map((a: { title: string; severity: string; href: string }) => ({ title: a.title, meta: a.severity, href: a.href }))),
    ],
    timeline,
  }
}

async function postView(id: string): Promise<ObjectView | null> {
  const p = (await pool.query(
    `select p.id, p.brand_id, b.name as brand_name, p.title, p.stage, p.format, p.pillar, p.post_date::text as d, p.campaign_id, coalesce(c.name, p.campaign_name) as campaign, p.publication_method, p.published_url,
            p.campaign_instance_id, u.display_name as owner
       from posts p join brands b on b.id = p.brand_id left join campaigns c on c.id = p.campaign_id left join users u on u.id = p.assigned_to where p.id = $1`, [id])).rows[0]
  if (!p) return null
  const q = (sql: string) => pool.query(sql, [id]).then((r) => r.rows)
  const [pubs, assets, approvals, req, insp, alerts, ev, inst] = await Promise.all([
    q(`${PUB_SQL} where e.content_id = $1`) as Promise<PubRow[]>,
    q(`select a.id, a.title, k.role, a.kind from content_asset_links k join media_assets a on a.id = k.asset_id where k.post_id = $1 order by k.sort_order`),
    q(`select a.status, a.created_at::text as at, a.decided_at::text as dat from approvals a where a.post_id = $1 order by a.created_at desc`),
    q(`select id, title, status from content_requests where linked_post_id = $1`),
    q(`select id, title, kind from inspirations where post_id = $1`),
    q(`select title, severity, href from notification_events where object_type = 'post' and object_id = $1 and resolved_at is null`),
    q(`select e.created_at::text as at, e.to_stage, e.from_stage, e.note, u.display_name as who from post_status_events e left join users u on u.id = e.actor_id where e.post_id = $1 order by e.created_at desc limit 40`),
    p.campaign_instance_id ? pool.query(`select i.template_id, t.name, i.occurrence_start::text as s from campaign_instances i join campaign_templates t on t.id = i.template_id where i.id = $1`, [p.campaign_instance_id]).then((r) => r.rows) : Promise.resolve([]),
  ])
  const timeline: TimelineItem[] = ev.map((e: { at: string; to_stage: Stage; from_stage: Stage | null; note: string | null; who: string | null }) => ({
    at: e.at, text: `${e.from_stage ? STAGES[e.from_stage] + ' → ' : 'Criado em '}${STAGES[e.to_stage]}${e.who ? ` (${e.who})` : ''}${e.note ? ` — ${e.note}` : ''}`,
  })).map((t: TimelineItem) => ({ ...t, at: when(t.at) }))
  const stLabel = (s: string) => ({ pending: 'aguardando decisão', approved: 'aprovado', rejected: 'reprovado', changes_requested: 'ajustes solicitados', invalidated: 'invalidado' } as Record<string, string>)[s] ?? s
  return {
    kind: 'conteudo', id, brandId: p.brand_id, brandName: p.brand_name, title: p.title, subtitle: `${FMT(p.format)} · ${PILLARS[p.pillar as Pillar]} · publicação prevista ${formatBR(p.d)}${p.owner ? ' · responsável ' + p.owner : ''}`,
    badges: [STAGES[p.stage as Stage], `publicação ${p.publication_method === 'assistido' ? 'assistida' : p.publication_method === 'api' ? 'por API' : 'manual'}`],
    stats: [
      { label: 'Publicações reais ligadas', value: fmtNum(pubs.length) }, { label: 'Anexos', value: fmtNum(assets.length) }, { label: 'Aprovações', value: fmtNum(approvals.length) },
      { label: 'Endereço da publicação', value: p.published_url ?? 'não confirmado' },
    ],
    relations: [
      rel('Campanha', p.campaign_id ? [{ title: p.campaign ?? 'Campanha', meta: 'campanha deste conteúdo', href: explore('campanha', p.campaign_id) }] : []),
      rel('Modelo recorrente de origem', inst.map((i: { template_id: string; name: string; s: string }) => ({ title: i.name, meta: `ocorrência de ${formatBR(i.s)}`, href: `/campanhas/modelos/${i.template_id}` }))),
      rel('Solicitação de origem', req.map((r: { title: string; status: string }) => ({ title: r.title, meta: r.status, href: '/producao/solicitacoes' }))),
      rel('Publicações reais', pubs.map(pubItem)),
      rel('Arquivos', assets.map((a: { id: string; title: string; role: string; kind: string }) => ({ title: a.title, meta: `${a.role} · ${a.kind === 'link' ? 'link' : 'arquivo'}`, href: a.kind === 'link' ? '/producao/biblioteca' : `/api/media/${a.id}` }))),
      rel('Aprovações', approvals.map((a: { status: string; at: string; dat: string | null }) => ({ title: stLabel(a.status), meta: `enviado em ${when(a.at)}${a.dat ? ` · decidido em ${when(a.dat)}` : ''}`, href: `/producao?abrir=${id}` }))),
      rel('Inspirações', insp.map((i: { id: string; title: string; kind: string }) => ({ title: i.title, meta: i.kind, href: `/gestao/referencias?insp=${i.id}` }))),
      rel('Alertas ativos', alerts.map((a: { title: string; severity: string; href: string }) => ({ title: a.title, meta: a.severity, href: a.href }))),
    ],
    timeline,
  }
}

async function publicationView(id: string): Promise<ObjectView | null> {
  const e = (await pool.query(
    `select e.id, e.brand_id, b.name as brand_name, e.account_name, e.permalink, e.media_type, e.media_product_type, e.caption_excerpt, e.content_id, e.link_method, e.first_seen_at::text as first_seen,
            e.linked_at::text as linked_at, (e.published_at at time zone 'America/Sao_Paulo')::date::text as published_on, u.display_name as linked_by
       from external_publications e join brands b on b.id = e.brand_id left join users u on u.id = e.linked_by where e.id = $1`, [id])).rows[0]
  if (!e) return null
  const snaps = (await pool.query(`select collected_on::text as d, collected_at::text as at, reach, views, likes, comments, saves, shares, data_quality from publication_metric_snapshots where publication_id = $1 order by collected_on desc`, [id])).rows
  const post = e.content_id ? (await pool.query(`select p.id, p.title, p.stage, p.campaign_id, coalesce(c.name, p.campaign_name) as campaign from posts p left join campaigns c on c.id = p.campaign_id where p.id = $1`, [e.content_id])).rows[0] : null
  const last = snaps[0] ?? null
  const m = last ? { reach: last.reach, views: last.views, likes: last.likes, comments: last.comments, saves: last.saves, shares: last.shares, reel_interactions: null } : null
  const today = todayISO()
  const timeline: TimelineItem[] = [
    ...snaps.map((s: { at: string; d: string; reach: number | null }) => ({ at: s.at, text: `Coleta de métricas (alcance ${fmtNum(s.reach)})` })),
    ...(e.linked_at ? [{ at: e.linked_at, text: `Vinculada ao conteúdo${e.linked_by ? ' por ' + e.linked_by : ''} (${e.link_method === 'verified_match' ? 'sugestão confirmada' : e.link_method})` }] : []),
    { at: e.first_seen, text: 'Primeira vez vista pela coleta' },
  ].sort((a, b) => b.at.localeCompare(a.at)).map((t) => ({ ...t, at: when(t.at) }))
  const age = e.published_on ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(e.published_on + 'T00:00:00Z')) / 864e5) : null
  return {
    kind: 'publicacao', id, brandId: e.brand_id, brandName: e.brand_name, title: e.caption_excerpt ?? 'Publicação do Instagram', subtitle: `${FMT(mediaFormat(e.media_product_type, e.media_type))} · ${e.account_name} · ${e.published_on ? formatBR(e.published_on) : 'data N/D'}`,
    badges: [age === null ? 'sem data' : age >= 7 ? `${age} dias (madura)` : `${age} dias (recente)`, e.content_id ? 'vinculada' : 'sem vínculo'],
    stats: m ? [
      { label: 'Alcance', value: fmtNum(m.reach) }, { label: 'Visualizações', value: fmtNum(m.views) }, { label: 'Interações', value: fmtNum(interactions(m)) },
      { label: 'Engajamento (interações ÷ alcance)', value: fmtPct(engagementRate(m)) }, { label: 'Última coleta', value: formatBR(last.d) },
    ] : [{ label: 'Métricas', value: 'nunca coletadas' }],
    relations: [
      rel('Conteúdo planejado', post ? [{ title: post.title, meta: `${STAGES[post.stage as Stage]}`, href: explore('conteudo', post.id) }] : []),
      rel('Campanha', post?.campaign_id ? [{ title: post.campaign ?? 'Campanha', meta: 'via conteúdo vinculado', href: explore('campanha', post.campaign_id) }] : []),
      rel('Histórico de coletas', snaps.map((s: { d: string; reach: number | null; saves: number | null; data_quality: string }) => ({ title: formatBR(s.d), meta: `alcance ${fmtNum(s.reach)} · salvamentos ${fmtNum(s.saves)} · ${s.data_quality === 'partial' ? 'parcial' : 'completo'}`, href: explore('publicacao', id) }))),
      rel('Abrir na rede', e.permalink ? [{ title: 'Ver no Instagram', meta: e.permalink, href: e.permalink }] : []),
    ],
    timeline,
  }
}

// Busca para a tela "Explorar": o que existe no recorte para começar a navegar.
export async function browseObjects(f: { brandIds: string[]; q?: string }): Promise<{ kind: ObjKind; id: string; title: string; meta: string }[]> {
  if (f.brandIds.length === 0) return []
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, '\\$&')}%` : null
  const [c, p, e] = await Promise.all([
    pool.query(`select c.id, c.name, b.name as brand, c.starts_on::text as s from campaigns c join brands b on b.id = c.brand_id where c.brand_id = any($1) and ($2::text is null or c.name ilike $2) order by c.starts_on desc limit 12`, [f.brandIds, like]),
    pool.query(`select p.id, p.title, b.name as brand, p.post_date::text as d, p.stage from posts p join brands b on b.id = p.brand_id where p.brand_id = any($1) and ($2::text is null or p.title ilike $2) order by p.post_date desc limit 12`, [f.brandIds, like]),
    pool.query(`select e.id, e.caption_excerpt, b.name as brand, (e.published_at at time zone 'America/Sao_Paulo')::date::text as d from external_publications e join brands b on b.id = e.brand_id where e.brand_id = any($1) and ($2::text is null or e.caption_excerpt ilike $2) order by e.published_at desc nulls last limit 12`, [f.brandIds, like]),
  ])
  return [
    ...c.rows.map((r) => ({ kind: 'campanha' as const, id: r.id, title: r.name, meta: `${r.brand} · desde ${formatBR(r.s)}` })),
    ...p.rows.map((r) => ({ kind: 'conteudo' as const, id: r.id, title: r.title, meta: `${r.brand} · ${formatBR(r.d)} · ${STAGES[r.stage as Stage]}` })),
    ...e.rows.map((r) => ({ kind: 'publicacao' as const, id: r.id, title: r.caption_excerpt ?? 'Publicação do Instagram', meta: `${r.brand} · ${r.d ? formatBR(r.d) : 'sem data'}` })),
  ]
}

