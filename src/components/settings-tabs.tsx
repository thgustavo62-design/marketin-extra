'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Abas da área de Configurações (pílulas; a ativa em azul-claro, como no sistema do Grupo Extra).
export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname()
  return (
    <nav className="stabs" aria-label="Configurações">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`stab${path === t.href || path.startsWith(t.href + '/') ? ' active' : ''}`} aria-current={path === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
