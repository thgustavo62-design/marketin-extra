'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

const KEY = 'extra_dash_view'

// Troca só a apresentação (dados e permissões são os mesmos). Lembra a última escolha neste navegador — preferência não sensível.
export function DashViewTabs({ view, month }: { view: 'op' | 'exec'; month: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  useEffect(() => {
    try {
      if (sp.get('v')) localStorage.setItem(KEY, view)
      else if (localStorage.getItem(KEY) === 'exec') router.replace(`/?v=exec&m=${month}`)
    } catch { /* sem storage: segue na visão operacional */ }
  }, [view, sp, router, month])
  return (
    <nav className="tabs" aria-label="Visão do Dashboard">
      <Link href={`/?v=op&m=${month}`} className={`tab${view === 'op' ? ' active' : ''}`}>Operacional</Link>
      <Link href={`/?v=exec&m=${month}`} className={`tab${view === 'exec' ? ' active' : ''}`}>Executiva</Link>
    </nav>
  )
}
