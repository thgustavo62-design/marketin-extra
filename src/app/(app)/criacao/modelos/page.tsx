import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { PROMO_FORMATS } from '@/lib/domain/promo'
import { canWrite } from '@/lib/perms'
import { listTemplates } from '@/lib/promo/store'
import { TemplateGallery } from './template-gallery'

export default async function Modelos() {
  const user = await requireUser()
  const templates = await listTemplates()
  return (
    <>
      <header className="page-head">
        <h1>Modelos</h1>
        <p><Link href="/criacao">← Meus designs</Link> · Modelos são artes prontas para reutilizar: escolha um, troque os textos e comece a editar. Para criar um modelo, abra um design e use &quot;Salvar como modelo&quot; na aba Textos.</p>
      </header>
      <TemplateGallery canEdit={canWrite(user.role)} userId={user.id} isAdmin={user.role === 'admin'}
        templates={templates.map((t) => ({ id: t.id, name: t.name, category: t.category, pages: t.pages, formatLabel: PROMO_FORMATS[t.format].label.split(' ')[0], hint: PROMO_FORMATS[t.format].hint, thumbAt: t.thumb_at, by: t.created_by_name, mine: t.created_by === user.id }))} />
    </>
  )
}
