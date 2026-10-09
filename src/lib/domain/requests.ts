// Solicitações de peças: quem pede briefing → o time de marketing aceita e converte em conteúdo.
import type { Format } from './labels.ts'

export const REQUEST_TYPES = { arte: 'Arte', carrossel: 'Carrossel', reels: 'Reels', story: 'Story', video: 'Vídeo', outro: 'Outro' } as const
export const REQUEST_STATUS = {
  recebida: 'Recebida', precisa_info: 'Precisa de informação', aceita: 'Aceita', em_producao: 'Em produção', concluida: 'Concluída', cancelada: 'Cancelada',
} as const
export type RequestType = keyof typeof REQUEST_TYPES
export type RequestStatus = keyof typeof REQUEST_STATUS

export const isRequestType = (v: unknown): v is RequestType => typeof v === 'string' && Object.hasOwn(REQUEST_TYPES, v)
export const isRequestStatus = (v: unknown): v is RequestStatus => typeof v === 'string' && Object.hasOwn(REQUEST_STATUS, v)
export const isRequestOpen = (s: RequestStatus): boolean => s !== 'concluida' && s !== 'cancelada'

// Formato do conteúdo gerado a partir do tipo pedido.
export const FORMAT_BY_TYPE: Record<RequestType, Format> = { arte: 'feed', carrossel: 'carrossel', reels: 'reels', story: 'feed', video: 'reels', outro: 'feed' }

export type OfferInfo = { offer_item: string | null; offer_price: number | null; offer_valid_until: string | null; info_confirmed_at: string | null }

// Pedido de oferta: preço e validade precisam estar preenchidos, dentro da validade e confirmados por uma pessoa.
// Nada de reaproveitar preço de campanha antiga sem confirmar de novo.
export function offerBlockedReason(o: OfferInfo, today: string): string | null {
  if (!o.offer_item) return null
  if (o.offer_price === null) return 'Informe o preço da oferta antes de converter.'
  if (!o.offer_valid_until) return 'Informe até quando a oferta vale antes de converter.'
  if (o.offer_valid_until < today) return `A oferta venceu em ${o.offer_valid_until.split('-').reverse().join('/')}. Atualize a validade e confirme de novo.`
  if (!o.info_confirmed_at) return 'Confirme que preço e validade estão corretos antes de converter.'
  return null
}

export function convertBlockedReason(r: OfferInfo & { status: RequestStatus; linked_post_id: string | null }, today: string): string | null {
  if (r.linked_post_id) return 'Esta solicitação já virou um conteúdo.'
  if (r.status === 'cancelada') return 'Solicitação cancelada não pode ser convertida.'
  if (r.status === 'concluida') return 'Solicitação já concluída.'
  if (r.status === 'precisa_info') return 'Aguardando informação do solicitante. Aceite a solicitação quando estiver completa.'
  return offerBlockedReason(r, today)
}

// Transições manuais permitidas (a conversão em conteúdo é um caminho à parte).
const NEXT: Record<RequestStatus, RequestStatus[]> = {
  recebida: ['precisa_info', 'aceita', 'cancelada'],
  precisa_info: ['recebida', 'aceita', 'cancelada'],
  aceita: ['precisa_info', 'em_producao', 'cancelada'],
  em_producao: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: ['recebida'],
}
export const canMoveRequest = (from: RequestStatus, to: RequestStatus): boolean => NEXT[from].includes(to)
export const nextRequestStatuses = (from: RequestStatus): RequestStatus[] => NEXT[from]
