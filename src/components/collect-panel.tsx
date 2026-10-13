import { CollectButton } from '@/components/collect-button'
import { lastCollection } from '@/lib/data'
import { canWrite } from '@/lib/perms'
import { requireUser } from '@/lib/auth'
import type { Scope } from '@/lib/scope'

// Faixa "última coleta + botão de coletar" usada nas telas de resultados. Só editores e administradores veem o botão.
export async function CollectPanel({ scope }: { scope: Scope }) {
  const user = await requireUser()
  const brandIds = scope.brand ? [scope.brand.id] : scope.brands.map((b) => b.id)
  const last = brandIds.length ? await lastCollection(brandIds) : null
  const canEdit = canWrite(user.role)
  return (
    <section className="collect-panel" aria-label="Coleta de dados do Windsor" data-collect-panel>
      <p className="muted">
        {last
          ? <>Última coleta guardada no sistema: <b>{new Date(last).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</b>.</>
          : <>Os dados do Windsor ainda não foram coletados para este recorte.</>}
        {' '}A coleta guarda no banco as publicações dos últimos 90 dias e os totais do mês (Instagram e anúncios) e atualiza as telas.
        {!canEdit && ' Peça a um editor para coletar.'}
      </p>
      {canEdit && <CollectButton />}
    </section>
  )
}
