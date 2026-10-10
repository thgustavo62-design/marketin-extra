import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { lastCollection, listCandidatePosts, listPublications } from '@/lib/data'
import {
  FORMATS, MATURITY_DAYS, MIN_SAMPLE, addDays, ageDays, candidateWindow, engagementRate, fmtNum, groupMedians, isMature, perThousandReach, suggestMatches, todayISO,
} from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { CollectButton } from './collect-button'
import { PublicationTable, type Cand, type Row } from './publication-table'

// A coleta lê o Windsor (anúncios podem demorar): damos até 1 minuto à ação.
export const maxDuration = 60

const WINDOW_DAYS = 90
const FORMAT_NAME: Record<string, string> = { ...FORMATS, story: 'Story', outro: 'Outro' }

export default async function Vinculos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()
  const pendingOnly = sp.ver === 'pendentes'
  const brandIds = scope.brand ? [scope.brand.id] : scope.brands.map((b) => b.id)

  const [all, last] = await Promise.all([
    listPublications({ brand: scope.brand?.slug, branchId: scope.branch?.id, from: addDays(today, -WINDOW_DAYS) }),
    lastCollection(brandIds),
  ])
  const dates = all.map((p) => p.published_on).filter((d): d is string => Boolean(d)).sort()
  const candidates = dates.length ? await listCandidatePosts(brandIds, candidateWindow(dates[0]).from, candidateWindow(dates[dates.length - 1]).to) : []
  const suggestions = new Map(suggestMatches(
    all.filter((p) => !p.content_id).map((p) => ({ id: p.id, brand_id: p.brand_id, published_on: p.published_on, format: p.format })),
    candidates.map((c) => ({ id: c.id, brand_id: c.brand_id, post_date: c.post_date, format: c.format, stage: c.stage })),
  ).map((s) => [s.publicationId, s.postId]))

  const toCand = (c: (typeof candidates)[number]): Cand => ({ id: c.id, title: c.title, post_date: c.post_date, format: c.format })
  const rows: Row[] = all.filter((p) => !pendingOnly || !p.content_id).map((p) => {
    const w = p.published_on ? candidateWindow(p.published_on) : null
    const mine = w ? candidates.filter((c) => c.brand_id === p.brand_id && c.post_date >= w.from && c.post_date <= w.to) : []
    const sid = suggestions.get(p.id)
    return {
      ...p,
      age: p.published_on ? ageDays(p.published_on, today) : null,
      mature: p.published_on ? isMature(p.published_on, today) : false,
      candidates: mine.map(toCand),
      suggestion: sid ? (mine.find((c) => c.id === sid) ? toCand(mine.find((c) => c.id === sid)!) : null) : null,
    }
  })

  // Diagnóstico: só publicações maduras, mediana por formato, sempre com o tamanho da amostra.
  const withMetrics = all.filter((p) => p.metrics && p.published_on)
  const matureOf = (p: (typeof all)[number]) => isMature(p.published_on!, today)
  const eng = groupMedians(withMetrics, (p) => FORMAT_NAME[p.format] ?? p.format, (p) => engagementRate(p.metrics!), matureOf)
  const saves = groupMedians(withMetrics, (p) => FORMAT_NAME[p.format] ?? p.format, (p) => perThousandReach(p.metrics!.saves, p.metrics!.reach), matureOf)
  const recent = withMetrics.filter((p) => !matureOf(p)).length
  const canEdit = canWrite(user.role)
  const unlinked = all.filter((p) => !p.content_id).length

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Publicações vinculadas</h1>
          <p>
            {scopeLabel(scope)} · {all.length} {all.length === 1 ? 'publicação' : 'publicações'} dos últimos {WINDOW_DAYS} dias, {unlinked} sem vínculo com um conteúdo planejado.
            Os números abaixo são <b>dados guardados</b> na última coleta{last ? ` (Histórico — atualizado em ${new Date(last).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})` : ' — nunca coletado'}, não leitura ao vivo.
          </p>
        </div>
        {canEdit && <CollectButton />}
      </header>

      <nav className="tabs" aria-label="Filtro">
        <Link href="/resultados/vinculos" className={`tab${pendingOnly ? '' : ' active'}`}>Todas</Link>
        <Link href="/resultados/vinculos?ver=pendentes" className={`tab${pendingOnly ? ' active' : ''}`}>Sem vínculo</Link>
        <a href="/api/export/publicacoes" className="tab">Baixar CSV</a>
      </nav>

      <div className="dark-surface">
        <h2 className="dark-h">Diagnóstico por formato <small>mediana · só publicações com {MATURITY_DAYS}+ dias</small></h2>
        {withMetrics.length === 0 ? (
          <p className="empty dark-empty">Sem métricas guardadas ainda. {canEdit ? 'Use “Coletar métricas agora”.' : 'Peça a um editor para coletar.'}</p>
        ) : (
          <>
            <div className="cards">
              <MedianCard title="Engajamento (interações ÷ alcance × 100)" groups={eng} unit="%" digits={2} />
              <MedianCard title="Salvamentos por mil contas alcançadas" groups={saves} unit="" digits={1} />
            </div>
            <p className="dark-note">
              Fonte: Windsor (Instagram), coleta guardada. Interações = curtidas + comentários + salvamentos + compartilhamentos. Medianas só aparecem com {MIN_SAMPLE}+ publicações no grupo; com menos, só o n.
              {recent > 0 && ` ${recent} publicação${recent > 1 ? 'ões' : ''} com menos de ${MATURITY_DAYS} dias ficou de fora (ainda acumulando resultado).`} Alcance não é aditivo: o alcance único da conta está em Insights.
              Comparação entre formatos não prova causa: depende de tema, horário, impulsionamento e público.
            </p>
          </>
        )}
      </div>

      <div className="dark-surface" style={{ marginTop: 18 }}>
        <h2 className="dark-h">Publicações <small>N/D = a rede não informou; não é zero</small></h2>
        {rows.length === 0 ? (
          <p className="empty dark-empty">{pendingOnly ? 'Todas as publicações coletadas já estão vinculadas.' : 'Nenhuma publicação coletada neste recorte.'}</p>
        ) : (
          <PublicationTable rows={rows} canEdit={canEdit} />
        )}
        <p className="dark-note">Quem tem mais de uma publicação para o mesmo conteúdo (reaproveitado ou postado em dois canais) pode vincular cada uma separadamente; as métricas nunca são somadas entre elas.</p>
      </div>
    </>
  )
}

function MedianCard({ title, groups, unit, digits }: { title: string; groups: { key: string; n: number; median: number | null; enough: boolean }[]; unit: string; digits: number }) {
  return (
    <article className="card dcard">
      <h3>{title}</h3>
      {groups.length === 0 ? <p className="muted">Nenhuma publicação madura com este dado.</p> : (
        <table className="mini"><tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>{g.key}</td>
              <td className="num"><b>{g.enough ? `${fmtNum(g.median, digits)}${unit}` : 'amostra pequena'}</b></td>
              <td className="num muted">n={g.n}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </article>
  )
}
