import { Nav } from '@/components/nav'
import { Wordmark } from '@/components/wordmark'
import { requireUser } from '@/lib/auth'
import { logoutAction } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark tone="white" size="sm" />
        <Nav />
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
