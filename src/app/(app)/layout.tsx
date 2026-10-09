import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { requireUser } from '@/lib/auth'
import { logoutAction } from './actions'

const SOON = ['Planejamento', 'Conteúdo', 'Calendário', 'Mídia', 'Relatórios']

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark tone="white" size="sm" />
        <nav aria-label="Principal">
          <Link href="/" className="nav-item">Visão geral</Link>
          {SOON.map((n) => (
            <span key={n} className="nav-item disabled" aria-disabled="true">
              {n} <small>em breve</small>
            </span>
          ))}
          <Link href="/conta" className="nav-item">Conta e senha</Link>
        </nav>
        <div className="sidebar-foot">
          <span className="who">{user.username}</span>
          <form action={logoutAction}>
            <button type="submit" className="ghost">Sair</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
