import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { LineChart } from './line-chart'
import { compact, formatVariation } from '@/lib/insights/calc'

// Cartão de indicador no estilo do Insights da Meta: total, variação contra o período anterior e gráfico diário.
export function MetricCard({
  title, hint, value, prevValue, variation, series, split, goodWhen = 'up', format = compact, color,
}: {
  title: string
  hint?: string
  value: number
  prevValue?: number
  variation: number | null
  series: { date: string; value: number }[]
  split?: { label: string; value: string }[]
  goodWhen?: 'up' | 'down'
  format?: (n: number) => string
  color?: string
}) {
  const tone = variation === null || variation === 0 ? 'flat' : (variation > 0) === (goodWhen === 'up') ? 'good' : 'bad'
  const Icon = variation === 0 ? Minus : variation !== null && variation > 0 ? ArrowUp : ArrowDown
  return (
    <article className="mcard">
      <header>
        <h3>{title}</h3>
        {hint && <span className="hint" title={hint}>i</span>}
      </header>
      <div className="mcard-main">
        <strong>{format(value)}</strong>
        <span className={`var ${tone}`} title={prevValue !== undefined ? `Período anterior: ${format(prevValue)}` : undefined}>
          {variation !== null && <Icon size={13} aria-hidden />} {formatVariation(variation)}
        </span>
        {split && (
          <ul className="split">
            {split.map((s) => <li key={s.label}><span>{s.value}</span> {s.label}</li>)}
          </ul>
        )}
      </div>
      <LineChart points={series} label={`${title}: evolução diária`} color={color} />
    </article>
  )
}
