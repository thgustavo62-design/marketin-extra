import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export const metadata = { title: 'Console de edição — Extra Marketing' }

// Console de edição em tela cheia (abre em outra aba): sem o menu lateral, só com a sessão exigida.
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/login')
  if (user.mustChange) redirect('/configuracoes/conta?trocar=1')
  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <Link href="/promocoes" className="editor-brand">EXTRA MARKETING</Link>
        <span className="muted">Console de edição de encartes</span>
        <span style={{ marginLeft: 'auto' }} className="muted">{user.displayName}</span>
      </header>
      <div className="editor-body">{children}</div>
    </div>
  )
}
