import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listPlanImports, listPreviews } from '@/lib/data'
import { formatBR } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { PlanUploader } from './uploader'
import { UndoButton } from './undo-button'

// Ler o PDF e criar dezenas de pautas leva alguns segundos.
export const maxDuration = 60

const STATUS: Record<string, { label: string; tone: string }> = {
  previa: { label: 'Aguardando confirmação', tone: 'soft' },
  importado: { label: 'Importado', tone: 'on' },
  desfeito: { label: 'Desfeito', tone: 'off' },
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

export default async function ImportarPlano() {
  const user = await requireUser()
  const scope = await getScope()
  const brandIds = scope.brand ? [scope.brand.id] : scope.brands.map((b) => b.id)
  const writable = canWrite(user.role)
  const [history, previews] = await Promise.all([listPlanImports(brandIds), writable ? listPreviews(brandIds) : Promise.resolve([])])

  return (
    <>
      <header className="page-head">
        <h1>Importar plano de conteúdo (PDF)</h1>
        <p>
          {scopeLabel(scope)} · envie o PDF do plano (por exemplo, o de 60 dias) e o sistema lê o calendário e os briefings: <b>cria as pautas no calendário</b> com data e horário,
          o <b>roteiro, a legenda e as cenas</b>, as <b>tarefas</b> de captação, edição e stories de apoio no quadro de produção, e uma campanha para o ciclo.
          Antes de criar qualquer coisa você confere uma prévia e escolhe o que entra. Não usa IA: lê o texto do PDF por regras e avisa tudo que não conseguir entender.
        </p>
      </header>

      {writable ? (
        <section className="card" aria-labelledby="pi-up">
          <h2 id="pi-up" className="eyebrow">Enviar o PDF</h2>
          <PlanUploader brands={scope.brands} branches={scope.branches} defaultBrandId={scope.brand?.id} />
          <p className="muted pi-hint">
            O PDF precisa ter texto selecionável (exportado do Word, Google Docs ou Canva; não vale foto ou digitalização) e a tabela do calendário com data, código, formato e tema.
            Stories entram no calendário como Feed (o sistema ainda não tem o formato Story), identificados no título.
            Revisão farmacêutica nunca vem marcada: quem revisa é uma pessoa.
          </p>
        </section>
      ) : <p className="muted">Seu perfil é somente leitura. Você pode ver o histórico das importações abaixo.</p>}

      {previews.length > 0 && (
        <section aria-labelledby="pi-prev">
          <h2 id="pi-prev" className="eyebrow">Prévias aguardando confirmação</h2>
          <ul className="pi-list">
            {previews.map((p) => (
              <li key={p.id} data-preview={p.id}>
                <Link href={`/planejamento/importar-plano/${p.id}`} className="inline-link">{p.file_name}</Link>
                <span className="muted"> · {p.brand_name}{p.branch_name ? ` · ${p.branch_name}` : ''} · lido em {when(p.created_at)} por {p.created_by_name ?? '—'} · </span>
                <UndoButton id={p.id} mode="discard" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pi-hist">
        <h2 id="pi-hist" className="eyebrow">Histórico de importações</h2>
        {history.length === 0 ? <p className="empty">Nenhum plano importado ainda.</p> : (
          <div className="table-wrap">
            <table data-table="importacoes">
              <thead><tr><th>Arquivo</th><th>Filial</th><th>Período</th><th>Pautas</th><th>Situação</th><th>Por</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} data-import={h.id} data-status={h.status}>
                    <td><Link href={`/planejamento/importar-plano/${h.id}`} className="inline-link">{h.file_name}</Link><br /><small className="muted">{h.pages} páginas</small></td>
                    <td>{h.brand_name}{h.branch_name ? <><br /><small className="muted">{h.branch_name}</small></> : null}</td>
                    <td>{h.period_start && h.period_end ? `${formatBR(h.period_start)} a ${formatBR(h.period_end)}` : '—'}</td>
                    <td>
                      {h.status === 'importado' ? <>{h.posts_now} no sistema{h.skipped_count ? <><br /><small className="muted">{h.skipped_count} já existiam</small></> : null}</>
                        : h.status === 'desfeito' ? <small className="muted">{h.kept_count ? `${h.kept_count} mantida(s) por já terem andamento` : 'todas removidas'}</small> : '—'}
                    </td>
                    <td><span className={`pill ${STATUS[h.status].tone}`}>{STATUS[h.status].label}</span></td>
                    <td><small>{h.created_by_name ?? '—'}<br />{when(h.imported_at ?? h.created_at)}</small></td>
                    <td>{writable && h.status === 'importado' && h.posts_open > 0 ? <UndoButton id={h.id} mode="undo" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
