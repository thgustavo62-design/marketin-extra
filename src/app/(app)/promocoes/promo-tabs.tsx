'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/promocoes', label: 'Promoções' },
  { href: '/promocoes/temas', label: 'Temas (artes)' },
  { href: '/promocoes/biblioteca', label: 'Biblioteca de imagens' },
]

/** Sub-abas da área de Promoções. "Promoções" fica ativa na lista e dentro de uma promoção; as outras, na própria página. */
export function PromoTabs() {
  const path = usePathname()
  const active = (href: string) => (href === '/promocoes' ? !path.startsWith('/promocoes/temas') && !path.startsWith('/promocoes/biblioteca') : path === href || path.startsWith(href + '/'))
  return (
    <nav className="stabs" aria-label="Promoções">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`stab${active(t.href) ? ' active' : ''}`} aria-current={active(t.href) ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  )
}
