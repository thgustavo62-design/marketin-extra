'use client'

import { useRouter } from 'next/navigation'
import { MONTH_NAMES } from '@/lib/domain'

// Seletor de mês/ano (como no dashboard do Grupo Extra). Navega com ?m=AAAA-MM.
export function MonthSelect({ value }: { value: string }) {
  const router = useRouter()
  const [year, month] = value.split('-').map(Number)
  const go = (y: number, m: number) => router.push(`?m=${y}-${String(m).padStart(2, '0')}`)
  const years = [year - 1, year, year + 1]
  return (
    <div className="head-tools">
      <select aria-label="Mês" value={month} onChange={(e) => go(year, Number(e.target.value))}>
        {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n.charAt(0).toUpperCase() + n.slice(1, 3)}</option>)}
      </select>
      <select aria-label="Ano" value={year} onChange={(e) => go(Number(e.target.value), month)}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
