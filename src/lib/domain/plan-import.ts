// Leitura de um plano de conteúdo (texto extraído de um PDF) e conversão em pautas do calendário.
// Regras de negócio puras (sem Next, sem banco, sem IA): o texto é lido por padrões declarados e TUDO que não for entendido
// vira aviso para a pessoa conferir na prévia — nada entra no calendário sem confirmação.
//
// Estrutura reconhecida (a mesma dos planos de 60 dias da Minas Farma):
//   1) tabela "calendário": linhas com  [Dia N]  dd/mm/aaaa (Seg)  CÓDIGO  Formato  Tema  Horário  Stories de apoio
//   2) briefings por código:  "R01 — Título"  seguido de rótulos (Formato, Objetivo, Pilar, Gancho criativo, Direção visual,
//      CTA final, Roteiro de captação, Legenda pronta, Stories de apoio, Hook, Cenas sugeridas, Fala / narração, ...)
//   3) playbook de stories: "S01 — Título" seguido de "Frame 1: ...".
import { addDays, isIsoDate, WEEKDAYS } from './dates.ts'
import { checkAdvertising } from './advertising.ts'
import type { Format, Pillar } from './labels.ts'
import { emptyReels, REELS_TEMPLATE_TIMES, type ReelsScript } from './reels.ts'

export const MAX_PLAN_ENTRIES = 200

export type PlanKind = 'reel' | 'institucional' | 'carrossel' | 'stories' | 'outro'
export type PlanBlock = { code: string; heading: string; fields: Record<string, string>; lists: Record<string, string[]> }
export type PlanEntry = {
  index: number
  code: string
  codeFromPlan: boolean
  dayNumber: number | null
  date: string
  weekdayText: string | null
  formatText: string
  kind: PlanKind
  theme: string
  times: string[]
  timesText: string
  support: string
  block: PlanBlock | null
}
export type PlanWarning = { level: 'erro' | 'aviso' | 'info'; code: string; message: string; entry?: number }
export type ParsedPlan = {
  title: string | null
  period: { start: string; end: string } | null
  objective: string | null
  entries: PlanEntry[]
  warnings: PlanWarning[]
}

// ---------- utilidades de texto ----------
const strip = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '')
const norm = (s: string) => strip(s).toLowerCase()
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()

/** Junta as páginas, limpa e remove cabeçalho/rodapé repetidos e número de página. Devolve as linhas do documento. */
export function cleanPages(pages: string[]): string[] {
  const perPage = pages.map((p) =>
    // símbolos de marcador de lista do Word/PDF (área de uso privado) viram espaço; sem isso "● Story 1" fica com um caractere invisível
    p.replace(/[ -]/g, ' ').replace(/[​-‍﻿]/g, '').normalize('NFC').split(/\r?\n|\f/).map((l) => l.replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean))
  const PAGE_NO = /^(?:p[áa]gina\s+)?\d{1,3}(?:\s*(?:\/|de)\s*\d{1,3})?$/i
  const cleaned = perPage.map((lines) => lines.filter((l) => !PAGE_NO.test(l)))
  // cabeçalho/rodapé: mesma linha (ignorando dígitos) nas pontas (6 primeiras ou 6 últimas linhas) de boa parte das páginas.
  // Em muitos PDFs o rodapé vem junto do cabeçalho no texto extraído, por isso não basta olhar a primeira e a última linha.
  const EDGE = 6
  if (cleaned.length >= 4) {
    const key = (l: string) => l.replace(/\d+/g, '#')
    const edgeIdx = (n: number, i: number) => i < EDGE || i >= n - EDGE
    const count = new Map<string, number>()
    for (const lines of cleaned) {
      const keys = new Set(lines.filter((_, i) => edgeIdx(lines.length, i)).map(key))
      for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1)
    }
    const limit = Math.max(3, Math.ceil(cleaned.length * 0.6))
    const repeated = new Set([...count].filter(([, n]) => n >= limit).map(([k]) => k))
    if (repeated.size) {
      return cleaned.flatMap((lines) => lines.filter((l, i) => !(edgeIdx(lines.length, i) && repeated.has(key(l)))))
    }
  }
  return cleaned.flat()
}

// ---------- calendário ----------
// o ano é opcional ("20/10"): quando falta, vem do período anunciado no começo do documento
const DATE_START = /^(?:Dia\s*(\d{1,3})\s*)?(\d{2})\/(\d{2})(?:\/(\d{4}))?(?!\d)\s*(?:\(([^)]{2,12})\))?\s*(.*)$/i
const DAY_ONLY = /^Dia\s*(\d{1,3})$/i
const MAX_ROW_LINES = 12
const SUBTITLE = /^Dias?\s+\d{1,3}\s*(?:a|–|-)\s*\d{1,3}$/i
const TABLE_HEAD = /^(?:dia\s*\/\s*data\b|data\s+tipo\s+pauta\b)/i
const SECTION_HEAD = /^\d{1,2}\.\s+[A-ZÀ-Ú]/
const BLOCK_HEAD = /^([A-Z]{1,3}\d{2,3})\s*[—–-]\s*(.+)$/
// "M01 / 20/10 / CARROSSEL / SEMANA 1": o título vem na linha seguinte
const BLOCK_HEAD2 = /^([A-Z]{1,3}\d{2,3})\s*\/\s*(\d{2}\/\d{2}(?:\/\d{4})?)\s*\/\s*([^/]+?)(?:\s*\/\s*SEMANA\s*(\d+))?\s*$/i
// linha do calendário no estilo "C M01 Título" (letra do tipo + código + título, tudo em uma linha)
const ROW_LETTER = /^([CRSIF])\s+([A-Z]{1,3}\d{2,3})\b\s*(.*)$/
const LETTER_FORMAT: Record<string, { label: string; kind: PlanKind }> = {
  C: { label: 'Carrossel', kind: 'carrossel' }, R: { label: 'Reel', kind: 'reel' }, S: { label: 'Stories', kind: 'stories' },
  I: { label: 'Feed institucional', kind: 'institucional' }, F: { label: 'Feed', kind: 'institucional' },
}
const MAX_CONTINUATION = 60 // uma célula do calendário que quebra gera linhas curtas; texto corrido é longo
const FORMAT_RX = /^(feed\s+institucional|institucional|feed|reels?|carross[eé]is?|carrossel|stor(?:y|ies)|v[ií]deo|post)\b[\s:–—-]*/i
const TIME_TOKEN = '(?:[01]?\\d|2[0-3])\\s?(?:h\\s?[0-5]\\d|h|:[0-5]\\d)'
const TIME_LIST = new RegExp(`(?<![\\d:])${TIME_TOKEN}(?:\\s*(?:/|,|e|&|–|-|\\+)\\s*${TIME_TOKEN})*(?!\\w)`, 'i')

