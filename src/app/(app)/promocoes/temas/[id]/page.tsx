import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getTheme } from '@/lib/promo/store'
import { ThemeEditor } from './theme-editor'

export default async function Tema({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const theme = await getTheme(id)
  if (!theme) notFound()
  return (
    <>
      <header className="page-head">
        <h1>Tema: {theme.name}</h1>
        <p><Link href="/promocoes/temas">← Temas</Link></p>
      </header>
      <ThemeEditor theme={theme} canEdit={canWrite(user.role)} />
    </>
  )
}
