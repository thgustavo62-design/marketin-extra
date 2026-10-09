// Rótulos, tipos e verificadores dos vocabulários fechados (formato, pilar, etapa, tipo de informação).
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
// Etapas do fluxo de produção (a ordem é a das colunas do quadro). `posts.stage` é a fonte única de status.
export const STAGES = {
  ideia: 'Ideia',
  briefing: 'Briefing',
  producao: 'Em produção',
  revisao: 'Em revisão',
  aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  agendado: 'Agendado',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
} as const
export const PRIORITIES = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' } as const
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
export type Priority = keyof typeof PRIORITIES
export type KnowledgeKind = keyof typeof KNOWLEDGE_KINDS

export const STAGE_ORDER = Object.keys(STAGES) as Stage[]
// Etapas em que o conteúdo ainda está em andamento (não terminou nem foi descartado).
export const CLOSED_STAGES: Stage[] = ['publicado', 'cancelado']
export const isOpenStage = (s: Stage): boolean => !CLOSED_STAGES.includes(s)

export const isFormat = (v: unknown): v is Format => typeof v === 'string' && Object.hasOwn(FORMATS, v)
export const isPillar = (v: unknown): v is Pillar => typeof v === 'string' && Object.hasOwn(PILLARS, v)
export const isStage = (v: unknown): v is Stage => typeof v === 'string' && Object.hasOwn(STAGES, v)
export const isPriority = (v: unknown): v is Priority => typeof v === 'string' && Object.hasOwn(PRIORITIES, v)
export const isKind = (v: unknown): v is KnowledgeKind => typeof v === 'string' && Object.hasOwn(KNOWLEDGE_KINDS, v)
