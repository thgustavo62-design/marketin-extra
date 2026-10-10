import type { Block } from '@/lib/reports/blocks'

// Prévia HTML do relatório: renderiza os mesmos blocos do PDF e do CSV.
export function ReportView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="report">
      {blocks.map((b, i) => {
        if (b.kind === 'h2') return <h2 key={i} className="eyebrow report-h">{b.text}</h2>
        if (b.kind === 'kv') return <dl key={i} className="report-kv">{b.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        if (b.kind === 'list') return <section key={i}>{b.title && <h3>{b.title}</h3>}<ul>{b.items.map((t) => <li key={t}>{t}</li>)}</ul></section>
        if (b.kind === 'note') return <p key={i} className="muted report-note">{b.text}</p>
        return (
          <section key={i} className="report-table">
            <h3>{b.title}</h3>
            {b.rows.length === 0 ? <p className="muted">Sem registros.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr>{b.columns.map((c) => <th key={c.title} className={c.align === 'right' ? 'num' : undefined}>{c.title}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((cell, j) => <td key={j} className={b.columns[j].align === 'right' ? 'num' : undefined}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {b.note && <p className="muted report-note">{b.note}</p>}
          </section>
        )
      })}
    </div>
  )
}
