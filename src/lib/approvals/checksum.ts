// Impressão digital do conteúdo: se qualquer parte relevante mudar, o hash muda e a aprovação deixa de valer.
import { createHash } from 'node:crypto'

export type AssetRef = { assetId: string; role: string; checksum: string | null; url: string | null }
export type ContentPayload = {
  title: string; caption: string; script: string; reels: unknown; origin: string; campaignId: string | null; assets: AssetRef[]
}

// JSON estável: chaves em ordem alfabética e anexos ordenados por id (a ordem de gravação não pode mudar o hash).
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
  }
  return v
}

export function canonicalContent(p: ContentPayload): string {
  return JSON.stringify(stable({ ...p, assets: [...p.assets].sort((a, b) => a.assetId.localeCompare(b.assetId)) }))
}

export const contentChecksum = (p: ContentPayload): string => createHash('sha256').update(canonicalContent(p)).digest('hex')
