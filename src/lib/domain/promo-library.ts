// Biblioteca de imagens das promoções: categorias, nome e conferência de SVG (puro, testado).
export const LIBRARY_CATEGORIES = [
  { id: 'icone', label: 'Ícones' },
  { id: 'logo', label: 'Logos' },
  { id: 'selo', label: 'Selos e adesivos' },
  { id: 'fundo', label: 'Fundos' },
  { id: 'foto', label: 'Fotos' },
  { id: 'outro', label: 'Outros' },
] as const
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]['id']
export const MAX_LIBRARY_ITEMS = 500
export const MAX_LIBRARY_FILE_BYTES = 4 * 1024 * 1024

export const isLibraryCategory = (v: unknown): v is LibraryCategory => typeof v === 'string' && LIBRARY_CATEGORIES.some((c) => c.id === v)
export const categoryLabel = (id: string): string => LIBRARY_CATEGORIES.find((c) => c.id === id)?.label ?? 'Outros'

/** Nome da imagem: do arquivo, sem extensão, em uma linha e com no máximo 80 letras. */
export function libraryName(raw: string): string {
  const n = raw.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return n.length >= 1 ? n : 'Imagem'
}

/** Parece um SVG? (texto com a marca <svg). */
export function looksLikeSvg(buf: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, 2048)).replace(/^﻿/, '').trimStart()
  return /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)
}

/** SVG só entra se for autossuficiente: sem entidades, scripts nem referências a arquivos ou endereços externos (ele é rasterizado no servidor). */
export function svgIsSafe(buf: Uint8Array): boolean {
  const t = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (/<!ENTITY|<script|<foreignObject|<iframe|<use[^>]+href\s*=\s*["'](?!#)/i.test(t)) return false
  for (const m of t.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!/^(#|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(m[1].trim())) return false
  if (/url\(\s*["']?(?!#|data:)/i.test(t)) return false
  return true
}