function toHHMM(token: string): string | null {
  const m = /^(\d{1,2})\s?(?:h\s?(\d{2})?|:(\d{2}))$/i.exec(token.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2] ?? m[3] ?? '0')
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null
}

function kindOf(formatText: string, code: string | null): PlanKind {
  const f = norm(formatText)
  if (/reel|video/.test(f)) return 'reel'
  if (/carross/.test(f)) return 'carrossel'
  if (/stor/.test(f)) return 'stories'
  if (/institucional|feed|post/.test(f)) return 'institucional'
  const c = code?.[0]
  return c === 'R' ? 'reel' : c === 'C' ? 'carrossel' : c === 'S' ? 'stories' : c === 'I' ? 'institucional' : 'outro'
}

type Row = { code: string | null; formatText: string; kind: PlanKind; theme: string; times: string[]; timesText: string; support: string }

export function parseRow(text: string): Row | null {
  let rest = clean(text)
  const lm = ROW_LETTER.exec(rest)
  if (lm) {
    const f = LETTER_FORMAT[lm[1]]
    return { code: lm[2], formatText: f.label, kind: f.kind, theme: clean(lm[3]), times: [], timesText: '', support: '' }
  }
  let code: string | null = null
  const cm = /^([A-Z]{1,3})\s?(\d{2,3})\b/.exec(rest)
  if (cm) { code = cm[1] + cm[2]; rest = rest.slice(cm[0].length).trim() }
  const fm = FORMAT_RX.exec(rest)
  const formatText = fm ? fm[1] : ''
  if (fm) rest = rest.slice(fm[0].length).trim()
  if (!code && !formatText) return null
  const tm = TIME_LIST.exec(rest)
  const theme = clean(tm ? rest.slice(0, tm.index) : rest).replace(/[\s:–—-]+$/, '')
  const timesText = tm ? tm[0].trim() : ''
  const times = tm ? [...tm[0].matchAll(new RegExp(TIME_TOKEN, 'gi'))].map((m) => toHHMM(m[0])).filter((t): t is string => t !== null) : []
  const support = tm ? clean(rest.slice(tm.index + tm[0].length)) : ''
  return { code, formatText, kind: kindOf(formatText, code), theme, times, timesText, support }
}

type RawRow = { dayNumber: number | null; dd: string; mm: string; yyyy: string | null; weekday: string | null; text: string }

function isRowBoundary(line: string, next: string | undefined): boolean {
  return DATE_START.test(line) || (DAY_ONLY.test(line) && next !== undefined && DATE_START.test(next)) || SUBTITLE.test(line) || TABLE_HEAD.test(line)
    || (SECTION_HEAD.test(line) && line.length > 20) || BLOCK_HEAD.test(line) || BLOCK_HEAD2.test(line)
}

function collectRows(lines: string[]): RawRow[] {
  const rows: RawRow[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    let day: number | null = null
    if (DAY_ONLY.test(line) && lines[i + 1] !== undefined && DATE_START.test(lines[i + 1])) { day = Number(DAY_ONLY.exec(line)![1]); line = lines[++i] }
    const m = DATE_START.exec(line)
    if (!m) continue
    if (m[1] !== undefined) day = Number(m[1])
    const parts = [m[6]]
    // Estilo "20/10 C M01 Título": a linha já está completa. Estilo de tabela quebrada: as células viram linhas curtas.
    // Texto corrido (longo) logo depois da tabela nunca entra na linha, e uma linha que já terminou em pontuação final está completa.
    const oneLine = ROW_LETTER.test(m[6])
    while (
      i + 1 < lines.length && parts.length < MAX_ROW_LINES && !isRowBoundary(lines[i + 1], lines[i + 2])
      && (!oneLine || (lines[i + 1].length <= MAX_CONTINUATION && !ENDS_SENTENCE.test(parts[parts.length - 1])))
    ) parts.push(lines[++i])
    rows.push({ dayNumber: day, dd: m[2], mm: m[3], yyyy: m[4] ?? null, weekday: m[5] ? clean(m[5]) : null, text: clean(parts.join(' ')) })
  }
  return rows
}

