// Motor de inteligência (servidor): lê o banco, aplica as regras puras de `domain/intelligence` e devolve achados, processo e qualidade dos dados.
// Só usa dados guardados (nada de Windsor ao vivo) e SEMPRE por filial.
import { lastCollection, listPublications } from '../data'
import { pool } from '../db'
import { marketFindings } from './market'
import {
  FORMATS, PILLARS, STAGES, addDays, bottleneck, compareGroups, coverage, daypartOf, daysBetween, engagementRate, fmtHours, fmtNum, fmtPct, freshnessScore, isMature, median,
  perThousandReach, qualityScore, sampleScore, sortFindings, summarizeDurations, weekdayName, MATURITY_DAYS,
  type DurationRow, type Finding, type GroupSample, type Pillar, type QualityItem, type QualityResult, type StageDuration,
} from '../domain'

export type BrandRef = { id: string; slug: string; name: string }
export type BrandAnalysis = {
  brand: BrandRef
  periodLabel: string
  generatedAt: string
  findings: Finding[]
  process: Finding[]
  stageDurations: StageDuration[]
  quality: QualityResult
  counts: { publications: number; matured: number; withMetrics: number; linked: number }
}

const WINDOW_DAYS = 180
const FORMAT_LABEL: Record<string, string> = { ...FORMATS, story: 'Story', outro: 'Outro' }
const pct1 = (n: number) => fmtPct(n)

const groupBy = <T,>(items: T[], key: (t: T) => string | null, value: (t: T) => number | null): GroupSample[] => {
  const m = new Map<string, number[]>()
  for (const it of items) {
    const k = key(it), v = value(it)
    if (k === null || v === null) continue
    m.set(k, [...(m.get(k) ?? []), v])
  }
  return [...m.entries()].map(([key, values]) => ({ key, values }))
}

