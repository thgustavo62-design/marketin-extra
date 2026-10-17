// Artes fixas do tema: tipos de arte e rótulos (puro).
export const ART_KINDS = [
  { id: 'fundo', label: 'Fundo' },
  { id: 'boneco', label: 'Boneco / mascote' },
  { id: 'logo', label: 'Logo' },
  { id: 'selo', label: 'Selo / adesivo' },
  { id: 'outro', label: 'Outro' },
] as const
export type ArtKind = (typeof ART_KINDS)[number]['id']
export const isArtKind = (v: unknown): v is ArtKind => typeof v === 'string' && ART_KINDS.some((k) => k.id === v)
export const artKindLabel = (id: string): string => ART_KINDS.find((k) => k.id === id)?.label ?? 'Outro'
export const MAX_THEME_ARTS = 60
export const MAX_FIXED_PER_FORMAT = 20

export const SHOW_LABEL = { all: 'Em todas as peças', first: 'Só na primeira peça', last: 'Só na última peça', notfirst: 'Em todas, menos a primeira' } as const
