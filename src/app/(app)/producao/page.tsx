import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getCampaigns, listBoard, listUsers } from '@/lib/data'
import { FORMATS, STAGES, isFormat, isStage, todayISO } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { Board } from './board'

type SP = { eu?: string; resp?: string; camp?: string; formato?: string; etapa?: string; atrasados?: string; q?: string; abrir?: string }

export default async function Producao({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()

  const assignedTo = sp.eu === '1' ? user.id : isUuid(sp.resp) ? sp.resp : undefined
  const stage = isStage(sp.etapa) ? sp.etapa : undefined
  const format = isFormat(sp.formato) ? sp.formato : undefined
  const q = sp.q?.trim() || undefined
  const [cards, allCampaigns, users] = await Promise.all([
    listBoard({
      brand: scope.brand?.slug, branchId: scope.branch?.id, assignedTo, campaignId: isUuid(sp.camp) ? sp.camp : undefined,
      format, stage, q, overdueOnly: sp.atrasados === '1', today,
    }),
    getCampaigns(),
    listUsers(),
  ])
  const campaigns = allCampaigns.filter((c) => scope.brands.some((b) => b.id === c.brand_id) && (!scope.brand || c.brand_id === scope.brand.id))
  const people = users.filter((u) => u.active && (u.role === 'admin' || u.role === 'editor'))
  const filtered = Boolean(assignedTo || stage || format || q || sp.camp || sp.atrasados)
  const chip = (href: string, label: string, active: boolean) => <Link href={href} className={`tab${active ? ' active' : ''}`}>{label}</Link>

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Quadro de produção</h1>
          <p>{scopeLabel(scope)} · {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}. Arraste entre as colunas ou use o seletor de cada cartão. Publicados e cancelados ficam por 30 dias.</p>
        </div>
      </header>

      <nav className="tabs" aria-label="Atalhos">
        {chip('/producao', 'Todos', !filtered)}
        {chip('/producao?eu=1', 'Minhas tarefas', sp.eu === '1')}
        {chip('/producao?atrasados=1', 'Atrasados', sp.atrasados === '1')}
        {chip('/producao?etapa=aprovacao', 'Aguardando aprovação', stage === 'aprovacao')}
      </nav>

      <form className="filters" method="get">
        <select name="resp" defaultValue={sp.eu === '1' ? '' : (sp.resp ?? '')} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select name="camp" defaultValue={sp.camp ?? ''} aria-label="Campanha">
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="formato" defaultValue={format ?? ''} aria-label="Formato">
          <option value="">Todos os formatos</option>
          {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="etapa" defaultValue={stage ?? ''} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" name="q" placeholder="Buscar título ou legenda" defaultValue={sp.q ?? ''} aria-label="Buscar" />
        <label className="check inline"><input type="checkbox" name="atrasados" value="1" defaultChecked={sp.atrasados === '1'} /> Só atrasados</label>
        <button type="submit" className="secondary">Filtrar</button>
      </form>

      {cards.length === 0 && !filtered && (
        <p className="empty">Nenhum cartão ainda. Crie um em qualquer coluna (“Adicionar cartão”), use “Gerar semana” ou cadastre um conteúdo no calendário.</p>
      )}
      <Board
        cards={cards}
        canEdit={canWrite(user.role)}
        today={today}
        brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
        defaultBrandId={scope.brand?.id}
        defaultBranchId={scope.branch?.id}
        onlyStage={stage}
        initialOpen={isUuid(sp.abrir) ? sp.abrir : undefined}
      />
    </>
  )
}
