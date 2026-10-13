import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { existingPostsBetween, getPlanImport, listAssignableUsers } from '@/lib/data'
import { buildPreviewRows, formatBR, todayISO, type PlanWarning } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { PreviewForm } from './preview-form'
import { UndoButton } from '../undo-button'

// Montar a prévia compara com os conteúdos já existentes; importar cria dezenas de pautas.
export const maxDuration = 60

const LEVEL: Record<PlanWarning['level'], { label: string; tone: string }> = {
  erro: { label: 'Erro', tone: 'off' },
  aviso: { label: 'Conferir', tone: 'soft' },
  info: { label: 'Informação', tone: 'on' },
}
const KIND_LABEL = { reel: 'Reels', institucional: 'Feed institucional', carrossel: 'Carrosséis', stories: 'Dias de Stories', outro: 'Outros' } as const
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000) + 1

export default async function PreviaDoPlano({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const imp = await getPlanImport(id)
  if (!imp || !brandAllowed(user, imp.brand_id)) notFound()
  const plan = imp.parsed
  const writable = canWrite(user.role)
  const today = todayISO()
  const start = plan.period?.start ?? today, end = plan.period?.end ?? today

  const kinds = new Map<string, number>()
  for (const e of plan.entries) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1)
  const withBrief = plan.entries.filter((e) => e.block).length

  const showPreview = imp.status === 'previa' && writable
  const [existing, users] = showPreview
    ? await Promise.all([existingPostsBetween(imp.brand_id, start, end), listAssignableUsers(imp.brand_id)])
    : [[], []]
  const rows = showPreview ? buildPreviewRows(plan, existing, today, { leadDays: 3, initialStage: 'auto', fileName: imp.file_name }) : []
  const totalTasks = rows.reduce((n, r) => n + r.tasks, 0)
  const warnings = plan.warnings.filter((w) => w.entry === undefined || w.level === 'erro')
  const entryWarnings = plan.warnings.filter((w) => w.entry !== undefined && w.level !== 'erro')

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>{imp.status === 'previa' ? 'Prévia da importação' : 'Importação de plano'}</h1>
          <p>
            <b>{imp.file_name}</b> · {imp.brand_name}{imp.branch_name ? ` · ${imp.branch_name}` : ' · todas as unidades'} · {imp.pages} páginas · lido em {when(imp.created_at)} por {imp.created_by_name ?? '—'}
          </p>
          <p><Link href="/planejamento/importar-plano" className="inline-link">← Importar plano</Link></p>
        </div>
        <span className={`pill ${imp.status === 'importado' ? 'on' : imp.status === 'desfeito' ? 'off' : 'soft'}`} data-status={imp.status}>
          {imp.status === 'importado' ? 'Importado' : imp.status === 'desfeito' ? 'Desfeito' : 'Aguardando confirmação'}
        </span>
      </header>

      <section className="pi-summary" aria-label="Resumo do que foi lido">
        <div className="card"><small className="muted">Período</small><b>{formatBR(start)} a {formatBR(end)}</b><small className="muted">{daysBetween(start, end)} dias · {plan.entries.length} peças</small></div>
        <div className="card"><small className="muted">Por formato</small>{[...kinds].map(([k, n]) => <span key={k}><b>{n}</b> {KIND_LABEL[k as keyof typeof KIND_LABEL]}</span>)}</div>
        <div className="card"><small className="muted">Briefings</small><b>{withBrief} de {plan.entries.length}</b><small className="muted">com roteiro/legenda completos</small></div>
        {showPreview && <div className="card"><small className="muted">Tarefas a criar</small><b>{totalTasks}</b><small className="muted">no quadro de produção</small></div>}
      </section>
      {plan.objective && <p className="muted pi-objective"><b>Objetivo do ciclo no PDF:</b> {plan.objective}</p>}

      {warnings.length > 0 && (
        <section className="card" aria-labelledby="pi-warn" data-warnings>
          <h2 id="pi-warn" className="eyebrow">O que o sistema notou no PDF</h2>
          <ul className="pi-list">
            {warnings.map((w, i) => <li key={i} data-warning={w.code}><span className={`pill ${LEVEL[w.level].tone}`}>{LEVEL[w.level].label}</span> {w.message}</li>)}
          </ul>
        </section>
      )}
      {entryWarnings.length > 0 && showPreview && <p className="muted">{entryWarnings.length} aviso(s) por peça aparecem na coluna “Atenção” da tabela.</p>}

      {imp.status === 'importado' && (
        <section className="card" data-imported>
          <h2 className="eyebrow">Importação concluída</h2>
          <p>
            {imp.created_count} {imp.created_count === 1 ? 'pauta criada' : 'pautas criadas'} em {when(imp.imported_at)}
            {imp.skipped_count ? `; ${imp.skipped_count} já existiam e foram ignoradas` : ''}.
            {imp.campaign_id ? <> Campanha: <Link href={`/campanhas?editar=${imp.campaign_id}#form`} className="inline-link">ver campanha</Link>.</> : null}
          </p>
          <p className="pi-actions">
            <Link className="btn primary-link" href={`/planejamento/calendario?m=${start.slice(0, 7)}`}>Ver no calendário</Link>{' '}
            <Link className="btn" href="/producao">Ver no quadro de produção</Link>{' '}
            <Link className="btn" href="/planejamento/conteudos">Ver conteúdos</Link>{' '}
            {writable && <UndoButton id={imp.id} mode="undo" />}
          </p>
        </section>
      )}
      {imp.status === 'desfeito' && (
        <section className="card" data-undone>
          <p>Importação desfeita em {when(imp.undone_at)}. {imp.kept_count ? `${imp.kept_count} pauta(s) foram mantidas por já terem andamento.` : 'Todas as pautas foram removidas.'} Você pode enviar o PDF de novo.</p>
        </section>
      )}

      {showPreview && (
        <section aria-labelledby="pi-conf">
          <h2 id="pi-conf" className="eyebrow">Confira e escolha o que entra</h2>
          <p className="muted">
            Vêm marcadas as peças com data futura que ainda não estão no calendário. O pilar foi deduzido do texto do plano e você pode trocar aqui; depois de importar tudo continua editável em cada conteúdo.
            O calendário mostra as pautas já com as tarefas no quadro de produção. <b>Nada é publicado nem agendado na Meta</b> e a revisão farmacêutica fica pendente para quem for revisar.
          </p>
          <PreviewForm id={imp.id} rows={rows} users={users} defaultCampaignName={`Plano de ${daysBetween(start, end)} dias · ${formatBR(start).slice(0, 5)} a ${formatBR(end)}`} />
          <p className="pi-actions"><UndoButton id={imp.id} mode="discard" afterGo="/planejamento/importar-plano" /></p>
        </section>
      )}
      {imp.status === 'previa' && !writable && <p className="muted">Seu perfil é somente leitura: só editores e administradores confirmam a importação.</p>}
    </>
  )
}
