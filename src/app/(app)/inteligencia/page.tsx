import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { pool } from '@/lib/db'
import { CONFIDENCE_LABEL, fmtHours, scoreBand, STAGES, todayISO, type Finding } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { analyzeBrand, type BrandAnalysis } from '@/lib/intelligence/analyze'
import { OBJ_LABEL, browseObjects } from '@/lib/intelligence/objects'
import { getScope, scopeLabel } from '@/lib/scope'
import { FindingCard, type DecisionView } from './finding-card'

export const maxDuration = 60

const TABS = [['achados', 'Achados'], ['dados', 'Qualidade dos dados'], ['processo', 'Processo'], ['explorar', 'Explorar']] as const
type Tab = (typeof TABS)[number][0]

export default async function Inteligencia({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const tab: Tab = TABS.some(([k]) => k === sp.aba) ? (sp.aba as Tab) : 'achados'
  const canEdit = canWrite(user.role)
  const brands = scope.brand ? [scope.brand] : scope.brands
  const today = todayISO()
  const q = sp.q?.trim() || undefined

  // Cada filial é analisada separada: nada de misturar números de filiais diferentes.
  const analyses: BrandAnalysis[] = tab === 'explorar' ? [] : await Promise.all(brands.map((b) => analyzeBrand({ id: b.id, slug: b.slug, name: b.name }, scope.branch?.id ?? null, today)))
  const decisions = new Map<string, DecisionView>()
  if (tab === 'achados' || tab === 'processo') {
    const rows = (await pool.query(
      `select d.brand_id, d.insight_key, d.status, d.note, d.fingerprint, d.decided_at::text as at, u.display_name as by from insight_decisions d left join users u on u.id = d.decided_by where d.brand_id = any($1)`,
      [brands.map((b) => b.id)])).rows
    for (const r of rows) decisions.set(`${r.brand_id}|${r.insight_key}`, { status: r.status, note: r.note, fingerprint: r.fingerprint, by: r.by, at: r.at })
  }
  const browse = tab === 'explorar' ? await browseObjects({ brandIds: brands.map((b) => b.id), q }) : []
  const count = (list: Finding[], c: Finding['confidence']) => list.filter((f) => f.confidence === c).length

  return (
    <>
      <header className="page-head">
        <h1>Central de Inteligência</h1>
        <p>
          {scopeLabel(scope)} · análise dos dados guardados no sistema, <b>por filial</b>. Cada conclusão mostra amostra, período, método e nível de confiança; quando não há dado suficiente, o resultado é “inconclusivo”.
          Nada aqui prova causa: são pistas para decidir. Decisões ficam registradas com quem decidiu e quando.
        </p>
      </header>

      <nav className="tabs" aria-label="Seções">
        {TABS.map(([k, label]) => <Link key={k} href={`/inteligencia?aba=${k}`} className={`tab${tab === k ? ' active' : ''}`}>{label}</Link>)}
      </nav>

      {tab === 'achados' && analyses.map((a) => {
        const all = [...a.findings, ...a.process]
        return (
          <section key={a.brand.id} aria-label={`Achados de ${a.brand.name}`} data-brand={a.brand.name}>
            <h2 className="eyebrow">{a.brand.name}</h2>
            <p className="muted">
              {a.counts.publications} publicações reais no período ({a.counts.matured} maduras com métricas, {a.counts.linked} vinculadas) · {all.length} {all.length === 1 ? 'achado' : 'achados'}:
              {' '}{count(all, 'alta')} alta, {count(all, 'media')} média, {count(all, 'baixa')} tendência fraca, {count(all, 'inconclusiva')} inconclusivo(s) · Qualidade dos dados: <Link href="/inteligencia?aba=dados" className="inline-link"><b>{a.quality.score ?? 'N/D'}</b> ({scoreBand(a.quality.score).label})</Link>
            </p>
            {a.findings.length === 0 ? (
              <p className="empty">Ainda não há publicações coletadas suficientes para análise de resultados nesta filial. {canEdit ? <>Use <Link href="/resultados/vinculos" className="inline-link">Coletar métricas agora</Link>.</> : null}</p>
            ) : (
              <div className="cards">
                {a.findings.map((f) => <FindingCard key={f.key} brandId={a.brand.id} finding={f} decision={decisions.get(`${a.brand.id}|${f.key}`) ?? null} canEdit={canEdit} />)}
              </div>
            )}
          </section>
        )
      })}

      {tab === 'dados' && analyses.map((a) => {
        const band = scoreBand(a.quality.score)
        return (
          <section key={a.brand.id} aria-label={`Qualidade dos dados de ${a.brand.name}`} data-brand={a.brand.name}>
            <h2 className="eyebrow">{a.brand.name}</h2>
            <div className="quality-head">
              <div className={`quality-score tone-${band.tone}`} data-score={a.quality.score ?? ''}><strong>{a.quality.score ?? 'N/D'}</strong><small>de 100 · {band.label}</small></div>
              <p className="muted">A nota mede o quanto os dados do sistema sustentam análises confiáveis. Cada item abaixo mostra o que está faltando e como melhorar; os de maior prejuízo vêm primeiro. Itens que não se aplicam ficam fora da conta.</p>
            </div>
            <ul className="quality-list">
              {a.quality.items.map((i) => (
                <li key={i.key} data-item={i.key}>
                  <div className="quality-row">
                    <b>{i.label}</b>
                    <span className="muted">{i.score === null ? 'não se aplica' : `${Math.round(i.score * 100)}%`} · peso {i.weight}</span>
                  </div>
                  {i.score !== null && <div className="meter"><i style={{ width: `${Math.round(i.score * 100)}%` }} /></div>}
                  <p className="muted">{i.detail}{i.score !== null && i.score < 0.8 ? ` ${i.impact}` : ''}</p>
                  {i.fix && i.score !== null && i.score < 0.8 && <Link href={i.fix.href} className="btn">{i.fix.label}</Link>}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {tab === 'processo' && analyses.map((a) => (
        <section key={a.brand.id} aria-label={`Processo de ${a.brand.name}`} data-brand={a.brand.name}>
          <h2 className="eyebrow">{a.brand.name}</h2>
          {a.process.length === 0 && <p className="empty">Ainda não há movimentação suficiente no quadro (mínimo de 5 passagens por etapa) para analisar o processo.</p>}
          <div className="cards">
            {a.process.map((f) => <FindingCard key={f.key} brandId={a.brand.id} finding={f} decision={decisions.get(`${a.brand.id}|${f.key}`) ?? null} canEdit={canEdit} />)}
          </div>
          {a.stageDurations.length > 0 && (
            <div className="table-wrap">
              <table data-table="etapas">
                <thead><tr><th>Etapa</th><th className="num">Passagens</th><th className="num">Mediana</th><th className="num">90% até</th><th className="num">Ainda nela</th></tr></thead>
                <tbody>
                  {[...a.stageDurations].sort((x, y) => y.medianHours - x.medianHours).map((d) => (
                    <tr key={d.stage}><td>{STAGES[d.stage as keyof typeof STAGES] ?? d.stage}</td><td className="num">{d.n}</td><td className="num">{fmtHours(d.medianHours)}</td><td className="num">{fmtHours(d.p90Hours)}</td><td className="num">{d.ongoing}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {tab === 'explorar' && (
        <section aria-label="Explorar objetos">
          <p className="muted">Cada campanha, conteúdo e publicação tem ligações com os outros: abra um para ver tudo o que está ligado a ele e a linha do tempo.</p>
          <form className="filters" method="get">
            <input type="hidden" name="aba" value="explorar" />
            <input type="search" name="q" placeholder="Buscar por nome ou título" defaultValue={q ?? ''} aria-label="Buscar" />
            <button type="submit" className="secondary">Buscar</button>
          </form>
          {browse.length === 0 ? <p className="empty">Nada encontrado neste recorte.</p> : (
            <ul className="explore-list">
              {browse.map((o) => (
                <li key={`${o.kind}-${o.id}`} data-kind={o.kind}>
                  <span className="pill soft">{OBJ_LABEL[o.kind]}</span>{' '}
                  <Link href={`/inteligencia/explorar/${o.kind}/${o.id}`} className="inline-link">{o.title}</Link> <small className="muted">{o.meta}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="muted intel-foot">
        {tab === 'achados' && <>Níveis: <b>{CONFIDENCE_LABEL.alta}</b> (diferença improvável de ser acaso e amostra de 8+ por grupo), <b>{CONFIDENCE_LABEL.media}</b>, <b>{CONFIDENCE_LABEL.baixa}</b> e <b>{CONFIDENCE_LABEL.inconclusiva}</b> (pode ser acaso). </>}
        Veja as ideias de outros apps que inspiraram esta central em <code>docs/IDEIAS-BENCHMARK.md</code>.
      </p>
    </>
  )
}