// ---------- briefings ----------
// colon: palavra comum ("Medir", "Produção"): só vale como rótulo com dois-pontos, para não confundir com texto ou título de seção
type Label = { key: string; list: boolean; words: string; colon?: boolean }
const LABELS: Label[] = [
  { key: 'formato', list: false, words: 'formato' },
  { key: 'objetivo', list: false, words: 'objetivo' },
  { key: 'pilar', list: false, words: 'pilar' },
  { key: 'gancho', list: false, words: 'gancho criativo' },
  { key: 'direcao', list: false, words: 'direcao visual' },
  { key: 'cta', list: false, words: 'cta final' },
  { key: 'legenda', list: false, words: 'legenda pronta' },
  { key: 'obs_operacional', list: false, words: 'observacao operacional' },
  { key: 'obs_estrategica', list: false, words: 'observacao estrategica' },
  { key: 'arte', list: false, words: 'orientacao de arte' },
  { key: 'data', list: false, words: 'data no plano' },
  { key: 'tipo', list: false, words: 'tipo / duracao' },
  { key: 'tipo', list: false, words: 'tipo/duracao' },
  { key: 'tipo', list: false, words: 'tipo e duracao' },
  { key: 'hook', list: false, words: 'hook' },
  { key: 'fala', list: false, words: 'fala / narracao' },
  { key: 'fala', list: false, words: 'fala/narracao' },
  { key: 'fala', list: false, words: 'narracao' },
  { key: 'regra', list: false, words: 'regra fixa do dia' },
  { key: 'legenda', list: false, words: 'legenda', colon: true },
  { key: 'producao', list: false, words: 'producao', colon: true },
  { key: 'medir', list: false, words: 'medir', colon: true },
  { key: 'por_que', list: false, words: 'por que testar', colon: true },
  { key: 'captacao', list: true, words: 'roteiro de captacao' },
  { key: 'stories_apoio', list: true, words: 'stories de apoio' },
  { key: 'slides', list: true, words: 'roteiro slide a slide' },
  { key: 'cenas', list: true, words: 'cenas sugeridas' },
].sort((a, b) => b.words.length - a.words.length)

function labelOf(line: string): { label: Label; value: string } | null {
  const n = norm(line)
  for (const l of LABELS) {
    if (n.startsWith(l.words + ':') || (!l.colon && (n === l.words || n.startsWith(l.words + ' ')))) {
      return { label: l, value: line.slice(l.words.length).replace(/^[\s:–—-]+/, '').trim() }
    }
  }
  return null
}

const TIMED = /^\d{1,2}\s?[-–]\s?\d{1,2}\s?s\s*:/i // "0-3s: cena" (Reel por tempo)
const ITEM_START = /^(?:\d{1,3}[.)]\s|[-•*▪●○◦·–]\s|Story\s?\d|Slide\s?\d|Card\s?\d|Capa\b|Frame\s?\d|Cena\s?\d|Passo\s?\d|\d{1,2}\s?[-–]\s?\d{1,2}\s?s\s*:)/i
const FRAME = /^(?:\d{1,3}[.)]\s*)?(Frame\s*\d+\s*[:\-–].*)$/i
const CARD = /^(?:Capa|Card\s*\d+|Slide\s*\d+)\s*:/i // carrossel: "Capa: ..." e "Card 2: ..." sem rótulo de lista
// título em CAIXA ALTA de uma nova seção do PDF ("PRODUÇÃO E DISTRIBUIÇÃO"): encerra o briefing em texto corrido
const KICKER = /^[A-ZÀ-Ú][A-ZÀ-Ú\s/&–-]{7,}$/
const stripBullet = (s: string) => s.replace(/^(?:\d{1,3}[.)]|[-•*▪●○◦·–])\s+/, '').trim()
const ENDS_SENTENCE = /[.!?…:”"»)]$/

function joinText(lines: string[], paragraphs: boolean): string {
  if (!paragraphs) return clean(lines.join(' '))
  let out = ''
  for (const l of lines) {
    if (!out) out = l
    else out += (ENDS_SENTENCE.test(out) ? '\n' : ' ') + l
  }
  return out.trim()
}

function toItems(lines: string[]): string[] {
  const marked = lines.some((l) => ITEM_START.test(l))
  const items: string[] = []
  for (const l of lines) {
    if (!marked || ITEM_START.test(l) || items.length === 0) items.push(stripBullet(l))
    else items[items.length - 1] += ' ' + l
  }
  return items.map(clean).filter(Boolean)
}

type Open = { key: string; list: boolean; lines: string[] }

function parseBlocks(lines: string[]): { blocks: PlanBlock[]; duplicates: string[] } {
  const blocks: PlanBlock[] = []
  const seen = new Set<string>(), duplicates: string[] = []
  let cur: PlanBlock | null = null
  let open: Open | null = null
  let awaitTitle = false
  const flush = () => {
    if (cur && open && open.lines.length) {
      if (open.list) cur.lists[open.key] = toItems(open.lines)
      else {
        let text = joinText(open.lines, open.key === 'legenda' || open.key === 'fala')
        // "Medir: ..." é uma linha; o que vier depois (rodapé, próxima seção) não é dela
        if (open.key === 'medir') text = joinText(open.lines.slice(0, 2), false)
        // "Objetivo: ... Por que testar: ..." na mesma linha
        const split = open.key === 'objetivo' ? /\bPor que testar:\s*/i.exec(text) : null
        if (split) { cur.fields.por_que = text.slice(split.index + split[0].length).trim(); text = text.slice(0, split.index).trim().replace(/\.$/, '') }
        cur.fields[open.key] = text
      }
    }
    open = null
  }
  const start = (code: string, heading: string, extra: Record<string, string> = {}): PlanBlock => {
    if (seen.has(code)) duplicates.push(code)
    seen.add(code)
    const b: PlanBlock = { code, heading, fields: { ...extra }, lists: {} }
    blocks.push(b)
    return b
  }
  for (const line of lines) {
    const head = BLOCK_HEAD.exec(line)
    if (head) { flush(); awaitTitle = false; cur = start(head[1].toUpperCase(), clean(head[2])); continue }
    const head2 = BLOCK_HEAD2.exec(line)
    if (head2) {
      flush()
      cur = start(head2[1].toUpperCase(), '', { data: head2[2], formato: clean(head2[3]), ...(head2[4] ? { semana: head2[4] } : {}) })
      awaitTitle = true
      continue
    }
    if (!cur) continue
    if (awaitTitle) { awaitTitle = false; if (!labelOf(line)) { cur.heading = clean(line); continue } }
    // título de nova seção em CAIXA ALTA ("PRODUÇÃO E DISTRIBUIÇÃO"): encerra o briefing antes de ser lido como rótulo
    if (KICKER.test(line) && (!open || !open.list)) { flush(); cur = null; continue }
    const lab = labelOf(line)
    if (lab) {
      flush()
      open = { key: lab.label.key, list: lab.label.list, lines: lab.value ? [lab.value] : [] }
      continue
    }
    const frame = FRAME.exec(line)
    if (frame) {
      if (!open || open.key !== 'frames') { flush(); open = { key: 'frames', list: true, lines: [] } }
      open.lines.push(frame[1])
      continue
    }
    // carrossel sem rótulo de lista ("Capa:", "Card 2:") e Reel por tempo ("0-3s:")
    const implicit = CARD.test(line) ? 'slides' : TIMED.test(line) ? 'cenas_tempo' : null
    if (implicit) {
      if (!open || open.key !== implicit) { flush(); open = { key: implicit, list: true, lines: [] } }
      open.lines.push(line)
      continue
    }
    // em texto corrido, um título numerado ("10. Playbook...") ou em CAIXA ALTA encerra o bloco; em listas, numerar é item
    if ((SECTION_HEAD.test(line) || KICKER.test(line)) && (!open || !open.list || open.key === 'frames')) { flush(); cur = null; continue }
    if (open) open.lines.push(line)
  }
  flush()
  return { blocks, duplicates }
}

// ---------- plano completo ----------
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
const weekdayOf = (iso: string) => WEEKDAYS[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7]
const fmtBR = (iso: string) => iso.split('-').reverse().join('/')

// Alguns PDFs gravam o emoji 📲 (antes do telefone) com o código de outro emoji: vira 🐀. Antes de um telefone é quase certo que é o 📲.
const MISMAPPED_PHONE_EMOJI = /\u{1F400}(?=\s*\(?\d{2}\)?\s?\d{4,5}-?\d{4})/gu

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }
const pad2 = (n: number) => String(n).padStart(2, '0')
const weekdayIdx = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7

