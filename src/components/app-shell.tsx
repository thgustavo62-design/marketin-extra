'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart3, Bell, BookOpen, ClipboardCheck, Columns3, CalendarDays, Camera, ChevronLeft, ChevronRight, FileBarChart, FileText, FileUp, Flag, LayoutDashboard,
  FolderOpen, LayoutTemplate, Link2, PackageSearch, PenTool, Presentation, Sparkles, LogOut, Megaphone, Menu, Radar, Settings, Store, Target, X,
  type LucideIcon,
} from 'lucide-react'

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; admin?: boolean; /** só aparece para quem pode editar */ write?: boolean }
type Group = { title: string; items: Item[] }

const GROUPS: Group[] = [
  { title: 'Principal', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }, { href: '/alertas', label: 'Alertas', icon: Bell }] },
  {
    title: 'Planejamento',
    items: [
      { href: '/planejamento/calendario', label: 'Calendário', icon: CalendarDays },
      { href: '/planejamento/conteudos', label: 'Conteúdos', icon: FileText },
      { href: '/campanhas', label: 'Campanhas', icon: Megaphone, exact: true },
      { href: '/planejamento/importar-plano', label: 'Importar plano (PDF)', icon: FileUp, write: true },
    ],
  },
  { title: 'Criação', items: [{ href: '/criacao', label: 'Meus designs', icon: PenTool, exact: true }, { href: '/criacao/modelos', label: 'Modelos', icon: LayoutTemplate }] },
  {
    title: 'Produção',
    items: [
      { href: '/producao', label: 'Quadro de produção', icon: Columns3, exact: true },
      { href: '/producao/aprovacoes', label: 'Aprovações', icon: ClipboardCheck },
      { href: '/producao/biblioteca', label: 'Biblioteca de mídias', icon: FolderOpen },
      { href: '/produtos', label: 'Produtos', icon: PackageSearch },
      { href: '/promocoes', label: 'Promoções', icon: Sparkles },
    ],
  },
  {
    title: 'Resultados',
    items: [
      { href: '/resultados', label: 'Insights', icon: BarChart3, exact: true },
      { href: '/resultados/instagram', label: 'Instagram', icon: Camera },
      { href: '/resultados/meta-ads', label: 'Meta Ads', icon: Target },
      { href: '/resultados/vinculos', label: 'Publicações', icon: Link2 },
      { href: '/resultados/metas', label: 'Metas', icon: Flag },
      { href: '/resultados/relatorios', label: 'Relatórios', icon: FileBarChart },
      { href: '/resultados/apresentacoes', label: 'Apresentações', icon: Presentation },
      { href: '/inteligencia', label: 'Inteligência', icon: Radar },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      { href: '/gestao/base', label: 'Base de informações', icon: BookOpen },
      { href: '/gestao/unidades', label: 'Unidades', icon: Store },
    ],
  },
  { title: 'Sistema', items: [{ href: '/configuracoes', label: 'Configurações', icon: Settings }] },
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
            const items = g.items.filter((i) => (!i.admin || user.role === 'admin') && !(i.write && user.role === 'viewer'))
            if (!items.length) return null
            return (
              <div key={g.title}>
                <div className="nav-group">{g.title}</div>
                {items.map((i) => {
                  const Icon = i.icon
                  const active = isActive(i)
                  return (
                    <Link key={i.href} href={i.href === '/configuracoes' ? (user.role === 'admin' ? '/configuracoes/usuarios' : '/configuracoes/conta') : i.href} className={`nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={i.label}>
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
