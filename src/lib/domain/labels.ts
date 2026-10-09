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
