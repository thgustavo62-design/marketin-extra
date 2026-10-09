// Exportação CSV (Excel pt-BR: separador ; e BOM).
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
