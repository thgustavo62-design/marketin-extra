import { compact, shortDate, tickIndexes } from '@/lib/insights/calc'

// Gráfico de linha em SVG puro (renderizado no servidor, sem biblioteca): leve e acessível.
export function LineChart({ points, color = '#4cb6ee', label }: { points: { date: string; value: number }[]; color?: string; label: string }) {
  const W = 560, H = 150, L = 38, R = 8, T = 8, B = 22
  const max = Math.max(1, ...points.map((p) => p.value))
  const niceMax = (() => { const e = 10 ** Math.floor(Math.log10(max)); const m = max / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e })()
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - L - R))
  const y = (v: number) => T + (1 - v / niceMax) * (H - T - B)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = points.length ? `${path} L${x(points.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z` : ''
  // valores pequenos: só 0 e o máximo (evita rótulos repetidos como "1, 1")
  const ticks = niceMax < 4 ? [0, niceMax] : [0, niceMax / 2, niceMax]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="linechart" preserveAspectRatio="none">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e6ebf2" strokeWidth="1" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="9.5" fill="#6b7a8c">{compact(t)}</text>
        </g>
      ))}
      {area && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {tickIndexes(points.length).map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="9.5" fill="#6b7a8c">{shortDate(points[i].date)}</text>
      ))}
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.value)} r="6" fill="transparent">
          <title>{`${shortDate(p.date)}: ${p.value.toLocaleString('pt-BR')}`}</title>
        </circle>
      ))}
    </svg>
  )
}
