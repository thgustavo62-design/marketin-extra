// Do retrato (JSON) para blocos de apresentação. HTML, CSV e PDF consomem os mesmos blocos, então os números e o "N/D" são idênticos nos três.
import { REPORT_TYPES, STAGES, STAGE_ORDER, fmtNum, fmtPct, formatBR, periodLabel } from '../domain/index.ts'
import type { ReportSnapshot } from './build.ts'

export type Col = { title: string; width: number; align?: 'right' }
export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'kv'; rows: [string, string][] }
  | { kind: 'table'; title: string; columns: Col[]; rows: string[][]; note?: string }
  | { kind: 'list'; title?: string; items: string[] }
  | { kind: 'note'; text: string }

const brl = (n: number | null): string => (n === null ? 'N/D' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca coletado')
const day = (d: string | null): string => (d ? formatBR(d) : 'N/D')

export const LEGEND = 'N/D = a rede ou o sistema não informou o dado. Não é zero: zero é um valor medido.'

export function reportTitle(s: ReportSnapshot): string {
  return `Relatório ${REPORT_TYPES[s.type].toLowerCase()} — ${s.meta.brandName}${s.meta.branchName ? ' · ' + s.meta.branchName : ''}`
}

export function headerRows(s: ReportSnapshot): [string, string][] {
  const m = s.meta
  return [
    ['Filial', m.brandName],
    ['Unidade', m.branchName ?? 'Todas as unidades'],
    ['Período', periodLabel({ from: m.from, to: m.to })],
    ['Filtros', [m.formatLabel ? `formato: ${m.formatLabel}` : null, m.campaignName ? `campanha: ${m.campaignName}` : null].filter(Boolean).join(' · ') || 'nenhum'],
    ['Gerado em', dt(m.generatedAt)],
    ['Dados guardados até (última coleta)', dt(m.dataThrough)],
  ]
}

export function snapshotToBlocks(s: ReportSnapshot): Block[] {
  const out: Block[] = [{ kind: 'kv', rows: headerRows(s) }]
  if (s.operacional) out.push(...operacional(s))
  if (s.resultados) out.push(...resultados(s))
  if (s.executivo) out.push(...executivo(s))
  out.push({ kind: 'note', text: `${LEGEND} Os números refletem o retrato de ${dt(s.meta.generatedAt)}; para atualizar, gere o relatório de novo.` })
  return out
}

function operacional(s: ReportSnapshot): Block[] {
  const o = s.operacional!
  return [
    { kind: 'h2', text: 'Operação do período' },
    { kind: 'kv', rows: [
      ['Conteúdos planejados (sem cancelados)', fmtNum(o.planned)], ['Publicados', fmtNum(o.published)], ['Atrasados', fmtNum(o.overdueCount)],
      ['Sem responsável (em preparo)', fmtNum(o.noOwner)], ['Aprovações pendentes', fmtNum(o.pendingApprovals)], ['Campanhas recorrentes aguardando reconfirmação', fmtNum(o.pendingReconfirm)],
    ] },
    { kind: 'table', title: 'Por etapa', columns: [{ title: 'Etapa', width: 3 }, { title: 'Conteúdos', width: 1, align: 'right' }], rows: STAGE_ORDER.map((st) => [STAGES[st], fmtNum(o.byStage[st])]) },
    { kind: 'table', title: 'Atrasados', columns: [{ title: 'Conteúdo', width: 5 }, { title: 'Data prevista', width: 2 }, { title: 'Dias de atraso', width: 2, align: 'right' }, { title: 'Etapa', width: 3 }],
      rows: o.overdue.map((r) => [r.title, formatBR(r.date), fmtNum(r.daysLate), r.stage]), note: o.overdue.length ? undefined : 'Nenhum conteúdo atrasado no período.' },
    { kind: 'table', title: 'Conteúdos do período', columns: [{ title: 'Data', width: 2 }, { title: 'Conteúdo', width: 5 }, { title: 'Formato', width: 2 }, { title: 'Etapa', width: 3 }, { title: 'Responsável', width: 3 }, { title: 'Campanha', width: 3 }],
      rows: o.items.map((r) => [formatBR(r.date), r.title, r.format, r.stage, r.owner ?? 'sem responsável', r.campaign ?? '—']), note: o.itemsTruncated ? 'Lista limitada aos 300 primeiros conteúdos.' : undefined },
  ]
}

function resultados(s: ReportSnapshot): Block[] {
  const r = s.resultados!
  const ig = r.accounts.filter((a) => a.kind === 'instagram'), ads = r.accounts.filter((a) => a.kind === 'ads')
  const per = (a: { periodStart: string; periodEnd: string }) => `${formatBR(a.periodStart).slice(0, 5)} a ${formatBR(a.periodEnd).slice(0, 5)}`
  const blocks: Block[] = [
    { kind: 'h2', text: 'Instagram — publicações (orgânico)' },
    { kind: 'table', title: 'Desempenho por publicação', note: r.publications.length ? 'Engajamento = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance × 100. Alcance não é aditivo: não some o alcance das peças.' : 'Nenhuma publicação coletada neste período e filtro. Use "Coletar métricas agora" em Publicações vinculadas.',
      columns: [{ title: 'Data', width: 2 }, { title: 'Formato', width: 2 }, { title: 'Alcance', width: 2, align: 'right' }, { title: 'Visualiz.', width: 2, align: 'right' }, { title: 'Curtidas', width: 2, align: 'right' },
        { title: 'Coment.', width: 2, align: 'right' }, { title: 'Salv.', width: 2, align: 'right' }, { title: 'Comp.', width: 2, align: 'right' }, { title: 'Engaj.', width: 2, align: 'right' }, { title: 'Coletado', width: 3 }, { title: 'Conteúdo vinculado', width: 4 }],
      rows: r.publications.map((p) => [day(p.date), p.format, fmtNum(p.reach), fmtNum(p.views), fmtNum(p.likes), fmtNum(p.comments), fmtNum(p.saves), fmtNum(p.shares), fmtPct(p.engagement),
        p.collectedOn ? `${formatBR(p.collectedOn)}${p.quality === 'partial' ? ' (parcial)' : ''}` : 'nunca', p.content ?? 'não vinculado']) },
    { kind: 'table', title: 'Mediana por formato (publicações com 7+ dias)',
      columns: [{ title: 'Formato', width: 3 }, { title: 'Engajamento (mediana)', width: 3, align: 'right' }, { title: 'n', width: 1, align: 'right' }, { title: 'Salvamentos por mil alcançadas (mediana)', width: 4, align: 'right' }, { title: 'n', width: 1, align: 'right' }],
      rows: r.byFormat.map((b) => [b.format, b.engagement.enough ? fmtPct(b.engagement.median) : 'amostra pequena', String(b.engagement.n), b.savesPerK.enough ? fmtNum(b.savesPerK.median, 1) : 'amostra pequena', String(b.savesPerK.n)]),
      note: `Mediana só com 3+ publicações no grupo. ${r.immature} publicação(ões) com menos de 7 dias ficaram fora. Comparação descritiva: não indica causa.` },
    { kind: 'table', title: 'Desempenho por campanha (engajamento, mediana)', columns: [{ title: 'Campanha', width: 5 }, { title: 'Publicações', width: 2, align: 'right' }, { title: 'Engajamento (mediana)', width: 3, align: 'right' }, { title: 'n maduras', width: 2, align: 'right' }],
      rows: r.campaigns.map((c) => [c.name, fmtNum(c.publications), c.engagement.enough ? fmtPct(c.engagement.median) : 'amostra pequena', String(c.engagement.n)]), note: r.campaigns.length ? undefined : 'Nenhuma publicação vinculada a conteúdo de campanha neste período.' },
    { kind: 'h2', text: 'Instagram — totais da conta (orgânico)' },
    { kind: 'table', title: 'Último retrato guardado de cada conta', note: 'Totais do mês até a data da coleta (não do período inteiro do relatório).',
      columns: [{ title: 'Conta', width: 4 }, { title: 'Período do retrato', width: 3 }, { title: 'Visualizações', width: 3, align: 'right' }, { title: 'Interações', width: 3, align: 'right' }, { title: 'Seguidores', width: 3, align: 'right' }, { title: 'Coletado em', width: 3 }],
      rows: ig.map((a) => [a.account, per(a), fmtNum(a.views), fmtNum(a.interactions), fmtNum(a.followers), formatBR(a.collectedOn)]) },
    { kind: 'h2', text: 'Meta Ads (pago)' },
    { kind: 'table', title: 'Último retrato guardado de cada conta de anúncios', note: 'Pago e orgânico ficam separados: não some investimento com resultado orgânico.',
      columns: [{ title: 'Conta', width: 4 }, { title: 'Período do retrato', width: 3 }, { title: 'Investimento', width: 3, align: 'right' }, { title: 'Conversas iniciadas', width: 3, align: 'right' }, { title: 'Custo por conversa', width: 3, align: 'right' }, { title: 'Coletado em', width: 3 }],
      rows: ads.map((a) => [a.account, per(a), brl(a.spend), fmtNum(a.conversations), brl(a.costPerConversation), formatBR(a.collectedOn)]) },
  ]
  return blocks
}

function executivo(s: ReportSnapshot): Block[] {
  const e = s.executivo!
  const src = (g: { source: string; asOf: string | null }) => (g.source === 'internal' ? 'sistema' : g.source === 'history' ? `histórico (${dt(g.asOf)})` : 'sem dado')
  const val = (g: { realized: number | null; unit: 'count' | 'brl' }) => (g.unit === 'brl' ? brl(g.realized) : fmtNum(g.realized))
  const tgt = (g: { target: number; unit: 'count' | 'brl' }) => (g.unit === 'brl' ? brl(g.target) : fmtNum(g.target))
  return [
    { kind: 'h2', text: 'Visão rápida' },
    { kind: 'kv', rows: [['Conteúdos planejados', fmtNum(e.planned)], ['Publicados', fmtNum(e.published)], ['Atrasados', fmtNum(e.overdue)], ['Aprovações pendentes', fmtNum(e.pendingApprovals)], ['Publicações reais coletadas no período', fmtNum(e.realPublications)]] },
    { kind: 'table', title: `Metas de ${formatBR(s.meta.to).slice(3)}`, note: e.goals.length ? 'Comparação entre meta e realizado; não indica causa.' : 'Nenhuma meta cadastrada para este mês.',
      columns: [{ title: 'Indicador', width: 5 }, { title: 'Meta', width: 2, align: 'right' }, { title: 'Realizado', width: 2, align: 'right' }, { title: '% da meta', width: 2, align: 'right' }, { title: 'Situação', width: 3 }, { title: 'Fonte', width: 4 }],
      rows: e.goals.map((g) => [g.label + (g.direction === 'atMost' ? ' (teto)' : ''), tgt(g), val(g), g.pct === null ? 'N/D' : `${g.pct.toFixed(0)}%`, g.status, src(g)]) },
    { kind: 'table', title: 'Principais resultados (orgânico)', columns: [{ title: 'Formato', width: 3 }, { title: 'Engajamento (mediana)', width: 3, align: 'right' }, { title: 'n', width: 1, align: 'right' }],
      rows: e.byFormat.map((b) => [b.format, b.engagement.enough ? fmtPct(b.engagement.median) : 'amostra pequena', String(b.engagement.n)]), note: 'Só publicações com 7+ dias; mediana com 3+ por grupo.' },
    { kind: 'list', title: 'Observações calculadas (com a amostra)', items: e.observations.length ? e.observations : ['Ainda não há dados suficientes para observações confiáveis neste período.'] },
    { kind: 'list', title: 'Próximos passos (pendências reais)', items: e.nextSteps.length ? e.nextSteps.map((n) => `${n.label}: ${n.count}`) : ['Nenhuma pendência aberta neste recorte.'] },
  ]
}
