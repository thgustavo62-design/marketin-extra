import Link from 'next/link'
import { brandIcms, cmedMeta, listSources, searchCmed } from '@/lib/data'
import { VERDICT_LABEL, checkPrice, formatBR, parseBrNumber, verdictMessage, type PriceCheck } from '@/lib/domain'
import { IcmsForm, SourceButton } from './controls'

const brl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const TONE: Record<PriceCheck['status'], string> = { dentro: 'on', acima: 'off', sem_teto: 'soft', sem_icms: 'soft', nao_encontrado: 'soft' }

export async function PrecosTab({ brands, canEdit, isAdmin, q, preco }: { brands: { id: string; name: string }[]; canEdit: boolean; isAdmin: boolean; q?: string; preco?: string }) {
  const [meta, icms, sources, hits] = await Promise.all([cmedMeta(), brandIcms(), listSources(), q ? searchCmed(q, 30) : Promise.resolve([])])
  const cmed = sources.find((s) => s.key === 'cmed')
  const price = preco ? parseBrNumber(preco) : null
  // com uma filial escolhida usa a alíquota dela; com várias, mostra o veredito de cada uma
  const lines = hits.map((h) => ({ h, checks: price === null ? [] : brands.map((b) => ({ b, c: checkPrice(price, { pmc: h.pmc, product: h.product, presentation: h.presentation }, icms.get(b.id) ?? null) })) }))

  return (
    <>
      <section aria-labelledby="cmed-h">
        <h2 id="cmed-h" className="eyebrow">Preço máximo ao consumidor (CMED)</h2>
        <p className="muted">
          A lista oficial da CMED/Anvisa define o <b>PMC</b>, o preço máximo que farmácias e drogarias podem praticar, por alíquota de ICMS. Vender ou ofertar acima dele é infração. Aqui você consulta a lista guardada e confere o preço de uma oferta.
          {' '}{meta.total > 0 ? <>Lista guardada: <b>{meta.total.toLocaleString('pt-BR')}</b> apresentações, publicada em <b>{meta.published_on ? formatBR(meta.published_on) : '—'}</b>.</> : <b>A lista ainda não foi importada.</b>}
        </p>
        {canEdit && cmed && <SourceButton sourceKey="cmed" label={meta.total > 0 ? 'Verificar nova lista da CMED' : 'Importar a lista da CMED'} />}
      </section>

      <section aria-labelledby="icms-h">
        <h2 id="icms-h" className="eyebrow">Alíquota de ICMS por filial</h2>
        <p className="muted">O teto muda conforme o ICMS do estado onde a loja vende (a lista traz uma coluna de PMC para cada alíquota). Sem a alíquota cadastrada o sistema <b>não afirma</b> que um preço está acima do teto. Confirme a alíquota com o contador da farmácia.</p>
        {brands.map((b) => <IcmsForm key={b.id} brandId={b.id} name={b.name} current={icms.get(b.id) ?? null} canEdit={isAdmin} />)}
        {!isAdmin && <p className="muted">Só administradores alteram a alíquota.</p>}
      </section>

      <section aria-labelledby="busca-h">
        <h2 id="busca-h" className="eyebrow">Consultar e conferir preço</h2>
        <form className="filters" method="get">
          <input type="hidden" name="aba" value="precos" />
          <input className="grow" type="search" name="q" placeholder="Nome, substância ou código de barras (EAN)" defaultValue={q ?? ''} aria-label="Buscar medicamento" />
          <input className="price" type="text" name="preco" inputMode="decimal" placeholder="Preço da oferta (R$)" defaultValue={preco ?? ''} aria-label="Preço da oferta" />
          <button type="submit" className="secondary">Consultar</button>
        </form>
        {q && hits.length === 0 && <p className="empty">Nada encontrado para “{q}”.{meta.total === 0 ? ' A lista da CMED ainda não foi importada.' : ''}</p>}
        {price === null && preco && <p className="form-error" role="alert">Preço inválido. Use números, ex.: 12,90.</p>}
        {lines.length > 0 && (
          <div className="table-wrap">
            <table data-table="cmed">
              <thead><tr><th>Produto</th><th>Apresentação</th><th>EAN</th><th>Regime</th><th>Tarja</th><th>PMC por ICMS</th>{price !== null && <th>Conferência de {brl(price)}</th>}</tr></thead>
              <tbody>
                {lines.map(({ h, checks }) => (
                  <tr key={h.ggrem} data-ggrem={h.ggrem}>
                    <td><b>{h.product}</b><br /><small className="muted">{h.substance} · {h.lab}</small></td>
                    <td>{h.presentation}</td>
                    <td><small>{h.eans.join(', ') || '—'}</small></td>
                    <td>{h.price_regime ?? '—'}</td>
                    <td><small>{h.tarja ?? '—'}</small></td>
                    <td><small>{brands.map((b) => { const r = icms.get(b.id); return <span key={b.id}>{b.name}: {r === null || r === undefined ? 'ICMS não cadastrado' : `${String(r).replace('.', ',')}% → ${brl(h.pmc[String(r)])}`}<br /></span> })}</small></td>
                    {price !== null && (
                      <td>
                        {checks.map(({ b, c }) => (
                          <div key={b.id} data-verdict={c.status}><span className={`pill ${TONE[c.status]}`}>{VERDICT_LABEL[c.status]}</span> <small>{brands.length > 1 ? `${b.name}: ` : ''}{verdictMessage(c)}</small></div>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">Fonte: lista de preços da CMED (Anvisa), dados públicos. “Liberado” significa que só o Preço Fábrica é liberado: o PMC deve respeitar as margens da norma e pode não constar na lista. Esta consulta apoia a decisão; a responsabilidade pelo preço praticado é da farmácia. {q ? <Link href="/inteligencia?aba=precos" className="inline-link">Limpar</Link> : null}</p>
      </section>
    </>
  )
}
