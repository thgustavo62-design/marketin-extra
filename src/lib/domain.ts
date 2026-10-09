// Regras de negócio puras (sem Next, sem banco): testáveis com `npm test`.
// Datas sempre como string ISO "YYYY-MM-DD" para evitar problemas de fuso.

export const FORMATS = { feed: 'Feed', carrossel: 'Carrossel', reels: 'Reels' } as const
export const PILLARS = {
  institucional: 'Institucional',
  campanha: 'Campanha',
  bastidores: 'Bastidores',
  servicos: 'Serviços',
  educacao: 'Educação',
  medicamentos: 'Medicamentos',
  relacionamento: 'Relacionamento',
} as const
export const STAGES = {
  rascunho: 'Rascunho',
  producao: 'Em produção',
  revisao: 'Em revisão',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
} as const
export const KNOWLEDGE_KINDS = {
  posicionamento: 'Posicionamento',
  publico: 'Público',
  tom_de_voz: 'Tom de voz',
  identidade_visual: 'Identidade visual',
  contatos: 'Contatos',
  horarios: 'Horários',
  servicos: 'Serviços',
  campanhas_recorrentes: 'Campanhas recorrentes',
  fidelidade: 'Condições de fidelidade',
  termos_evitar: 'Termos a evitar',
} as const

export type Format = keyof typeof FORMATS
export type Pillar = keyof typeof PILLARS
export type Stage = keyof typeof STAGES
export type KnowledgeKind = keyof typeof KNOWLEDGE_KINDS

export const STAGE_ORDER = Object.keys(STAGES) as Stage[]

export const isFormat = (v: unknown): v is Format => typeof v === 'string' && v in FORMATS
export const isPillar = (v: unknown): v is Pillar => typeof v === 'string' && v in PILLARS
export const isStage = (v: unknown): v is Stage => typeof v === 'string' && v in STAGES
export const isKind = (v: unknown): v is KnowledgeKind => typeof v === 'string' && v in KNOWLEDGE_KINDS

// ---------- datas ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function todayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function parseMonth(v: string | undefined, fallback: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? '')
  const src = m ? v! : fallback.slice(0, 7)
  const [y, mo] = src.split('-').map(Number)
  return mo >= 1 && mo <= 12 ? { year: y, month: mo } : parseMonth(undefined, fallback)
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export type Cell = { iso: string; day: number; inMonth: boolean }

// Semanas começando na segunda-feira.
export function monthGrid(year: number, month: number): Cell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const total = Math.ceil((offset + daysInMonth) / 7) * 7
  const start = first.toISOString().slice(0, 10)
  const cells: Cell[] = []
  for (let i = 0; i < total; i++) {
    const iso = addDays(start, i - offset)
    cells.push({ iso, day: Number(iso.slice(8)), inMonth: iso.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}` })
  }
  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function formatBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

// ---------- resultados ----------
// (salvamentos + compartilhamentos) / alcance × 100; sem alcance → null (exibir "—").
export function actionRate(reach: number | null, saves: number | null, shares: number | null): number | null {
  if (!reach || reach <= 0) return null
  return ((saves ?? 0) + (shares ?? 0)) / reach * 100
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1).replace('.', ',')}%`
}

// ---------- validade ----------
export const isExpired = (validUntil: string | null, today: string): boolean => !!validUntil && validUntil < today

export function campaignCoversPeriod(c: { starts_on: string; ends_on: string }, from: string, to: string): boolean {
  return c.starts_on <= from && c.ends_on >= to
}

// Conteúdo de medicamentos só avança com a revisão farmacêutica marcada.
export function stageBlockedReason(pillar: Pillar, stage: Stage, pharmaReview: boolean): string | null {
  if (pillar === 'medicamentos' && (stage === 'aprovado' || stage === 'publicado') && !pharmaReview) {
    return 'Conteúdo sobre medicamentos precisa da revisão farmacêutica marcada antes de ser aprovado ou publicado.'
  }
  return null
}

// ---------- CSV ----------
export function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n' // BOM: Excel abre com acentos corretos
}

// ---------- Reels ----------
export type ReelsScene = { time: string; scene: string; speech: string; onscreen: string }
export type ReelsScript = { hook: string; scenes: ReelsScene[]; cta: string }

export const REELS_TEMPLATE_TIMES = ['0–3 s', '3–12 s', '12–22 s', '22–30 s']

