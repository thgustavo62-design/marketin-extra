'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Visão geral' },
  { href: '/calendario', label: 'Calendário' },
  { href: '/conteudos', label: 'Conteúdos' },
  { href: '/reels', label: 'Reels' },
  { href: '/campanhas', label: 'Campanhas' },
  { href: '/base', label: 'Base de informações' },
  { href: '/unidades', label: 'Unidades' },
  { href: '/resultados', label: 'Resultados' },
  { href: '/gerar', label: 'Gerar semana' },
  { href: '/fontes', label: 'Fontes' },
  { href: '/conta', label: 'Conta e senha' },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav aria-label="Principal">
      {ITEMS.map((i) => {
        const active = i.href === '/' ? path === '/' : path.startsWith(i.href)
        return (
          <Link key={i.href} href={i.href} className={`nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}
