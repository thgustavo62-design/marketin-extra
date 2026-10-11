// Atualização das fontes externas (manual, por clique). Cada execução fica registrada; falha nunca apaga o que já estava guardado.
import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import { pool, withTx } from '../db'
import { buildHeaderIndex, discoverCmedFile, mapCmedRow, mergeIpca, parseHolidays, parseSidra, IPCA_CATEGORIES, type CmedProduct } from '../domain'
import { fetchJson, safeFetch } from './fetch'

export type SourceKey = 'feriados' | 'ipca' | 'cmed'
export const isSourceKey = (v: unknown): v is SourceKey => v === 'feriados' || v === 'ipca' || v === 'cmed'
export type RunResult = { ok: true; records: number; version: string | null; skipped: boolean; message: string } | { ok: false; error: string }

const MIN_MINUTES_BETWEEN = 10
const CMED_PAGE = 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos'
const IBGE = 'https://servicodados.ibge.gov.br/api/v3/agregados/7060'

export async function runSource(key: SourceKey, actorId: string | null, opts: { force?: boolean } = {}): Promise<RunResult> {
  const src = (await pool.query(`select active, last_run_at, last_version from external_sources where key = $1`, [key])).rows[0]
  if (!src) return { ok: false, error: 'Fonte desconhecida.' }
  if (!src.active) return { ok: false, error: 'Esta fonte está desativada.' }
  if (!opts.force && src.last_run_at && Date.now() - new Date(src.last_run_at).getTime() < MIN_MINUTES_BETWEEN * 60_000) {
    return { ok: false, error: `Esta fonte foi consultada há menos de ${MIN_MINUTES_BETWEEN} minutos. Aguarde para não sobrecarregar a fonte.` }
  }
  const started = new Date()
  let result: RunResult
  try {
    result = key === 'feriados' ? await importHolidays() : key === 'ipca' ? await importIpca() : await importCmed(src.last_version)
  } catch (e) {
    result = { ok: false, error: `Falha inesperada na importação (${e instanceof Error ? e.name : 'erro'}). Nada foi alterado.` }
  }
  const status = result.ok ? 'ok' : 'failed'
  await pool.query(
    `insert into external_imports (source, status, version, records, started_at, finished_at, error, requested_by) values ($1, $2, $3, $4, $5, now(), $6, $7)`,
    [key, result.ok && result.skipped ? 'skipped' : status, result.ok ? result.version : null, result.ok ? result.records : null, started, result.ok ? null : result.error.slice(0, 280), actorId])
  await pool.query(
    `update external_sources set last_run_at = now(), last_status = $2, last_error = $3, last_records = coalesce($4, last_records), last_version = coalesce($5, last_version) where key = $1`,
    [key, status, result.ok ? null : result.error.slice(0, 280), result.ok ? result.records : null, result.ok ? result.version : null])
  return result
}

// ---------- feriados (BrasilAPI) ----------
async function importHolidays(): Promise<RunResult> {
  const year = new Date().getFullYear()
  let total = 0
  for (const y of [year, year + 1]) {
    const r = await fetchJson(`https://brasilapi.com.br/api/feriados/v1/${y}`)
    if (!r.ok) return { ok: false, error: r.error }
    const p = parseHolidays(r.json)
    if (!p.ok) return { ok: false, error: p.error }
    await withTx(async (db) => {
      for (const h of p.rows) await db.query(`insert into external_holidays (on_date, name, kind) values ($1, $2, $3) on conflict (on_date, name) do update set fetched_at = now(), kind = excluded.kind`, [h.date, h.name, h.kind])
    })
    total += p.rows.length
  }
  return { ok: true, records: total, version: String(year), skipped: false, message: `${total} feriados de ${year} e ${year + 1} atualizados.` }
}

// ---------- IPCA (IBGE / SIDRA 7060) ----------
async function importIpca(): Promise<RunResult> {
  const cats = Object.keys(IPCA_CATEGORIES).join(',')
  const q = (variable: number) => `${IBGE}/periodos/-26/variaveis/${variable}?localidades=N1%5Ball%5D&classificacao=315%5B${cats}%5D`
  const [m, a] = await Promise.all([fetchJson(q(63), 30_000), fetchJson(q(2265), 30_000)])
  if (!m.ok) return { ok: false, error: m.error }
  if (!a.ok) return { ok: false, error: a.error }
  const pm = parseSidra(m.json), pa = parseSidra(a.json)
  if (!pm.ok) return { ok: false, error: pm.error }
  if (!pa.ok) return { ok: false, error: pa.error }
  const rows = mergeIpca(pm.points, pa.points)
  await withTx(async (db) => {
    for (const r of rows) await db.query(
      `insert into external_ipca (period, category, monthly_pct, accumulated_12m_pct) values ($1, $2, $3, $4)
       on conflict (period, category) do update set monthly_pct = coalesce(excluded.monthly_pct, external_ipca.monthly_pct), accumulated_12m_pct = coalesce(excluded.accumulated_12m_pct, external_ipca.accumulated_12m_pct), fetched_at = now()`,
      [r.period, r.category, r.monthly, r.accumulated12])
  })
  const last = rows.map((r) => r.period).sort().at(-1) ?? null
  return { ok: true, records: rows.length, version: last, skipped: false, message: `IPCA atualizado até ${last?.slice(5)}/${last?.slice(0, 4)} (${rows.length} valores).` }
}

