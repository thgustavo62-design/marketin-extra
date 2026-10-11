// Dados externos já guardados no banco (fontes abertas) e notas de pesquisa.
import { pool } from '../db'
import { normalizeEan, type IpcaCategory } from '../domain'

export type Source = {
  key: string; name: string; description: string; url: string; license_note: string; frequency: string; active: boolean
  last_run_at: string | null; last_status: 'never' | 'ok' | 'failed'; last_error: string | null; last_records: number | null; last_version: string | null; stored: number
}

export async function listSources(): Promise<Source[]> {
  return (await pool.query(
    `select s.key, s.name, s.description, s.url, s.license_note, s.frequency, s.active, s.last_run_at::text as last_run_at, s.last_status, s.last_error, s.last_records, s.last_version,
            case s.key when 'feriados' then (select count(*) from external_holidays)
                       when 'ipca' then (select count(*) from external_ipca)
                       when 'cmed' then (select count(*) from cmed_products) else 0 end::int as stored
       from external_sources s order by s.key`)).rows
}

export type IpcaRow = { period: string; category: IpcaCategory; monthly_pct: number | null; accumulated_12m_pct: number | null }
export async function ipcaSeries(months = 13): Promise<IpcaRow[]> {
  return (await pool.query(
    `select period, category, monthly_pct::float8 as monthly_pct, accumulated_12m_pct::float8 as accumulated_12m_pct from external_ipca
      where period in (select distinct period from external_ipca order by period desc limit $1) order by period desc, category`, [months])).rows
}

export type CmedHit = {
  ggrem: string; product: string; substance: string | null; presentation: string | null; lab: string | null; eans: string[]; price_regime: string | null; tarja: string | null
  therapeutic_class: string | null; product_type: string | null; pmc: Record<string, number>; hospital_only: boolean; published_on: string | null
}
const CMED_COLS = `ggrem, product, substance, presentation, lab, eans, price_regime, tarja, therapeutic_class, product_type, pmc, hospital_only, published_on::text as published_on`

// Busca por código de barras (8 a 14 dígitos) ou por nome/substância.
export async function searchCmed(q: string, limit = 30): Promise<CmedHit[]> {
  const term = q.trim()
  if (term.length < 3) return []
  const ean = /^\d{8,14}$/.test(term.replace(/\s/g, '')) ? normalizeEan(term) : null
  if (ean) return (await pool.query(`select ${CMED_COLS} from cmed_products where $1 = any(eans) limit $2`, [ean, limit])).rows
  const like = `%${term.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`
  return (await pool.query(
    `select ${CMED_COLS} from cmed_products where lower(product) like $1 or lower(coalesce(substance, '')) like $1 order by product, presentation limit $2`, [like, limit])).rows
}

export async function cmedByEan(ean: string): Promise<CmedHit | null> {
  const n = normalizeEan(ean)
  return n ? ((await pool.query(`select ${CMED_COLS} from cmed_products where $1 = any(eans) limit 1`, [n])).rows[0] ?? null) : null
}

export async function cmedMeta(): Promise<{ total: number; published_on: string | null }> {
  const r = (await pool.query(`select count(*)::int as total, max(published_on)::text as published_on from cmed_products`)).rows[0]
  return { total: r.total, published_on: r.published_on }
}

export async function brandIcms(): Promise<Map<string, number | null>> {
  return new Map((await pool.query(`select id, icms_pct::float8 as icms from brands`)).rows.map((r) => [r.id as string, r.icms as number | null]))
}

export type Note = {
  id: string; kind: 'regra' | 'sazonalidade' | 'mercado' | 'preco'; title: string; summary: string; source_name: string; source_url: string; accessed_on: string
  confidence: 'alta' | 'media' | 'baixa'; tags: string[]; status: 'ativa' | 'arquivada'
}
export async function listNotes(f: { kind?: string; includeArchived?: boolean } = {}): Promise<Note[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.kind) { args.push(f.kind); w.push(`kind = $${args.length}`) }
  if (!f.includeArchived) w.push(`status = 'ativa'`)
  return (await pool.query(
    `select id, kind, title, summary, source_name, source_url, accessed_on::text as accessed_on, confidence, tags, status from research_notes ${w.length ? 'where ' + w.join(' and ') : ''}
      order by case kind when 'regra' then 0 when 'preco' then 1 when 'sazonalidade' then 2 else 3 end, title`, args)).rows
}
