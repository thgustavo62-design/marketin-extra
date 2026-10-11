// Datas importantes para uma farmácia (varejo e saúde). Calculadas localmente (puro e testado): feriados oficiais vêm da BrasilAPI,
// mas as datas comemorativas e as campanhas de saúde seguem regras fixas ou "n-ésimo dia da semana", sem depender de internet.
import { addDays, formatBR } from './dates.ts'

export type DateKind = 'varejo' | 'saude' | 'feriado'
export type KeyDate = {
  key: string
  name: string
  /** início (YYYY-MM-DD) */
  date: string
  /** fim, para campanhas de mês inteiro */
  endDate?: string
  kind: DateKind
  /** 1 = secundária · 2 = relevante · 3 = muito relevante para farmácia */
  relevance: 1 | 2 | 3
  /** ideia de ângulo para o conteúdo */
  angle: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const dow = (isoDate: string) => new Date(isoDate + 'T00:00:00Z').getUTCDay()

/** n-ésimo dia da semana (0 = domingo) de um mês. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = iso(year, month, 1)
  const offset = (weekday - dow(first) + 7) % 7
  return addDays(first, offset + 7 * (n - 1))
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

export function keyDatesFor(year: number): KeyDate[] {
  const easter = easterSunday(year)
  const blackFriday = addDays(nthWeekday(year, 11, 4, 4), 1) // sexta depois da 4ª quinta de novembro
  const d = (key: string, name: string, date: string, kind: DateKind, relevance: KeyDate['relevance'], angle: string, endDate?: string): KeyDate => ({ key: `${key}:${year}`, name, date, kind, relevance, angle, ...(endDate ? { endDate } : {}) })
  return [
    d('ano_novo', 'Ano Novo', iso(year, 1, 1), 'feriado', 1, 'Hábitos saudáveis e metas de bem-estar para o ano.'),
    d('farmaceutico', 'Dia do Farmacêutico', iso(year, 1, 20), 'saude', 3, 'Reconhecer a equipe de farmacêuticos e o cuidado que ela entrega.'),
    d('carnaval', 'Carnaval', addDays(easter, -47), 'feriado', 2, 'Protetor solar, hidratação, kit de primeiros socorros e cuidados na folia.'),
    d('mulher', 'Dia Internacional da Mulher', iso(year, 3, 8), 'varejo', 2, 'Saúde e autocuidado da mulher, perfumaria e cosméticos.'),
    d('consumidor', 'Dia do Consumidor', iso(year, 3, 15), 'varejo', 3, 'Ofertas de itens de giro (sempre com preço e validade confirmados).'),
    d('pascoa', 'Páscoa', easter, 'varejo', 2, 'Cuidado com excessos, saúde digestiva e presentes.'),
    d('saude', 'Dia Mundial da Saúde', iso(year, 4, 7), 'saude', 3, 'Serviços da farmácia e prevenção.'),
    d('maes', 'Dia das Mães', nthWeekday(year, 5, 0, 2), 'varejo', 3, 'Presentes, cuidado com a saúde da mãe e perfumaria.'),
    d('hipertensao', 'Dia Mundial da Hipertensão', iso(year, 5, 17), 'saude', 2, 'Aferição de pressão e orientação (serviço farmacêutico).'),
    d('namorados', 'Dia dos Namorados', iso(year, 6, 12), 'varejo', 3, 'Perfumaria, cosméticos e cuidado a dois.'),
    d('pais', 'Dia dos Pais', nthWeekday(year, 8, 0, 2), 'varejo', 3, 'Cuidados masculinos e prevenção (check-up).'),
    d('setembro_amarelo', 'Setembro Amarelo', iso(year, 9, 1), 'saude', 2, 'Saúde mental e acolhimento (conteúdo informativo, sem promoção de medicamento).', iso(year, 9, 30)),
    d('idoso', 'Dia Internacional da Pessoa Idosa', iso(year, 10, 1), 'saude', 2, 'Cuidado com a pessoa idosa, uso correto de medicamentos e organização da rotina.'),
    d('outubro_rosa', 'Outubro Rosa', iso(year, 10, 1), 'saude', 3, 'Prevenção do câncer de mama e autocuidado.', iso(year, 10, 31)),
    d('criancas', 'Dia das Crianças', iso(year, 10, 12), 'varejo', 3, 'Cuidados com a criança, higiene e presentes.'),
    d('novembro_azul', 'Novembro Azul', iso(year, 11, 1), 'saude', 3, 'Saúde do homem e prevenção do câncer de próstata.', iso(year, 11, 30)),
    d('diabetes', 'Dia Mundial do Diabetes', iso(year, 11, 14), 'saude', 2, 'Monitoramento da glicemia e orientação.'),
    d('black_friday', 'Black Friday', blackFriday, 'varejo', 3, 'Ofertas e comparação de preços (com preço integral informado e dentro do teto da CMED).'),
    d('natal', 'Natal', iso(year, 12, 25), 'varejo', 3, 'Presentes, plantão e cuidados nas festas.'),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

const endOf = (k: KeyDate) => k.endDate ?? k.date

/** Datas que ainda não passaram (ou campanhas de mês em andamento) dentro do horizonte. */
export function upcomingDates(from: string, horizonDays: number, minRelevance: 1 | 2 | 3 = 1): KeyDate[] {
  const to = addDays(from, horizonDays)
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4))
  const all: KeyDate[] = []
  for (let y = y0; y <= y1; y++) all.push(...keyDatesFor(y))
  return all.filter((k) => endOf(k) >= from && k.date <= to && k.relevance >= minRelevance).sort((a, b) => a.date.localeCompare(b.date))
}

/** Intervalo de datas de publicação que "cobre" a data importante (planejamento a tempo). */
export function coverageWindow(k: KeyDate): { from: string; to: string } {
  return { from: addDays(k.date, -4), to: k.endDate ?? addDays(k.date, 1) }
}

export const daysUntil = (from: string, k: KeyDate): number =>
  Math.round((Date.parse((k.date < from && k.endDate && k.endDate >= from ? from : k.date) + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5)

export const describeDate = (k: KeyDate): string => (k.endDate ? `${formatBR(k.date)} a ${formatBR(k.endDate)}` : formatBR(k.date))

export const DATE_KIND_LABEL: Record<DateKind, string> = { varejo: 'Varejo', saude: 'Saúde', feriado: 'Feriado' }