export function emptyReels(): ReelsScript {
  return {
    hook: '',
    scenes: REELS_TEMPLATE_TIMES.map((time) => ({ time, scene: '', speech: '', onscreen: '' })),
    cta: '',
  }
}

export function normalizeReels(raw: unknown): ReelsScript {
  const base = emptyReels()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<ReelsScript>
  return {
    hook: typeof r.hook === 'string' ? r.hook : '',
    cta: typeof r.cta === 'string' ? r.cta : '',
    scenes: Array.isArray(r.scenes) && r.scenes.length
      ? r.scenes.map((s, i) => ({
          time: String(s?.time ?? REELS_TEMPLATE_TIMES[i] ?? ''),
          scene: String(s?.scene ?? ''),
          speech: String(s?.speech ?? ''),
          onscreen: String(s?.onscreen ?? ''),
        }))
      : base.scenes,
  }
}

// ---------- gerador semanal ----------
export type Draft = {
  title: string
  post_date: string
  format: Format
  pillar: Pillar
  caption: string
  script: string
  reels: ReelsScript
  origin: string
  campaign_id: string | null
}

type Campaign = { id: string; name: string; starts_on: string; ends_on: string }

function reelsFor(hook: string, scenes: [string, string, string, string], cta: string): ReelsScript {
  return {
    hook,
    cta,
    scenes: scenes.map((scene, i) => ({ time: REELS_TEMPLATE_TIMES[i], scene, speech: '', onscreen: '' })),
  }
}

// Modelos editoriais. Tudo entre [colchetes] precisa ser preenchido e revisado:
// o gerador nunca inventa preço, desconto, serviço ou contato.
function institutionalTemplates(brand: string): Omit<Draft, 'post_date' | 'campaign_id'>[] {
  return [
    {
      title: `Quem cuida de você na ${brand}`,
      format: 'carrossel',
      pillar: 'institucional',
      caption: `Por trás do balcão da ${brand} tem gente que conhece você pelo nome.\n\nConheça [nome e função de quem aparece] e o que essa pessoa faz no dia a dia da loja.\n\n[Chamada: como falar com a loja]`,
      script: 'Slide 1: título com a pergunta "Quem atende você?". Slides 2–4: uma pessoa da equipe por slide, foto real (com autorização de imagem), nome e função. Último slide: como falar com a loja.',
      reels: emptyReels(),
      origin: 'Modelo institucional — apresentação da equipe. Preencher os nomes e confirmar autorização de imagem.',
    },
    {
      title: 'Bastidores do atendimento',
      format: 'reels',
      pillar: 'bastidores',
      caption: `Um dia na ${brand}, do ponto de vista de quem atende.\n\n[Uma frase sobre o que o vídeo mostra]`,
      script: 'Gravar na loja, com a equipe real e luz natural. Sem trilha comercial genérica.',
      reels: reelsFor(
        '[Pergunta ou situação que o cliente reconhece]',
        ['Cenas reais da abertura ou do balcão', 'Uma cena do atendimento acontecendo', '[Informação principal do vídeo — serviço confirmado]', 'Pessoa da equipe convidando para a loja'],
        '[Próximo passo: ir à loja ou chamar no WhatsApp]',
      ),
      origin: 'Modelo institucional — bastidores. Confirmar autorização de imagem de quem aparece.',
    },
    {
      title: 'Dúvida frequente respondida',
      format: 'carrossel',
      pillar: 'educacao',
      caption: `Uma dúvida que chega toda semana no balcão da ${brand}: [pergunta].\n\n[Resposta curta, revisada pelo farmacêutico responsável]\n\nEm caso de dúvida, procure um farmacêutico.`,
      script: 'Slide 1: a pergunta. Slides 2–4: resposta em passos curtos. Último slide: "Fale com um farmacêutico". Não citar medicamento com prescrição.',
      reels: emptyReels(),
      origin: 'Modelo educativo — dúvida frequente. Texto precisa de revisão farmacêutica antes de aprovar.',
    },
    {
      title: 'Como falar com a gente',
      format: 'reels',
      pillar: 'servicos',
      caption: `Facilitamos o seu contato com a ${brand}.\n\n[Canais e horários confirmados — não copiar de outra loja]`,
      script: 'Mostrar na prática o caminho: abrir o WhatsApp, enviar mensagem, receber a resposta.',
      reels: reelsFor(
        '[Pergunta: "Precisa de algo e não sabe como pedir?"]',
        ['Tela do celular abrindo a conversa', 'Cliente enviando a mensagem', '[Canais confirmados: WhatsApp, telefone, endereço]', 'Equipe respondendo'],
        '[Salvar o contato / chamar agora]',
      ),
      origin: 'Modelo de serviços — canais de contato. Preencher só com dados confirmados da unidade.',
    },
  ]
}

