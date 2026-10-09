import { requireUser } from '@/lib/auth'
import { getCampaigns } from '@/lib/data'
import { todayISO } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope } from '@/lib/scope'
import { GerarForm } from './gerar-form'

export default async function Gerar() {
  const user = await requireUser()
  const scope = await getScope()
  const brands = scope.brands
  const campaigns = (await getCampaigns()).filter((c) => brands.some((b) => b.id === c.brand_id))
  return (
    <>
      <header className="page-head">
        <h1>Gerar semana</h1>
        <p>
          Cria 4 rascunhos em 7 dias (2 carrosséis e 2 Reels, nos dias +0, +2, +4 e +6) a partir de modelos editoriais.
          Não é IA e não pesquisa na internet. Os trechos entre [colchetes] precisam ser preenchidos e revisados antes de aprovar.
          Com campanha, a semana inteira precisa estar dentro da validade. Pautas já existentes não são duplicadas.
        </p>
      </header>
      <section className="card narrow">
        {canWrite(user.role) ? <GerarForm brands={brands} campaigns={campaigns} today={todayISO()} defaultBrandId={scope.brand?.id} /> : <p className="muted">Seu perfil é somente leitura.</p>}
      </section>
    </>
  )
}