export async function analyzeBrand(brand: BrandRef, branchId: string | null, today: string): Promise<BrandAnalysis> {
  const from = addDays(today, -(WINDOW_DAYS - 1))
  const periodLabel = `últimos ${WINDOW_DAYS} dias (até ${today.split('-').reverse().join('/')})`
  const pubs = await listPublications({ brand: brand.slug, branchId: branchId ?? undefined, from }, 500)
  const ids = pubs.map((p) => p.content_id).filter((x): x is string => Boolean(x))
  const content = new Map<string, { pillar: Pillar; campaign: string | null }>()
  if (ids.length) {
    for (const r of (await pool.query(`select p.id, p.pillar, coalesce(c.name, p.campaign_name) as campaign from posts p left join campaigns c on c.id = p.campaign_id where p.id = any($1)`, [ids])).rows) content.set(r.id, { pillar: r.pillar, campaign: r.campaign })
  }
  type P = (typeof pubs)[number]
  const withM = pubs.filter((p) => p.metrics && p.published_on)
  const mature = withM.filter((p) => isMature(p.published_on!, today))
  const eng = (p: P) => (p.metrics ? engagementRate(p.metrics) : null)
  const sav = (p: P) => (p.metrics ? perThousandReach(p.metrics.saves, p.metrics.reach) : null)
  const limitsBase = [`Só publicações com ${MATURITY_DAYS}+ dias e com alcance informado (peças recentes ainda acumulam resultado).`, 'Comparação descritiva: não prova causa (tema, horário, impulsionamento e público também influenciam).']
  const findings: Finding[] = []
  const add = (f: Finding | null) => { if (f) findings.push(f) }

  add(compareGroups({
    key: 'formato_engajamento', title: 'Formato que mais engaja', dimension: 'formato', metric: 'engajamento (interações ÷ alcance)', period: periodLabel, format: pct1, limits: limitsBase,
    groups: groupBy(mature, (p) => FORMAT_LABEL[p.format] ?? p.format, eng),
    actionFor: (best) => ({ label: `Planejar mais conteúdo em ${best} nas próximas semanas e acompanhar`, href: '/planejamento/gerar' }),
  }))
  add(compareGroups({
    key: 'formato_salvamentos', title: 'Formato que mais gera salvamentos', dimension: 'formato', metric: 'salvamentos por mil contas alcançadas', period: periodLabel, format: (n) => fmtNum(n, 1), limits: limitsBase,
    groups: groupBy(mature, (p) => FORMAT_LABEL[p.format] ?? p.format, sav),
    actionFor: (best) => ({ label: `Usar ${best} para conteúdo de consulta (dicas, listas, serviços)`, href: '/planejamento/gerar' }),
  }))
  add(compareGroups({
    key: 'dia_semana_engajamento', title: 'Melhor dia da semana', dimension: 'dia da semana', metric: 'engajamento', period: periodLabel, format: pct1, limits: [...limitsBase, 'Dia da semana em horário de Brasília.'],
    groups: groupBy(mature, (p) => (p.published_on ? weekdayName(p.published_on) : null), eng),
    actionFor: (best) => ({ label: `Reservar o melhor conteúdo para ${best} e testar por mais semanas`, href: '/planejamento/calendario' }),
  }))
  add(compareGroups({
    key: 'periodo_dia_engajamento', title: 'Melhor período do dia', dimension: 'período do dia', metric: 'engajamento', period: periodLabel, format: pct1, limits: [...limitsBase, 'Horário de Brasília.'],
    groups: groupBy(mature, (p) => (p.published_hour === null ? null : daypartOf(p.published_hour)), eng),
    actionFor: (best) => ({ label: `Testar publicar no período "${best}"`, href: '/planejamento/calendario' }),
  }))
  const linkedMature = mature.filter((p) => p.content_id && content.has(p.content_id))
  const pillarF = compareGroups({
    key: 'tema_engajamento', title: 'Tema (pilar) que mais engaja', dimension: 'tema (pilar de conteúdo)', metric: 'engajamento', period: periodLabel, format: pct1,
    limits: [...limitsBase, `Só entram publicações vinculadas a um conteúdo planejado: ${linkedMature.length} de ${mature.length}. As sem vínculo ficam de fora.`],
    groups: groupBy(linkedMature, (p) => PILLARS[content.get(p.content_id!)!.pillar], eng),
    actionFor: (best) => ({ label: `Reforçar o tema "${best}" no planejamento`, href: '/planejamento/gerar' }),
    collectHref: '/resultados/vinculos?ver=pendentes',
  })
  add(pillarF)
  const campGroups = groupBy(mature, (p) => (p.content_id && content.get(p.content_id)?.campaign) || 'Sem campanha', eng)
  if (campGroups.some((g) => g.key !== 'Sem campanha' && g.values.length >= 3)) {
    add(compareGroups({
      key: 'campanha_engajamento', title: 'Campanhas contra o dia a dia', dimension: 'campanha', metric: 'engajamento', period: periodLabel, format: pct1,
      limits: [...limitsBase, 'Publicações sem vínculo com conteúdo entram em "Sem campanha", o que pode misturar campanhas não vinculadas.'],
      groups: campGroups, actionFor: (best) => (best === 'Sem campanha' ? { label: 'Rever o formato das campanhas: o dia a dia está engajando mais', href: '/campanhas' } : { label: `Estudar o que a campanha "${best}" fez e repetir`, href: '/campanhas' }),
    }))
  }

  // ritmo de publicação (publicações reais por semana, últimas 8 semanas)
  const weeks = Array.from({ length: 8 }, (_, i) => ({ from: addDays(today, -(7 * (i + 1) - 1)), to: addDays(today, -7 * i), n: 0 })).reverse()
  for (const p of pubs) if (p.published_on) { const w = weeks.find((x) => p.published_on! >= x.from && p.published_on! <= x.to); if (w) w.n++ }
  const total8 = weeks.reduce((s, w) => s + w.n, 0)
  if (total8 >= 6) {
    const recent = weeks.slice(4).reduce((s, w) => s + w.n, 0) / 4, before = weeks.slice(0, 4).reduce((s, w) => s + w.n, 0) / 4
    const change = before > 0 ? ((recent - before) / before) * 100 : null
    findings.push({
      key: 'ritmo_publicacao', area: 'resultados', title: 'Ritmo de publicação', confidence: 'media', impact: change !== null && Math.abs(change) >= 30 ? 'medio' : 'baixo',
      statement: `Nas últimas 4 semanas foram ${fmtNum(recent, 1)} publicações por semana (as 4 anteriores: ${fmtNum(before, 1)})${change === null ? '.' : change <= -30 ? ` — queda de ${Math.abs(change).toFixed(0)}%.` : change >= 30 ? ` — alta de ${change.toFixed(0)}%.` : ' — ritmo estável.'}`,
      evidence: weeks.map((w) => `${w.from.split('-').reverse().slice(0, 2).join('/')} a ${w.to.split('-').reverse().slice(0, 2).join('/')}: ${w.n}`),
      action: change !== null && change <= -30 ? { label: 'Conferir se o calendário das próximas semanas está cheio', href: '/planejamento/calendario' } : null,
      method: 'Contagem de publicações reais coletadas por semana (segunda a domingo).', period: 'últimas 8 semanas', limits: ['Conta só publicações já coletadas do Windsor; coletas antigas ou atrasadas subestimam o ritmo.'],
    })
  }

  // casos fora da curva (descritivo)
  const ranked = mature.map((p) => ({ p, e: eng(p) })).filter((x): x is { p: P; e: number } => x.e !== null).sort((a, b) => b.e - a.e)
  if (ranked.length >= 8) {
    const line = (x: { p: P; e: number }) => `${x.p.published_on!.split('-').reverse().join('/')} · ${FORMAT_LABEL[x.p.format] ?? x.p.format} · ${pct1(x.e)}${x.p.content_title ? ` · ${x.p.content_title}` : ''}${x.p.permalink ? ` · ${x.p.permalink}` : ''}`
    findings.push({
      key: 'fora_da_curva', area: 'resultados', title: 'Publicações fora da curva', confidence: 'media', impact: 'baixo',
      statement: `As 3 melhores publicações tiveram engajamento de ${pct1(ranked[0].e)} a ${pct1(ranked[2].e)}; as 3 piores, de ${pct1(ranked[ranked.length - 1].e)} a ${pct1(ranked[ranked.length - 3].e)} (mediana geral: ${pct1(median(ranked.map((r) => r.e))!)}).`,
      evidence: ['Melhores:', ...ranked.slice(0, 3).map(line), 'Piores:', ...ranked.slice(-3).reverse().map(line)],
      action: { label: 'Abrir as publicações e comparar o que mudou (tema, arte, horário)', href: '/resultados/vinculos' }, method: 'Ranking por engajamento entre publicações com 7+ dias.', period: periodLabel,
      limits: ['São casos individuais: servem de pista, não de regra.'],
    })
  }

  // contexto externo (datas importantes e preços), cruzado com o que já está planejado
  findings.push(...(await marketFindings(brand, branchId, today)))

  // ---------- processo ----------
  const process: Finding[] = []
  const brandId = brand.id
  const branchFilter = branchId ? `and (p.branch_id = $2 or p.branch_id is null)` : ''
  const args = (extra: unknown[] = []) => (branchId ? [brandId, branchId, ...extra] : [brandId, ...extra])
  const durRows = (await pool.query(
    `select to_stage as stage, extract(epoch from (coalesce(nxt, now()) - at)) / 3600 as hours, (nxt is null) as ongoing
       from (select e.post_id, e.to_stage, e.created_at as at, lead(e.created_at) over (partition by e.post_id order by e.created_at, e.id) as nxt
               from post_status_events e join posts p on p.id = e.post_id
              where p.brand_id = $1 ${branchFilter} and e.created_at > now() - interval '120 days') x
      where to_stage in ('briefing', 'producao', 'revisao', 'aprovacao', 'aprovado', 'agendado')`, args())).rows as { stage: string; hours: number; ongoing: boolean }[]
  const stageDurations = summarizeDurations(durRows.map((r): DurationRow => ({ stage: r.stage, hours: Number(r.hours), ongoing: r.ongoing })))
  const bn = bottleneck(stageDurations, (s) => STAGES[s as keyof typeof STAGES] ?? s)
  if (bn) process.push({ key: 'gargalo_etapa', area: 'processo', title: 'Onde o conteúdo mais espera', ...bn.finding, method: 'Tempo entre entrar numa etapa e sair dela (eventos do quadro); só passagens concluídas.', period: 'últimos 120 dias', limits: ['Etapas como "Aprovado" e "Agendado" podem esperar de propósito (data de publicação futura).'] })

  const ap = (await pool.query(
    `select extract(epoch from (a.decided_at - a.created_at)) / 3600 as hours, a.status from approvals a join posts p on p.id = a.post_id
      where a.brand_id = $1 ${branchFilter} and a.created_at > now() - interval '120 days' and a.status in ('approved', 'rejected', 'changes_requested')`, args())).rows as { hours: number; status: string }[]
  if (ap.length >= 5) {
    const hs = ap.map((r) => Number(r.hours)).filter(Number.isFinite), med = median(hs)!
    const slow = hs.filter((h) => h > 48).length, rework = ap.filter((r) => r.status !== 'approved').length
    process.push({
      key: 'giro_aprovacao', area: 'processo', title: 'Giro das aprovações', confidence: ap.length >= 15 ? 'alta' : ap.length >= 8 ? 'media' : 'baixa', impact: med > 48 ? 'alto' : 'medio',
      statement: `A aprovação leva em mediana ${fmtHours(med)} (n=${ap.length}); ${slow} de ${ap.length} passaram de 48 h. ${rework} de ${ap.length} (${((rework / ap.length) * 100).toFixed(0)}%) voltaram para ajustes ou foram reprovadas.`,
      evidence: [`Decisões nos últimos 120 dias: ${ap.length}`, `Mediana: ${fmtHours(med)}`, `Acima de 48 h: ${slow}`, `Ajustes/reprovações: ${rework}`],
      action: { label: 'Ver a fila de aprovações', href: '/producao/aprovacoes' }, method: 'Tempo entre o envio e a decisão; retrabalho = decisões que não foram "aprovado".', period: 'últimos 120 dias',
      limits: ['Aprovações invalidadas por edição não entram.'],
    })
  }
  const pt = (await pool.query(
    `select (e.created_at at time zone 'America/Sao_Paulo')::date - p.post_date as delay from post_status_events e join posts p on p.id = e.post_id
      where p.brand_id = $1 ${branchFilter} and e.to_stage = 'publicado' and e.created_at > now() - interval '120 days'`, args())).rows.map((r) => Number(r.delay))
  if (pt.length >= 5) {
    const onTime = pt.filter((d) => d <= 0).length, late = pt.filter((d) => d > 0)
    process.push({
      key: 'pontualidade', area: 'processo', title: 'Pontualidade das publicações', confidence: pt.length >= 15 ? 'alta' : pt.length >= 8 ? 'media' : 'baixa', impact: onTime / pt.length < 0.7 ? 'alto' : 'medio',
      statement: `${onTime} de ${pt.length} conteúdos (${((onTime / pt.length) * 100).toFixed(0)}%) foram publicados na data prevista ou antes${late.length ? `; os ${late.length} atrasados tiveram atraso mediano de ${fmtNum(median(late)!, 0)} dia(s)` : ''}.`,
      evidence: [`Conteúdos confirmados como publicados: ${pt.length}`, `No prazo: ${onTime}`, `Atrasados: ${late.length}`], action: late.length ? { label: 'Ver os atrasados no quadro', href: '/producao?atrasados=1' } : null,
      method: 'Diferença entre a data da confirmação de publicação e a data prevista no calendário.', period: 'últimos 120 dias', limits: ['A data da confirmação pode ser posterior à publicação real na rede.'],
    })
  }

  // ---------- qualidade dos dados ----------
  const one = async (sql: string, extra: unknown[] = []) => Number((await pool.query(sql, args(extra))).rows[0]?.n ?? 0)
  const pubsAll = (await pool.query(
    `select count(*)::int total, count(*) filter (where e.content_id is not null)::int linked,
            count(*) filter (where s.data_quality = 'complete')::int complete, count(*) filter (where s.id is not null)::int with_snap
       from external_publications e left join lateral (select * from publication_metric_snapshots x where x.publication_id = e.id order by x.collected_on desc limit 1) s on true
      where e.brand_id = $1 and ($2::uuid is null or e.branch_id = $2 or e.branch_id is null) and e.published_at > now() - interval '90 days'`, [brandId, branchId])).rows[0]
  const postsPub = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage = 'publicado' and p.post_date > current_date - 90`)
  const postsPubLinked = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage = 'publicado' and p.post_date > current_date - 90 and exists (select 1 from external_publications e where e.content_id = p.id)`)
  const open = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage in ('ideia','briefing','producao','revisao','aprovacao','aprovado','agendado') and p.post_date >= current_date - 30`)
  const openOwned = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage in ('ideia','briefing','producao','revisao','aprovacao','aprovado','agendado') and p.post_date >= current_date - 30 and p.assigned_to is not null`)
  const ready = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage in ('aprovado','agendado') and p.post_date >= current_date - 30`)
  const readyArt = await one(`select count(*)::int n from posts p where p.brand_id = $1 ${branchFilter} and p.stage in ('aprovado','agendado') and p.post_date >= current_date - 30 and exists (select 1 from content_asset_links k where k.post_id = p.id and k.role = 'final')`)
  const goals = (await pool.query(`select count(*)::int n from brand_targets where brand_id = $1 and period_start = date_trunc('month', current_date)::date`, [brandId])).rows[0].n as number
  const know = (await pool.query(`select count(*)::int total, count(*) filter (where confirmed and (valid_until is null or valid_until >= current_date))::int ok from knowledge where brand_id = $1`, [brandId])).rows[0]
  const last = await lastCollection([brandId])
  const daysSince = last ? daysBetween(new Date(last).toISOString().slice(0, 10), today) : null
  const q: QualityItem[] = [
    { key: 'coleta_fresca', label: 'Coleta de métricas em dia', weight: 3, score: freshnessScore(daysSince), detail: daysSince === null ? 'Nunca houve coleta.' : `Última coleta há ${daysSince} dia(s).`, impact: 'Sem coleta recente, as análises usam números velhos.', fix: { label: 'Coletar métricas agora', href: '/resultados/vinculos' } },
    { key: 'vinculo_conteudos', label: 'Conteúdos publicados ligados à publicação real', weight: 3, score: coverage(postsPubLinked, postsPub), detail: `${postsPubLinked} de ${postsPub} conteúdos publicados nos últimos 90 dias.`, impact: 'Sem vínculo não dá para comparar temas, campanhas e peças planejadas.', fix: { label: 'Vincular publicações', href: '/resultados/vinculos?ver=pendentes' } },
    { key: 'vinculo_publicacoes', label: 'Publicações reais ligadas a um conteúdo', weight: 2, score: coverage(pubsAll.linked, pubsAll.total), detail: `${pubsAll.linked} de ${pubsAll.total} publicações dos últimos 90 dias.`, impact: 'Publicações sem vínculo ficam fora das análises por tema e campanha.', fix: { label: 'Vincular publicações', href: '/resultados/vinculos?ver=pendentes' } },
    { key: 'metricas_completas', label: 'Métricas completas por publicação', weight: 2, score: coverage(pubsAll.complete, pubsAll.with_snap), detail: `${pubsAll.complete} de ${pubsAll.with_snap} publicações com todas as métricas.`, impact: 'Métricas parciais deixam o engajamento como N/D.', fix: { label: 'Coletar métricas agora', href: '/resultados/vinculos' } },
    { key: 'amostra', label: 'Amostra de publicações maduras', weight: 2, score: pubs.length === 0 ? null : sampleScore(mature.length, 30), detail: `${mature.length} publicações com 7+ dias e métricas (ideal: 30+).`, impact: 'Com poucas peças, as comparações ficam inconclusivas.', fix: { label: 'Continuar publicando e coletando', href: '/resultados/vinculos' } },
    { key: 'metas', label: 'Metas do mês cadastradas', weight: 1, score: goals > 0 ? 1 : 0, detail: goals > 0 ? `${goals} meta(s) neste mês.` : 'Nenhuma meta neste mês.', impact: 'Sem meta não há como medir o ritmo.', fix: { label: 'Cadastrar metas', href: '/resultados/metas' } },
    { key: 'base_em_dia', label: 'Base de informações confirmada e em validade', weight: 2, score: coverage(know.ok, know.total), detail: `${know.ok} de ${know.total} itens confirmados e dentro da validade.`, impact: 'Informação vencida gera material com dado errado.', fix: { label: 'Revisar a base', href: '/gestao/base' } },
    { key: 'responsaveis', label: 'Conteúdos em andamento com responsável', weight: 1, score: coverage(openOwned, open), detail: `${openOwned} de ${open} conteúdos.`, impact: 'Sem responsável, atrasos não têm dono.', fix: { label: 'Atribuir no quadro', href: '/producao' } },
    { key: 'arte_final', label: 'Aprovados/agendados com arte final', weight: 1, score: coverage(readyArt, ready), detail: `${readyArt} de ${ready} conteúdos.`, impact: 'Sem arte final marcada, a publicação trava na hora.', fix: { label: 'Ver no quadro', href: '/producao?etapa=aprovado' } },
  ]
  return {
    brand, periodLabel, generatedAt: new Date().toISOString(), findings: sortFindings(findings), process: sortFindings(process), stageDurations, quality: qualityScore(q),
    counts: { publications: pubs.length, matured: mature.length, withMetrics: withM.length, linked: pubs.filter((p) => p.content_id).length },
  }
}
