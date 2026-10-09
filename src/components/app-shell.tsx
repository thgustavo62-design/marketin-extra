'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart3, BookOpen, CalendarDays, Camera, ChevronLeft, ChevronRight, Clapperboard, FileText, LayoutDashboard,
  LogOut, Megaphone, Menu, Plug, ScrollText, Sparkles, Store, Target, UserCog, Users, X,
  type LucideIcon,
} from 'lucide-react'

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; admin?: boolean }
type Group = { title: string; items: Item[] }

const GROUPS: Group[] = [
  { title: 'Principal', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }] },
  {
    title: 'Planejamento',
    items: [
      { href: '/planejamento/calendario', label: 'Calendário', icon: CalendarDays },
      { href: '/planejamento/conteudos', label: 'Conteúdos', icon: FileText },
      { href: '/planejamento/reels', label: 'Estúdio de Reels', icon: Clapperboard },
      { href: '/planejamento/gerar', label: 'Gerar semana', icon: Sparkles },
      { href: '/campanhas', label: 'Campanhas', icon: Megaphone },
    ],
  },
  {
    title: 'Resultados',
    items: [
      { href: '/resultados', label: 'Por publicação', icon: BarChart3, exact: true },
      { href: '/resultados/instagram', label: 'Instagram', icon: Camera },
      { href: '/resultados/meta-ads', label: 'Meta Ads', icon: Target },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/gestao/base', label: 'Base de informações', icon: BookOpen },
      { href: '/gestao/unidades', label: 'Unidades', icon: Store },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { href: '/configuracoes/usuarios', label: 'Usuários', icon: Users, admin: true },
      { href: '/configuracoes/integracoes', label: 'Integrações', icon: Plug, admin: true },
      { href: '/configuracoes/auditoria', label: 'Auditoria', icon: ScrollText, admin: true },
      { href: '/configuracoes/conta', label: 'Minha conta', icon: UserCog },
    ],
  },
]

const STORE_KEY = 'extra_sidebar_collapsed'

export function AppShell({
  user, logout, topbar, readOnly, children,
}: {
  user: { displayName: string; username: string; role: string; roleLabel: string }
  logout: () => Promise<void>
  topbar: React.ReactNode
  readOnly: boolean
  children: React.ReactNode
}) {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORE_KEY) === '1') } catch { /* sem storage: segue expandido */ }
  }, [])
  useEffect(() => setOpen(false), [path])

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(STORE_KEY, c ? '0' : '1') } catch { /* ignora */ }
      return !c
    })
  }
  const isActive = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + '/'))

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
      <aside className="sidebar" aria-label="Menu lateral">
        <div className="side-head">
          <div className="side-logo"><img src="/brand/extra-e.png" alt="" /></div>
          <div className="side-title">
            <b>EXTRA MARKETING</b>
            <small>Central de conteúdo</small>
          </div>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => !i.admin || user.role === 'admin')
            if (!items.length) return null
            return (
              <div key={g.title}>
                <div className="nav-group">{g.title}</div>
                {items.map((i) => {
                  const Icon = i.icon
                  const active = isActive(i)
                  return (
                    <Link key={i.href} href={i.href} className={`nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={i.label}>
                      <Icon size={18} aria-hidden />
                      <span>{i.label}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="user-card">
          <div className="avatar" aria-hidden>{user.displayName.charAt(0).toUpperCase()}</div>
          <div className="user-info">
            <b>{user.displayName}</b>
            <small>{user.roleLabel}</small>
          </div>
          <form action={logout}>
            <button type="submit" className="ghost" aria-label="Sair" title="Sair"><LogOut size={18} /></button>
          </form>
        </div>

        <button type="button" className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      <div className="main">
        <div className="topbar">
          <button type="button" className="btn menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Fechar menu' : 'Abrir menu'}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="spacer" />
          {topbar}
        </div>
        <main className="content" data-readonly={readOnly ? 'true' : undefined}>{children}</main>
      </div>
    </div>
  )
}
