import Link from 'next/link'
import { ipcaSeries, listNotes, listSources } from '@/lib/data'
import { DATE_KIND_LABEL, IPCA_LABEL, describeDate, formatBR, ipcaPeriodLabel, type IpcaCategory } from '@/lib/domain'
import { calendarCoverage } from '@/lib/intelligence/market'
import { ArchiveNote, NoteForm, SourceButton } from './controls'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca')
const KIND: Record<string, string> = { regra: 'Regra', preco: 'Preço', sazonalidade: 'Sazonalidade', mercado: 'Mercado' }
const CONF: Record<string, string> = { alta: 'Fonte oficial', media: 'Confiança média', baixa: 'Confiança baixa' }

export async function MercadoTab({ brands, branchId, canEdit, today, kind }: { brands: { id: string; name: string }[]; branchId: string | null; canEdit: boolean; today: string; kind?: string }) {
  const [sources, ipca, notes, coverage] = await Promise.all([
    listSources(), ipcaSeries(13), listNotes({ kind, includeArchived: canEdit }),
    Promise.all(brands.map(async (b) => ({ brand: b, items: await calendarCoverage(b.id, branchId, today, 90, 2) }))),
  ])
  const periods = [...new Set(ipca.map((r) => r.period))]
  const cell = (p: string, c: IpcaCategory, f: 'monthly_pct' | 'accumulated_12m_pct') => ipca.find((r) => r.period === p && r.category === c)?.[f]
  const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'N/D' : `${n.toFixed(2).replace('.', ',')}%`)

  return (
    <>
      <section aria-labelledby="fontes">
        <h2 id="fontes" className="eyebrow">Fontes abertas</h2>
        <p className="muted">Dados públicos buscados da internet e guardados no nosso banco para cruzar com os resultados. Nenhuma fonte usa chave, raspagem ou conta de terceiros; cada atualização é manual, registrada e limitada, e uma falha nunca apaga o que já estava guardado.</p>
        <div className="cards">
          {sources.map((s) => (
            <article key={s.key} className="card" data-source-card={s.key}>
              <span className={`pill ${s.last_status === 'ok' ? 'on' : s.last_status === 'failed' ? 'off' : 'soft'}`}>{s.last_status === 'ok' ? 'Atualizada' : s.last_status === 'failed' ? 'Falhou' : 'Nunca atualizada'}</span>
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <p className="muted">{s.stored.toLocaleString('pt-BR')} registros guardados · última consulta: {when(s.last_run_at)}{s.last_version ? ` · versão ${s.last_version}` : ''} · frequência da fonte: {s.frequency}</p>
              {s.last_error && <p className="form-error">{s.last_error}</p>}
              <p className="muted"><small>{s.license_note} <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-link">Ver fonte</a></small></p>
              {canEdit && <SourceButton sourceKey={s.key} label={s.key === 'cmed' ? 'Atualizar lista de preços' : 'Atualizar agora'} />}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="datas">
        <h2 id="datas" className="eyebrow">Datas importantes (próximos 90 dias) × o que já está planejado</h2>
        {coverage.map(({ brand, items }) => (
          <div key={brand.id} data-brand={brand.name}>
            <h3>{brand.name}</h3>
            {items.length === 0 ? <p className="empty">Nenhuma data importante no período.</p> : (
              <div className="table-wrap">
                <table data-table="datas">
                  <thead><tr><th>Data</th><th>Evento</th><th>Tipo</th><th className="num">Em</th><th>Planejado?</th><th>Ideia</th></tr></thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.date.key} data-covered={c.covered ? 'sim' : 'nao'}>
                        <td>{describeDate(c.date)}</td>
                        <td><b>{c.date.name}</b> <small className="muted">relevância {c.date.relevance}/3</small></td>
                        <td>{DATE_KIND_LABEL[c.date.kind]}</td>
                        <td className="num">{c.daysUntil === 0 ? 'agora' : `${c.daysUntil} d`}</td>
                        <td>{c.covered ? <span className="pill on">{c.posts} conteúdo{c.posts > 1 ? 's' : ''}</span> : <Link className="btn" href={`/planejamento/conteudos/novo?data=${c.date.date < today ? today : c.date.date}`}>Criar conteúdo</Link>}</td>
                        <td className="muted">{c.date.angle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        <p className="muted">Feriados vêm da BrasilAPI; as demais datas são regras do próprio sistema (ex.: Dia das Mães = 2º domingo de maio). “Planejado” significa ter ao menos um conteúdo não cancelado de 4 dias antes até 1 dia depois da data.</p>
      </section>

      <section aria-labelledby="precos">
        <h2 id="precos" className="eyebrow">Preços ao consumidor (IPCA, IBGE)</h2>
        {periods.length === 0 ? <p className="empty">Ainda sem dados. {canEdit ? 'Use “Atualizar agora” na fonte de inflação.' : ''}</p> : (
          <div className="table-wrap">
            <table data-table="ipca">
              <thead><tr><th>Mês</th>{(['geral', 'saude', 'farmaceuticos'] as IpcaCategory[]).map((c) => <th key={c} className="num" colSpan={1}>{IPCA_LABEL[c]}<br /><small>mês · 12 meses</small></th>)}</tr></thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    <td>{ipcaPeriodLabel(p)}</td>
                    {(['geral', 'saude', 'farmaceuticos'] as IpcaCategory[]).map((c) => <td key={c} className="num">{pct(cell(p, c, 'monthly_pct'))} · <b>{pct(cell(p, c, 'accumulated_12m_pct'))}</b></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">Inflação ao consumidor do país (não o preço da sua loja). Medicamentos regulados seguem o reajuste anual da CMED. Para conferir o preço de uma oferta contra o teto legal, use a aba “Preço máximo (CMED)”.</p>
      </section>

      <section aria-labelledby="notas">
        <h2 id="notas" className="eyebrow">Pesquisas registradas <small className="muted">com fonte, data de acesso e confiança</small></h2>
        <nav className="tabs" aria-label="Tipo de nota">
          <Link href="/inteligencia?aba=mercado" className={`tab${!kind ? ' active' : ''}`}>Todas</Link>
          {Object.entries(KIND).map(([k, v]) => <Link key={k} href={`/inteligencia?aba=mercado&tipo=${k}`} className={`tab${kind === k ? ' active' : ''}`}>{v}</Link>)}
        </nav>
        {canEdit && <NoteForm today={today} />}
        <div className="cards">
          {notes.map((n) => (
            <article key={n.id} className={`card${n.status === 'arquivada' ? ' muted-card' : ''}`} data-note={n.title}>
              <span className="pill soft">{KIND[n.kind]}</span> <span className={`pill ${n.confidence === 'alta' ? 'on' : 'soft'}`}>{CONF[n.confidence]}</span>
              <h3>{n.title}</h3>
              <p className="pre">{n.summary}</p>
              <p className="muted"><small>Fonte: <a href={n.source_url} target="_blank" rel="noopener noreferrer" className="inline-link">{n.source_name}</a> · acessado em {formatBR(n.accessed_on)}{n.tags.length ? ` · ${n.tags.join(', ')}` : ''}</small></p>
              {canEdit && <div className="card-actions"><ArchiveNote id={n.id} archived={n.status === 'arquivada'} /></div>}
            </article>
          ))}
        </div>
        <p className="muted">São referências levantadas em fontes públicas para apoiar decisões, <b>não aconselhamento jurídico</b>: confirme com o responsável técnico da farmácia antes de aplicar.</p>
      </section>
    </>
  )
}
