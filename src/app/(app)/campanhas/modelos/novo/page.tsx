import { requireUser, writerOrRedirect } from '@/lib/auth'
import { listAssignableUsers } from '@/lib/data'
import { getScope } from '@/lib/scope'
import { TemplateForm } from '../template-form'

export default async function NovoModelo() {
  await requireUser()
  await writerOrRedirect()
  const scope = await getScope()
  const people = Object.fromEntries(await Promise.all(scope.brands.map(async (b) => [b.id, await listAssignableUsers(b.id)] as const)))
  return (
    <>
      <header className="page-head">
        <h1>Novo modelo de campanha</h1>
        <p>Defina quando a campanha acontece, quais peças entram e quem cuida. Preços, ofertas e validades <b>não</b> ficam no modelo: são confirmados por uma pessoa a cada ocorrência.</p>
      </header>
      <section className="card narrow-lg">
        <TemplateForm
          brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
          branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
          people={people} defaultBrandId={scope.brand?.id}
        />
      </section>
    </>
  )
}