function campaignTemplates(brand: string, name: string): Omit<Draft, 'post_date' | 'campaign_id'>[] {
  return [
    {
      title: `${name}: o que está valendo`,
      format: 'carrossel',
      pillar: 'campanha',
      caption: `${name} na ${brand}.\n\n[Produtos e condições confirmados no briefing]\n\nVálido [período e unidades participantes].`,
      script: 'Slide 1: nome da campanha. Slides 2–4: um item ou condição por slide, com preço só se estiver confirmado. Último slide: validade e unidades.',
      reels: emptyReels(),
      origin: `Modelo de campanha — ${name}. Conferir produtos, preços e validade no briefing antes de aprovar.`,
    },
    {
      title: `${name} em 30 segundos`,
      format: 'reels',
      pillar: 'campanha',
      caption: `${name}: veja como aproveitar na ${brand}.\n\n[Condição principal confirmada]`,
      script: 'Mostrar os produtos reais na loja. Evitar promessas além do briefing.',
      reels: reelsFor(
        `[Gancho com a vantagem principal de ${name}]`,
        ['Cena real da loja com a campanha', 'Produtos em destaque', '[Condição, validade e unidades participantes]', 'Equipe convidando'],
        '[Chamada: vir à loja / chamar no WhatsApp]',
      ),
      origin: `Modelo de campanha — ${name}. Preencher só com condições confirmadas.`,
    },
    {
      title: `Como aproveitar ${name}`,
      format: 'carrossel',
      pillar: 'relacionamento',
      caption: `Passo a passo para aproveitar ${name} na ${brand}.\n\n[Regras de participação confirmadas]`,
      script: 'Slides em passos numerados: 1) como participar, 2) o que vale, 3) até quando. Sem regra inventada.',
      reels: emptyReels(),
      origin: `Modelo de relacionamento — ${name}. Regras de participação precisam estar no briefing.`,
    },
    {
      title: `Última chamada: ${name}`,
      format: 'reels',
      pillar: 'campanha',
      caption: `Últimos dias de ${name} na ${brand}.\n\n[Data final confirmada]`,
      script: 'Só publicar se a campanha ainda estiver vigente na data do post.',
      reels: reelsFor(
        '[Aviso de que está acabando — com a data real]',
        ['Cena da loja', '[Item mais procurado da campanha]', '[Validade e unidades]', 'Equipe convidando'],
        '[Chamada para aproveitar antes de acabar]',
      ),
      origin: `Modelo de campanha — ${name}. Conferir se a data do post está dentro da validade.`,
    },
  ]
}

const OFFSETS = [0, 2, 4, 6]

export type GenerateResult = { drafts: Draft[]; skipped: string[]; error?: string }

// Quatro rascunhos em sete dias (dias +0, +2, +4, +6): dois carrosséis e dois Reels.
export function generateWeek(opts: {
  brandName: string
  startDate: string
  campaign: Campaign | null
  existing: { post_date: string; title: string }[]
}): GenerateResult {
  const { brandName, startDate, campaign, existing } = opts
  const endDate = addDays(startDate, 6)
  if (campaign && !campaignCoversPeriod(campaign, startDate, endDate)) {
    return {
      drafts: [],
      skipped: [],
      error: `A campanha "${campaign.name}" vale de ${formatBR(campaign.starts_on)} a ${formatBR(campaign.ends_on)}; a semana (${formatBR(startDate)} a ${formatBR(endDate)}) precisa estar toda dentro da validade.`,
    }
  }
  const templates = campaign ? campaignTemplates(brandName, campaign.name) : institutionalTemplates(brandName)
  const taken = new Set(existing.map((e) => `${e.post_date}|${e.title.trim().toLowerCase()}`))
  const drafts: Draft[] = []
  const skipped: string[] = []
  templates.forEach((t, i) => {
    const post_date = addDays(startDate, OFFSETS[i])
    const key = `${post_date}|${t.title.trim().toLowerCase()}`
    if (taken.has(key)) {
      skipped.push(`${formatBR(post_date)} — ${t.title}`)
      return
    }
    taken.add(key)
    drafts.push({ ...t, post_date, campaign_id: campaign?.id ?? null })
  })
  return { drafts, skipped }
}
