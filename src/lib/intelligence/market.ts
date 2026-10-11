// Processamento dos dados externos DENTRO do nosso banco: cruza as datas importantes com o que já está planejado e dá contexto de preços.
import { pool } from '../db'
import { coverageWindow, daysUntil, describeDate, ipcaPeriodLabel, upcomingDates, IPCA_LABEL, type Finding, type KeyDate } from '../domain'

export type DateCoverage = { date: KeyDate; daysUntil: number; covered: boolean; posts: number }

/** Para cada data importante do horizonte: já existe conteúdo (não cancelado) planejado na janela de cobertura? */
export async function calendarCoverage(brandId: string, branchId: string | null, today: string, horizonDays = 60, minRelevance: 1 | 2 | 3 = 2): Promise<DateCoverage[]> {
  const dates = upcomingDates(today, horizonDays, minRelevance).filter((d) => d.kind !== 'feriado' || d.relevance >= 2)
  if (dates.length === 0) return []
  const from = dates.map((d) => coverageWindow(d).from).sort()[0], to = dates.map((d) => coverageWindow(d).to).sort().at(-1)!
  const posts = (await pool.query(
    `select post_date::text as d from posts where brand_id = $1 and ($2::uuid is null or branch_id = $2 or branch_id is null) and stage <> 'cancelado' and post_date between $3 and $4`,
    [brandId, branchId, from, to])).rows.map((r) => r.d as string)
  return dates.map((d) => {
    const w = coverageWindow(d)
    const n = posts.filter((p) => p >= w.from && p <= w.to).length
    return { date: d, daysUntil: Math.max(0, daysUntil(today, d)), covered: n > 0, posts: n }
  })
}

export async function marketFindings(brand: { id: string; name: string }, branchId: string | null, today: string): Promise<Finding[]> {
  const out: Finding[] = []
  const cov = await calendarCoverage(brand.id, branchId, today, 45, 2)
  const gaps = cov.filter((c) => !c.covered && c.daysUntil <= 30)
  if (gaps.length) {
    const urgent = gaps.some((g) => g.date.relevance === 3 && g.daysUntil <= 14)
    const first = gaps[0]
    out.push({
      key: 'datas_sem_conteudo', area: 'mercado', title: 'Datas importantes sem conteúdo planejado', confidence: 'alta', impact: urgent ? 'alto' : 'medio',
      statement: `${gaps.length} data${gaps.length > 1 ? 's' : ''} importante${gaps.length > 1 ? 's' : ''} nos próximos 30 dias ${gaps.length > 1 ? 'estão' : 'está'} sem nenhum conteúdo planejado: ${gaps.slice(0, 3).map((g) => `${g.date.name} (${describeDate(g.date)}, em ${g.daysUntil} dia${g.daysUntil === 1 ? '' : 's'})`).join('; ')}${gaps.length > 3 ? '…' : ''}.`,
      evidence: gaps.map((g) => `${g.date.name}: ${describeDate(g.date)} · relevância ${g.date.relevance}/3 · ideia: ${g.date.angle}`),
      action: { label: `Criar conteúdo para ${first.date.name}`, href: `/planejamento/conteudos/novo?data=${first.date.date < today ? today : first.date.date}` },
      method: 'Cruza o calendário de datas importantes (feriados e datas de varejo e saúde) com os conteúdos não cancelados da filial, na janela de 4 dias antes até 1 dia depois da data (campanhas de mês: o mês todo).',
      period: 'próximos 30 dias', limits: ['É um fato do calendário, não uma previsão de resultado: nem toda data importante combina com a marca.', 'A lista de datas é do próprio sistema; a de feriados vem da BrasilAPI.'],
    })
  }
  const ipca = (await pool.query(
    `select period, category, accumulated_12m_pct::float8 as acc from external_ipca where period = (select max(period) from external_ipca where accumulated_12m_pct is not null) and accumulated_12m_pct is not null`)).rows as { period: string; category: keyof typeof IPCA_LABEL; acc: number }[]
  const g = ipca.find((r) => r.category === 'geral'), f = ipca.find((r) => r.category === 'farmaceuticos'), s = ipca.find((r) => r.category === 'saude')
  if (g && (f || s)) {
    const pick = f ?? s!
    const diff = pick.acc - g.acc
    out.push({
      key: 'contexto_ipca', area: 'mercado', title: 'Contexto de preços (inflação)', confidence: 'alta', impact: 'baixo',
      statement: `Em ${ipcaPeriodLabel(g.period)}, ${IPCA_LABEL[pick.category].toLowerCase()} acumulam ${pick.acc.toFixed(2).replace('.', ',')}% em 12 meses (IPCA geral: ${g.acc.toFixed(2).replace('.', ',')}%) — ${Math.abs(diff) < 0.3 ? 'em linha com a inflação geral' : diff > 0 ? `${diff.toFixed(2).replace('.', ',')} p.p. acima da inflação geral` : `${Math.abs(diff).toFixed(2).replace('.', ',')} p.p. abaixo da inflação geral`}.`,
      evidence: ipca.map((r) => `${IPCA_LABEL[r.category]}: ${r.acc.toFixed(2).replace('.', ',')}% em 12 meses`),
      action: { label: 'Ver a série completa e as fontes', href: '/inteligencia?aba=mercado' },
      method: 'Série oficial do IBGE (IPCA, tabela SIDRA 7060), importada para o banco.', period: `12 meses até ${ipcaPeriodLabel(g.period)}`,
      limits: ['É a inflação ao consumidor de todo o país, não o preço da sua loja.', 'Medicamentos regulados têm reajuste anual definido pela CMED; o IPCA mede o que o consumidor paga em média.'],
    })
  }
  return out
}