type Span = { start: string; end: string; strict: boolean }

/** Período anunciado no começo do documento: "25/05/2026 a 23/07/2026" (strict) ou "19 de outubro a 17 de dezembro de 2026". */
export function announcedSpan(lines: string[]): Span | null {
  const head = lines.slice(0, 30).join(' ')
  const num = /(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(head)
  if (num) return { start: `${num[3]}-${num[2]}-${num[1]}`, end: `${num[6]}-${num[5]}-${num[4]}`, strict: true }
  const long = /(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\s+(?:a|ate)\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(norm(head))
  if (long) {
    const m1 = MONTHS[long[2]], m2 = MONTHS[long[5]]
    if (m1 && m2) {
      const y2 = Number(long[6])
      const y1 = long[3] ? Number(long[3]) : m1 > m2 ? y2 - 1 : y2
      const start = `${y1}-${pad2(m1)}-${pad2(Number(long[1]))}`, end = `${y2}-${pad2(m2)}-${pad2(Number(long[4]))}`
      if (isIsoDate(start) && isIsoDate(end) && start <= end) return { start, end, strict: false }
    }
  }
  return null
}

/** Ano de uma data escrita sem ano ("20/10"): o do período anunciado em que ela cai (com 7 dias de folga), senão o ano de referência. */
function resolveYear(dd: string, mm: string, span: Span | null, hint: number): number {
  if (!span) return hint
  const y0 = Number(span.start.slice(0, 4)), y1 = Number(span.end.slice(0, 4))
  for (let y = y0; y <= y1; y++) {
    const d = `${y}-${mm}-${dd}`
    if (d >= addDays(span.start, -7) && d <= addDays(span.end, 7)) return y
  }
  return y0
}

type Window = { weekday: number; time: string; label: string; kind: PlanKind | null }
const WEEK_IDX: Record<string, number> = { segunda: 0, terca: 1, quarta: 2, quinta: 3, sexta: 4, sabado: 5, domingo: 6 }

/** Regra de horários por dia da semana: "Terça 12h: carrossel • Quinta 18h: Reel • Sábado 10h: carrossel". */
export function scheduleWindows(lines: string[]): Window[] {
  const out = new Map<string, Window>()
  for (const l of lines) {
    for (const m of norm(l).matchAll(/(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\s+(\d{1,2})\s?h(\d{2})?\s*:\s*([a-z]+)/g)) {
      const h = Number(m[2]), min = Number(m[3] ?? '0')
      if (h > 23 || min > 59) continue
      const kw = m[4]
      const kind: PlanKind | null = /^reel/.test(kw) ? 'reel' : /^carross/.test(kw) ? 'carrossel' : /^stor/.test(kw) ? 'stories' : /^(feed|post|institucional)/.test(kw) ? 'institucional' : null
      const time = `${pad2(h)}:${pad2(min)}`
      out.set(`${WEEK_IDX[m[1]]}|${kind}|${time}`, { weekday: WEEK_IDX[m[1]], time, label: `${h}h${min ? pad2(min) : ''}`, kind })
    }
  }
  return [...out.values()]
}

export function parsePlan(rawPages: string[], opts: { defaultYear?: number } = {}): ParsedPlan {
  let fixedEmoji = 0
  const pages = rawPages.map((p) => p.replace(MISMAPPED_PHONE_EMOJI, () => { fixedEmoji++; return '\u{1F4F2}' }))
  const lines = cleanPages(pages)
  const warnings: PlanWarning[] = []
  if (fixedEmoji) warnings.push({ level: 'info', code: 'emoji_corrigido', message: `Troquei ${fixedEmoji} emoji 🐀 por 📲 antes de telefones (erro comum de fonte na exportação do PDF). Confira as legendas.` })
  const raw = collectRows(lines)
  const { blocks, duplicates } = parseBlocks(lines)
  const blockByCode = new Map(blocks.map((b) => [b.code, b]))
  for (const d of duplicates) warnings.push({ level: 'aviso', code: 'briefing_duplicado', message: `O briefing ${d} aparece mais de uma vez no PDF; foi usada a primeira ocorrência.` })

  const span = announcedSpan(lines)
  const hint = Number(/\b(20\d{2})\b/.exec(lines.slice(0, 30).join(' '))?.[1]) || opts.defaultYear || new Date().getFullYear()
  let yearAssumed = false

  const entries: PlanEntry[] = []
  const usedBlocks = new Set<string>()
  const seenKey = new Set<string>()
  for (const r of raw) {
    const row = parseRow(r.text)
    if (!row) continue
    if (!r.yyyy) yearAssumed = true
    const date = `${r.yyyy ?? resolveYear(r.dd, r.mm, span, hint)}-${r.mm}-${r.dd}`
    if (!isIsoDate(date)) { warnings.push({ level: 'erro', code: 'data_invalida', message: `Data inexistente no calendário (${r.dd}/${r.mm}): a linha “${r.text.slice(0, 60)}” foi ignorada.` }); continue }
    if (entries.length >= MAX_PLAN_ENTRIES) { warnings.push({ level: 'erro', code: 'muitas_linhas', message: `O plano passa de ${MAX_PLAN_ENTRIES} linhas; só as primeiras foram lidas.` }); break }
    const index = entries.length
    const code = row.code ?? `D${String(index + 1).padStart(2, '0')}`
    const key = `${code}|${date}`
    if (seenKey.has(key)) { warnings.push({ level: 'aviso', code: 'linha_repetida', message: `${code} em ${fmtBR(date)} aparece duas vezes no calendário; a repetição foi ignorada.` }); continue }
    seenKey.add(key)
    const block = row.code ? blockByCode.get(code) ?? null : null
    if (block) usedBlocks.add(code)
    entries.push({ index, code, codeFromPlan: row.code !== null, dayNumber: r.dayNumber, date, weekdayText: r.weekday, formatText: row.formatText, kind: row.kind, theme: row.theme || block?.heading || code, times: row.times, timesText: row.timesText, support: row.support, block })
  }

  if (entries.length === 0) {
    warnings.push({ level: 'erro', code: 'sem_calendario', message: 'Não encontrei o calendário no PDF (linhas com data, código e formato). Confira se o PDF tem texto selecionável e a tabela “Calendário”.' })
    return { title: null, period: null, objective: null, entries, warnings }
  }
  if (yearAssumed) {
    warnings.push(span
      ? { level: 'info', code: 'ano_do_periodo', message: `As datas do calendário não trazem o ano; usei o do período anunciado no PDF (${fmtBR(span.start)} a ${fmtBR(span.end)}).` }
      : { level: 'aviso', code: 'ano_assumido', message: `As datas do calendário não trazem o ano e o PDF não anuncia o período; assumi ${hint}. Confira as datas na prévia.` })
  }

  // horários que o PDF dá por regra semanal (ex.: "Terça 12h: carrossel • Quinta 18h: Reel")
  const windows = scheduleWindows(lines)
  let scheduled = 0
  if (windows.length) {
    for (const e of entries) {
      if (e.timesText) continue
      const day = windows.filter((w) => w.weekday === weekdayIdx(e.date))
      // regra do mesmo formato; ou regra sem formato indicado. Nunca o horário de outro formato (carrossel não herda o horário do Reel)
      const pick = day.find((w) => w.kind === e.kind) ?? day.find((w) => w.kind === null)
      if (pick) { e.times = [pick.time]; e.timesText = pick.label; scheduled++ }
    }
    if (scheduled) {
      const rule = windows.map((w) => `${WEEKDAYS[w.weekday]} ${w.label}${w.kind ? ` (${w.kind === 'institucional' ? 'feed' : w.kind})` : ''}`).join(', ')
      warnings.push({ level: 'info', code: 'horario_por_regra', message: `${scheduled} peça(s) receberam o horário da regra semanal do PDF: ${rule}. O PDF as chama de janelas iniciais de teste.` })
    }
  }

  const dates = entries.map((e) => e.date).sort()
  const period = { start: dates[0], end: dates[dates.length - 1] }

  // conferências: o PDF pode ter erro de digitação e o calendário não deve herdá-lo em silêncio
  const codeCount = new Map<string, number>()
  for (const e of entries) {
    if (e.codeFromPlan) codeCount.set(e.code, (codeCount.get(e.code) ?? 0) + 1)
    if (e.weekdayText && norm(e.weekdayText).slice(0, 3) !== norm(weekdayOf(e.date)).slice(0, 3)) {
      warnings.push({ level: 'aviso', code: 'dia_da_semana', entry: e.index, message: `${e.code}: ${fmtBR(e.date)} cai em ${weekdayOf(e.date)}, mas o PDF diz “${e.weekdayText}”. Confira a data.` })
    }
    if (e.dayNumber !== null) {
      const expected = dayDiff(period.start, e.date) + 1
      if (expected !== e.dayNumber) warnings.push({ level: 'aviso', code: 'numero_do_dia', entry: e.index, message: `${e.code}: o PDF diz “Dia ${e.dayNumber}”, mas ${fmtBR(e.date)} é o dia ${expected} do período.` })
    }
    if (e.block) {
      const planned = /(\d{2})\/(\d{2})(?:\/(\d{4}))?/.exec(e.block.fields.data ?? '')
      if (planned && `${planned[3] ?? e.date.slice(0, 4)}-${planned[2]}-${planned[1]}` !== e.date) {
        warnings.push({ level: 'aviso', code: 'data_divergente', entry: e.index, message: `${e.code}: o calendário diz ${fmtBR(e.date)}, mas o briefing diz ${planned[0]}. Foi usada a data do calendário.` })
      }
    } else if (e.codeFromPlan) {
      warnings.push({ level: 'info', code: 'sem_briefing', entry: e.index, message: `${e.code}: não encontrei o briefing completo; entra só com data, formato, tema e stories de apoio.` })
    }
    if (!e.timesText) warnings.push({ level: 'info', code: 'sem_horario', entry: e.index, message: `${e.code}: sem horário no calendário.` })
  }
  for (const [code, n] of codeCount) if (n > 1) warnings.push({ level: 'aviso', code: 'codigo_repetido', message: `O código ${code} aparece em ${n} datas diferentes.` })
  for (const b of blocks) if (!usedBlocks.has(b.code)) warnings.push({ level: 'info', code: 'briefing_sem_data', message: `${b.code} (${b.heading}) tem briefing mas não está no calendário; não será importado.` })

  // dias do período sem nenhuma peça (só quando o plano é quase diário; um calendário esparso é proposital)
  const have = new Set(dates)
  const gaps: string[] = []
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) if (!have.has(d)) gaps.push(d)
  if (gaps.length && entries.length >= 7 && entries.length >= 0.7 * (dayDiff(period.start, period.end) + 1)) {
    warnings.push({ level: 'info', code: 'dias_sem_peca', message: `${gaps.length} dia(s) do período sem peça: ${gaps.slice(0, 8).map((g) => fmtBR(g).slice(0, 5)).join(', ')}${gaps.length > 8 ? '…' : ''}.` })
  }

  // período anunciado no começo do documento
  if (span) {
    if (span.strict) {
      if (span.start !== period.start || span.end !== period.end) warnings.push({ level: 'aviso', code: 'periodo_divergente', message: `O PDF anuncia o período ${fmtBR(span.start)} a ${fmtBR(span.end)}, mas as linhas do calendário vão de ${fmtBR(period.start)} a ${fmtBR(period.end)}.` })
    } else {
      const outside = entries.filter((e) => e.date < span.start || e.date > span.end)
      if (outside.length) warnings.push({ level: 'aviso', code: 'fora_do_periodo', message: `${outside.length} peça(s) estão fora do período anunciado no PDF (${fmtBR(span.start)} a ${fmtBR(span.end)}): ${outside.slice(0, 5).map((e) => `${e.code} (${fmtBR(e.date).slice(0, 5)})`).join(', ')}.` })
    }
  }

  // objetivo: "Objetivo do ciclo: ..." ou o parágrafo de "Direção central"; pode quebrar em até 3 linhas no PDF
  let objective: string | null = null
  const objAt = lines.slice(0, 40).findIndex((l) => /^Objetivo do ciclo\s*:\s*\S/i.test(l))
  if (objAt >= 0) {
    let text = lines[objAt].replace(/^Objetivo do ciclo\s*:\s*/i, '')
    for (let k = 1; k <= 3 && !ENDS_SENTENCE.test(text) && lines[objAt + k] !== undefined && !labelOf(lines[objAt + k]) && !BLOCK_HEAD.test(lines[objAt + k]); k++) text += ' ' + lines[objAt + k]
    objective = clean(text)
  } else {
    const at = lines.slice(0, 60).findIndex((l) => /^dire[cç][aã]o central$/i.test(l))
    if (at >= 0) {
      let text = ''
      for (let k = 1; k <= 3 && lines[at + k] !== undefined; k++) { text += (text ? ' ' : '') + lines[at + k]; if (ENDS_SENTENCE.test(text)) break }
      objective = clean(text) || null
    }
  }
  const title = lines.slice(0, 3).filter((l) => !DATE_START.test(l)).slice(0, 2).join(' — ').slice(0, 140) || null
  return { title, period, objective, entries, warnings }
}

// ---------- conversão em pautas ----------
const PILLAR_RULES: [RegExp, Pillar][] = [
  [/bastidor/, 'bastidores'],
  [/medicament|generic|vitamin|remedio|antibiot|suplement/, 'medicamentos'],
  [/educa|dica|utilidade|autoridade|checklist|organiz/, 'educacao'],
  [/oferta|economia|promo|combo|desconto|campanha|preco|sorteio/, 'campanha'],
  [/proximidade|relacion|comunidade|prova social|atendimento|humaniz|cliente|famil|club|fidelid|cadastro|ativac|retenc|vinculo/, 'relacionamento'],
  [/rapidez|servico|conveniencia|entrega|delivery|whatsapp/, 'servicos'],
  [/confianca|institucional|marca|territorio|manifesto/, 'institucional'],
]
const pillarOfText = (s: string): Pillar | null => { const n = norm(s); return PILLAR_RULES.find(([re]) => re.test(n))?.[1] ?? null }
const KIND_PILLAR: Record<PlanKind, Pillar> = { reel: 'institucional', institucional: 'institucional', carrossel: 'educacao', stories: 'relacionamento', outro: 'institucional' }

export function inferPillar(e: PlanEntry): Pillar {
  const f = e.block?.fields ?? {}
  // o primeiro termo do pilar manda ("Confiança + Rapidez" → Confiança); no Reel o tipo vem antes de "| 40 a 60 segundos"
  for (const src of [f.pilar, f.tipo?.split('|')[0], f.objetivo]) {
    for (const part of (src ?? '').split(/[+,/&]/)) { const p = pillarOfText(part); if (p) return p }
  }
  return pillarOfText(e.theme) ?? KIND_PILLAR[e.kind]
}

export const FORMAT_OF_KIND: Record<PlanKind, Format> = { reel: 'reels', carrossel: 'carrossel', institucional: 'feed', stories: 'feed', outro: 'feed' }

export type PostDraft = {
  index: number
  code: string
  title: string
  post_date: string
  post_time: string | null
  format: Format
  pillar: Pillar
  caption: string
  script: string
  reels: ReelsScript
  stage: 'ideia' | 'briefing'
  due_at: string
  checklist: string[]
  comment: string
  ad: { medicine: boolean; issues: number }
}
export type DraftOptions = { leadDays: number; initialStage: 'auto' | 'ideia' | 'briefing'; fileName: string }

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const joinLines = (...parts: (string | null | undefined | false)[]) => parts.filter((p): p is string => Boolean(p)).join('\n')

export function buildDraft(e: PlanEntry, opts: DraftOptions): PostDraft {
  const b = e.block
  const f = b?.fields ?? {}
  const l = b?.lists ?? {}
  const pillar = inferPillar(e)
  const format = FORMAT_OF_KIND[e.kind]
  const title = cut(e.kind === 'stories' ? `${e.code} · Stories: ${e.theme}` : `${e.code} · ${e.theme}`, 140)

  let caption = '', script = ''
  let reels = emptyReels()
  // Reel com cenas por tempo ("0-3s: ...") ou lista de cenas sugeridas
  const timed = (l.cenas_tempo ?? []).slice(0, 12).map((s) => {
    const m = /^(\d{1,2}\s?[-–]\s?\d{1,2}\s?s)\s*:\s*(.*)$/i.exec(s)
    return m ? { time: m[1].replace(/\s/g, ''), text: m[2] } : { time: '', text: s }
  })
  if (e.kind === 'reel') {
    const scenes = (l.cenas ?? []).slice(0, 12)
    reels = {
      hook: cut(f.hook ?? timed[0]?.text ?? '', 400),
      cta: cut(f.cta ?? '', 300),
      scenes: timed.length ? timed.map((t, i) => ({ time: t.time || `Cena ${i + 1}`, scene: cut(t.text, 400), speech: '', onscreen: '' }))
        : scenes.length ? scenes.map((s, i) => ({ time: `Cena ${i + 1}`, scene: cut(s, 400), speech: '', onscreen: '' })) : REELS_TEMPLATE_TIMES.map((time) => ({ time, scene: '', speech: '', onscreen: '' })),
    }
    script = f.fala ?? timed.map((t) => (t.time ? `${t.time}: ${t.text}` : t.text)).join('\n')
    caption = f.legenda ?? ''
  } else if (e.kind === 'stories') {
    script = joinLines((l.frames ?? []).join('\n'), f.regra && `\nRegra fixa do dia: ${f.regra}`)
  } else if (e.kind === 'carrossel') {
    caption = f.legenda ?? ''
    script = joinLines(Boolean(l.slides?.length) && `Roteiro slide a slide:\n${l.slides.join('\n')}`, f.direcao && `\nDireção visual: ${f.direcao}`, f.arte && `Orientação de arte: ${f.arte}`, f.cta && `CTA: ${f.cta}`)
  } else {
    caption = f.legenda ?? ''
    script = joinLines(f.gancho && `Gancho: ${f.gancho}`, f.direcao && `Direção visual: ${f.direcao}`, f.cta && `CTA: ${f.cta}`)
  }
  caption = cut(caption, 5000)
  script = cut(script, 8000)

  // tarefas (checklist do cartão): captar, produzir, stories de apoio e conferências
  const tasks: string[] = []
  for (const c of l.captacao ?? []) tasks.push(`Captar: ${c}`)
  if (e.kind === 'reel') for (const s of timed.length ? timed.map((t) => (t.time ? `${t.time} ${t.text}` : t.text)) : (l.cenas ?? []).slice(0, 12)) tasks.push(`Gravar: ${s}`)
  for (const fr of l.frames ?? []) tasks.push(fr)
  if (e.kind === 'stories') { if (e.times.length > 1) tasks.push(`Publicar nos horários: ${e.timesText}`) }
  else tasks.push(e.kind === 'reel' ? 'Edição final do vídeo (com legenda na tela)' : e.kind === 'carrossel' ? 'Montar os slides na arte' : 'Arte final do feed')
  if (e.kind !== 'stories') tasks.push('Revisar texto e legenda')
  // "Produção:" do briefing: cada frase é uma instrução de produção
  for (const s of (f.producao ?? '').split(/(?<=[.!?])\s+/).map(clean).filter((x) => x.length > 8).slice(0, 6)) tasks.push(`Produção: ${s}`)
  if (/whatsapp/.test(norm(`${f.obs_operacional ?? ''} ${f.cta ?? ''}`))) tasks.push('Conferir o WhatsApp na arte, na legenda ou na tela final')
  const apoio = l.stories_apoio ?? []
  for (const s of apoio) tasks.push(/^story\s?\d/i.test(s) ? `Story de apoio — ${s}` : `Story de apoio: ${s}`)
  if (!apoio.length && e.support && e.kind !== 'stories') tasks.push(`Stories de apoio: ${e.support}`)

  const ad = checkAdvertising(`${title}\n${caption}\n${script}\n${reels.hook}\n${reels.cta}`, { pillar })
  const adIssues = ad.issues.filter((i) => i.level !== 'lembrete').length
  const asksPharma = /revisao (do )?farmaceutic|responsavel tecnico|revisao tecnica/.test(norm(f.producao ?? ''))
  if (pillar === 'medicamentos' || adIssues || asksPharma) tasks.push('Revisão farmacêutica antes de aprovar')
  if (adIssues) tasks.push(`Conferir ${adIssues} ponto(s) da RDC 96/2008 apontados pelo sistema`)

  const checklist = [...new Set(tasks.map((t) => cut(clean(t), 200)).filter(Boolean))].slice(0, 30)
  const comment = cut(joinLines(
    `Importado do plano “${opts.fileName}” — peça ${e.code}.`,
    `No plano: ${fmtBR(e.date)}${e.weekdayText ? ` (${e.weekdayText})` : ''}${e.timesText ? ` · ${e.timesText}` : ''}${e.formatText ? ` · ${e.formatText}` : ''}`,
    f.objetivo && `Objetivo: ${f.objetivo}`,
    f.por_que && `Por que testar: ${f.por_que}`,
    (f.pilar || f.tipo) && `Pilar/tipo no plano: ${f.pilar ?? f.tipo}`,
    f.gancho && `Gancho criativo: ${f.gancho}`,
    f.direcao && `Direção visual: ${f.direcao}`,
    f.cta && `CTA final: ${f.cta}`,
    e.support && `Stories de apoio (calendário): ${e.support}`,
    f.obs_estrategica && `Observação estratégica: ${f.obs_estrategica}`,
    f.obs_operacional && `Observação operacional: ${f.obs_operacional}`,
    f.producao && `Produção: ${f.producao}`,
    f.medir && `Medir: ${f.medir}`,
  ), 4000)

  const lead = e.kind === 'stories' ? Math.min(opts.leadDays, 1) : opts.leadDays
  return {
    index: e.index, code: e.code, title, post_date: e.date, post_time: e.times[0] ?? null, format, pillar, caption, script, reels,
    stage: opts.initialStage === 'auto' ? (b ? 'briefing' : 'ideia') : opts.initialStage,
    due_at: addDays(e.date, -lead),
    checklist, comment,
    ad: { medicine: ad.appliesToMedicine, issues: adIssues },
  }
}

export const buildDrafts = (plan: ParsedPlan, opts: DraftOptions): PostDraft[] => plan.entries.map((e) => buildDraft(e, opts))
export const normalizeTitle = (s: string): string => norm(s).replace(/[^a-z0-9]+/g, ' ').trim()

// ---------- prévia ----------
export type PlanPreviewRow = {
  index: number
  code: string
  date: string
  weekday: string
  dayNumber: number | null
  timesText: string
  formatText: string
  kind: PlanKind
  theme: string
  pillar: Pillar
  stage: 'ideia' | 'briefing'
  tasks: number
  adIssues: number
  medicine: boolean
  hasBrief: boolean
  past: boolean
  duplicate: boolean
  sameDay: number
  notes: string[]
  checked: boolean
}

/** Uma linha por peça com o que a pessoa precisa ver para decidir. Vêm marcadas as peças futuras que ainda não existem no calendário. */
export function buildPreviewRows(plan: ParsedPlan, existing: { post_date: string; title: string; format: string }[], today: string, opts: DraftOptions): PlanPreviewRow[] {
  const have = new Set(existing.map((x) => `${x.post_date}|${normalizeTitle(x.title)}`))
  const perDay = new Map<string, number>()
  for (const x of existing) perDay.set(`${x.post_date}|${x.format}`, (perDay.get(`${x.post_date}|${x.format}`) ?? 0) + 1)
  return plan.entries.map((e) => {
    const d = buildDraft(e, opts)
    const duplicate = have.has(`${d.post_date}|${normalizeTitle(d.title)}`)
    const past = e.date < today
    const notes = plan.warnings.filter((w) => w.entry === e.index && w.level !== 'info').map((w) => w.message)
    return {
      index: e.index, code: e.code, date: e.date, weekday: weekdayOf(e.date), dayNumber: e.dayNumber, timesText: e.timesText, formatText: e.formatText, kind: e.kind,
      theme: e.theme, pillar: d.pillar, stage: d.stage, tasks: d.checklist.length, adIssues: d.ad.issues, medicine: d.ad.medicine, hasBrief: e.block !== null,
      past, duplicate, sameDay: perDay.get(`${d.post_date}|${d.format}`) ?? 0, notes, checked: !past && !duplicate,
    }
  })
}