// ---------- CMED (Anvisa) ----------
const BATCH = 1000

async function importCmed(lastVersion: string | null): Promise<RunResult> {
  const page = await safeFetch(CMED_PAGE, { timeoutMs: 30_000, maxBytes: 3 * 1024 * 1024, accept: 'text/html' })
  if (!page.ok) return { ok: false, error: page.error }
  const found = discoverCmedFile(page.body.toString('utf8'))
  if (!found) return { ok: false, error: 'Não encontrei o arquivo de preços (PMC) na página da CMED: o site pode ter mudado. Nada foi alterado.' }
  const have = Number((await pool.query(`select count(*)::int n from cmed_products`)).rows[0].n)
  if (lastVersion === found.version && have > 0) return { ok: true, records: have, version: found.version, skipped: true, message: `A lista da CMED já está na versão mais recente (${found.publishedOn.split('-').reverse().join('/')}).` }

  const file = await safeFetch(found.url, { timeoutMs: 90_000, maxBytes: 40 * 1024 * 1024, accept: 'application/octet-stream' })
  if (!file.ok) return { ok: false, error: file.error }
  if (file.body.subarray(0, 2).toString('latin1') !== 'PK') return { ok: false, error: 'O arquivo baixado não é uma planilha válida. Nada foi alterado.' }

  const products: CmedProduct[] = []
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([file.body]), { sharedStrings: 'cache', worksheets: 'emit', styles: 'ignore', hyperlinks: 'ignore' })
  let headerError = ''
  for await (const ws of wb) {
    let header: ReturnType<typeof buildHeaderIndex> | null = null
    for await (const row of ws) {
      const vals = (row.values as unknown[]).slice(1)
      if (!header) {
        header = buildHeaderIndex(vals)
        if (!header.ok && headerError === '') headerError = header.error
        continue
      }
      if (!header.ok) break
      const p = mapCmedRow(header, vals)
      if (p) products.push(p)
    }
  }
  if (products.length < 1000) return { ok: false, error: products.length === 0 && headerError ? headerError : `A planilha trouxe só ${products.length} produtos (esperado: milhares). Nada foi alterado.` }

  const importId = (await pool.query(`select gen_random_uuid() as id`)).rows[0].id as string
  await withTx(async (db) => {
    for (let i = 0; i < products.length; i += BATCH) {
      const b = products.slice(i, i + BATCH)
      await db.query(
        `insert into cmed_products (ggrem, registro, eans, product, substance, lab, presentation, therapeutic_class, product_type, price_regime, tarja, pf_sem_impostos, pmc_sem_impostos, pmc, hospital_only, published_on, import_id)
         select t.ggrem, t.registro, coalesce(string_to_array(nullif(t.eans, ''), ','), '{}'), t.product, t.substance, t.lab, t.presentation, t.cls, t.ptype, t.regime, t.tarja, t.pf, t.pmcsi, t.pmc::jsonb, t.hosp, $16::date, $17::uuid
           from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::numeric[], $13::numeric[], $14::text[], $15::boolean[])
                as t(ggrem, registro, eans, product, substance, lab, presentation, cls, ptype, regime, tarja, pf, pmcsi, pmc, hosp)
         on conflict (ggrem) do update set registro = excluded.registro, eans = excluded.eans, product = excluded.product, substance = excluded.substance, lab = excluded.lab,
           presentation = excluded.presentation, therapeutic_class = excluded.therapeutic_class, product_type = excluded.product_type, price_regime = excluded.price_regime, tarja = excluded.tarja,
           pf_sem_impostos = excluded.pf_sem_impostos, pmc_sem_impostos = excluded.pmc_sem_impostos, pmc = excluded.pmc, hospital_only = excluded.hospital_only,
           published_on = excluded.published_on, import_id = excluded.import_id`,
        [b.map((p) => p.ggrem), b.map((p) => p.registro), b.map((p) => p.eans.join(',')), b.map((p) => p.product), b.map((p) => p.substance), b.map((p) => p.lab), b.map((p) => p.presentation),
          b.map((p) => p.therapeuticClass), b.map((p) => p.productType), b.map((p) => p.priceRegime), b.map((p) => p.tarja), b.map((p) => p.pfSemImpostos), b.map((p) => p.pmcSemImpostos),
          b.map((p) => JSON.stringify(p.pmc)), b.map((p) => p.hospitalOnly), found.publishedOn, importId])
    }
    // o que saiu da lista oficial sai do banco (preço de produto que deixou de existir não vale como referência)
    await db.query(`delete from cmed_products where import_id is distinct from $1::uuid`, [importId])
  })
  return { ok: true, records: products.length, version: found.version, skipped: false, message: `${products.length} apresentações importadas (lista de ${found.publishedOn.split('-').reverse().join('/')}).` }
}
