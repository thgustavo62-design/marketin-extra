// CSV do relatório: cabeçalho com filial, período, filtros e fonte; depois cada tabela como uma seção. Célula "N/D" quando o dado não existe.
import { csvEscape } from '../domain/index.ts'
import { LEGEND, headerRows, reportTitle, snapshotToBlocks } from './blocks.ts'
import type { ReportSnapshot } from './build.ts'

export function reportToCsv(s: ReportSnapshot): string {
  const rows: unknown[][] = [[reportTitle(s)], ...headerRows(s), ['Fonte', 'Extra Marketing (conteúdos e publicações) e Windsor/Meta (coletas guardadas)'], ['Legenda', LEGEND], []]
  // o primeiro bloco é o cabeçalho (já escrito acima)
  for (const b of snapshotToBlocks(s).slice(1)) {
    if (b.kind === 'h2') rows.push([b.text])
    else if (b.kind === 'kv') { for (const [k, v] of b.rows) rows.push([k, v]); rows.push([]) }
    else if (b.kind === 'table') {
      rows.push([b.title], b.columns.map((c) => c.title), ...b.rows)
      if (b.note) rows.push([b.note])
      rows.push([])
    } else if (b.kind === 'list') {
      if (b.title) rows.push([b.title])
      for (const it of b.items) rows.push([it])
      rows.push([])
    } else rows.push([b.text])
  }
  // BOM + separador ";" (Excel pt-BR), como o resto das exportações
  return '﻿' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n') + '\r\n'
}
