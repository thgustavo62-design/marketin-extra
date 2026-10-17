import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { PROMO_FORMATS } from '@/lib/domain/promo'
import { canWrite } from '@/lib/perms'
import { listDesigns } from '@/lib/promo/store'
import { DesignCard } from './design-card'
import { NewDesign } from './new-design'

export default async function MeusDesigns() {
  const user = await requireUser()
  const designs = await listDesigns()
  const write = canWrite(user.role)
  return (
    <>
      <header className="page-head">
        <h1>Meus designs</h1>
        <p>Artes livres, sem planilha: escolha o formato, monte com texto, imagens, formas e fundos e baixe em PNG (ou PDF no A4). Usa o mesmo editor das promoções, com a biblioteca de imagens e a aprovação. Prefere começar de uma arte pronta? Veja os <Link href="/criacao/modelos">modelos</Link>.</p>
      </header>
      {write && <NewDesign formats={(Object.keys(PROMO_FORMATS) as (keyof typeof PROMO_FORMATS)[]).map((k) => ({ id: k, label: PROMO_FORMATS[k].label, hint: PROMO_FORMATS[k].hint }))} />}
      <h2 style={{ marginTop: 22 }}>Seus designs</h2>
      {designs.length === 0 ? <p className="empty">Nenhum design ainda. Crie o primeiro acima.</p> : (
        <div className="cards">
          {designs.map((d) => (
            <DesignCard key={d.id} canEdit={write} design={{ thumbAt: d.thumb_at, id: d.id, name: d.name, status: d.status, pages: d.pages, format: d.format, formatLabel: PROMO_FORMATS[d.format].label, hint: PROMO_FORMATS[d.format].hint, updated: d.updated_at.slice(0, 10).split('-').reverse().join('/'), by: d.created_by_name }} />
          ))}
        </div>
      )}
    </>
  )
}
