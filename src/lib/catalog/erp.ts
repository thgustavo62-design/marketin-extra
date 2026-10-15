// Importação do cadastro de produtos a partir da planilha exportada do ERP (qualquer das duas lojas). Reimportar é seguro: atualiza sem duplicar.
import ExcelJS from 'exceljs'
import { pool, withTx } from '../db.ts'
import { detectErpColumns, isMedicine, normalizeName, parseEan, searchKey } from '../domain/catalog.ts'
import { invalidateCatalogIndex } from './store.ts'

export type ErpRow = { ean: string | null; description: string; code: string | null; group: string | null; ingredient: string | null; registroMs: string | null; stock: number | null }
export type ErpParse = { ok: true; rows: ErpRow[]; skipped: number } | { ok: false; error: string }

const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((x) => x.text).join('').trim()
    if (o.result != null) return String(o.result).trim()
    if (o.text != null) return String(o.text).trim()
    return ''
  }
  return String(v).trim()
}

const stockNum = (v: unknown): number | null => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null }

/** Lê a primeira aba que tenha as colunas "Descrição" e (Barras ou Código). Cabeçalho pode não estar na primeira linha. */
export async function parseErpXlsx(file: Buffer): Promise<ErpParse> {
  if (file.subarray(0, 2).toString('latin1') !== 'PK') return { ok: false, error: 'Não é uma planilha .xlsx. Exporte o cadastro do ERP em Excel (.xlsx).' }
  const rows: ErpRow[] = []
  let skipped = 0
  let found = false
  const wb = new ExcelJS.Workbook()
  try {
    // leitura completa (e não em fluxo): o leitor em fluxo do exceljs falha de vez em quando conforme a ordem das partes do arquivo
    await wb.xlsx.load(file as unknown as ArrayBuffer)
    for (const ws of wb.worksheets) {
      let cols: ReturnType<typeof detectErpColumns> | null = null
      let n = 0
      for (let r = 1; r <= ws.rowCount; r++) {
        const vals = Array.from((ws.getRow(r).values as unknown[]).slice(1), (v) => (v == null ? '' : v))
        if (!cols) {
          if (++n > 15) break
          const c = detectErpColumns(vals.map(text))
          if (c.desc != null && (c.ean != null || c.code != null)) { cols = c; found = true }
          continue
        }
        const description = text(vals[cols.desc!]).replace(/s+/g, ' ')
        if (description.length < 2) { skipped++; continue }
        rows.push({
          ean: cols.ean != null ? parseEan(vals[cols.ean]) : null,
          description: description.slice(0, 300),
          code: cols.code != null ? text(vals[cols.code]) || null : null,
          group: cols.group != null ? text(vals[cols.group]) || null : null,
          ingredient: cols.ingredient != null ? text(vals[cols.ingredient]) || null : null,
          registroMs: cols.ms != null ? text(vals[cols.ms]).replace(/D/g, '') || null : null,
          stock: cols.stock != null ? stockNum(vals[cols.stock]) : null,
        })
      }
      if (found) break
    }
  } catch (e) {
    console.error('[catalogo] erro lendo a planilha do ERP', e)
    return { ok: false, error: 'Não consegui ler a planilha (arquivo corrompido ou protegido).' + (process.env.CATALOGO_DEBUG ? ` ${String(e)}` : '') }
  }
  if (!found) return { ok: false, error: 'Não encontrei as colunas "Descrição" e "Barras" (ou "Código") na planilha. Confira se é a exportação de produtos do ERP.' }
  if (!rows.length) return { ok: false, error: 'A planilha não tem produtos.' }
  return { ok: true, rows, skipped }
}

type Merged = { ean: string | null; description: string; aliases: Set<string>; code: string | null; group: string | null; ingredient: string | null; registroMs: string | null; stock: number | null; key: string }

export type UpsertResult = { rows: number; unique: number; created: number; updated: number; withoutEan: number; enriched: number; medicines: number; outOfStock: number }

/** Junta linhas do mesmo produto (mesmo EAN; sem EAN, mesma descrição normalizada). A descrição mais longa vira a principal; as outras viram descrições alternativas. */
export function mergeErpRows(rows: ErpRow[]): Merged[] {
  const map = new Map<string, Merged>()
  for (const r of rows) {
    const key = r.ean ? `e:${r.ean}` : `n:${normalizeName(r.description)}`
    if (key === 'n:') continue
    const m = map.get(key)
    if (!m) { map.set(key, { ean: r.ean, description: r.description, aliases: new Set(), code: r.code, group: r.group, ingredient: r.ingredient, registroMs: r.registroMs, stock: r.stock, key }); continue }
    if (r.description !== m.description) {
      if (r.description.length > m.description.length) { m.aliases.add(m.description); m.description = r.description } else m.aliases.add(r.description)
    }
    if (r.stock != null) m.stock = (m.stock ?? 0) + r.stock
    m.code ??= r.code; m.group ??= r.group; m.ingredient ??= r.ingredient; m.registroMs ??= r.registroMs
  }
  return [...map.values()]
}

const BATCH = 500

export async function upsertProducts(rows: ErpRow[], userId: string | null): Promise<UpsertResult> {
  // só entra o que tem saldo em estoque (planilha sem a coluna de estoque entra inteira)
  const everything = mergeErpRows(rows)
  const merged = everything.filter((m) => m.stock == null || m.stock > 0)
  const result: UpsertResult = { rows: rows.length, unique: merged.length, created: 0, updated: 0, withoutEan: 0, enriched: 0, medicines: 0, outOfStock: everything.length - merged.length }
  for (let i = 0; i < merged.length; i += BATCH) {
    const all = merged.slice(i, i + BATCH)
    // laboratório, tarja e princípio ativo vêm da lista oficial da CMED quando o ERP não traz
    const allEans = all.map((m) => m.ean).filter((e): e is string => !!e)
    const cmed = new Map<string, { lab: string | null; tarja: string | null; substance: string | null; registro: string | null }>()
    if (allEans.length) {
      const r = await pool.query(`select e as ean, c.lab, c.tarja, c.substance, c.registro from cmed_products c, unnest(c.eans) e where c.eans && $1::text[] and e = any($1::text[])`, [allEans])
      for (const x of r.rows) cmed.set(x.ean, x)
    }
    // medicamento fica fora do banco de imagens
    const cmedEans = new Set(cmed.keys())
    const b = all.filter((m) => !isMedicine({ ean: m.ean, registroMs: m.registroMs, group: m.group }, cmedEans))
    result.medicines += all.length - b.length
    result.unique -= all.length - b.length
    result.withoutEan += b.filter((m) => !m.ean).length
    const eans = b.map((m) => m.ean).filter((e): e is string => !!e)
    // reimportar não pode apagar o que já se sabe do produto (outra loja pode trazer menos colunas): junta com o que já está no banco
    const known = new Map<string, { aliases: string[]; description: string; group_name: string | null; active_ingredient: string | null; manufacturer: string | null; registro_ms: string | null; tarja: string | null; erp_code: string | null }>()
    const keys = b.filter((m) => !m.ean).map((m) => normalizeName(m.description))
    const ex = await pool.query(
      `select ean, name_key, description, aliases, group_name, active_ingredient, manufacturer, registro_ms, tarja, erp_code from products
        where (ean is not null and ean = any($1::text[])) or (ean is null and name_key = any($2::text[]))`, [eans, keys])
    for (const x of ex.rows) known.set(x.ean ? `e:${x.ean}` : `n:${x.name_key}`, x)
    const items = b.map((m) => {
      const c = m.ean ? cmed.get(m.ean) : undefined
      if (c) result.enriched++
      const old = known.get(m.key)
      const aliases = [...new Set([...m.aliases, ...(old?.aliases ?? []), ...(old && old.description !== m.description ? [old.description] : [])])].filter((x) => x !== m.description).slice(0, 12)
      const manufacturer = c?.lab ?? old?.manufacturer ?? null
      const ingredient = m.ingredient ?? c?.substance ?? old?.active_ingredient ?? null
      const group = m.group ?? old?.group_name ?? null
      return {
        ean: m.ean, erp_code: m.code ?? old?.erp_code ?? null, description: m.description, aliases, name_key: normalizeName(m.description),
        search: searchKey(m.description, ...aliases, m.ean, manufacturer, ingredient, group),
        group_name: group, active_ingredient: ingredient, manufacturer, registro_ms: m.registroMs ?? c?.registro ?? old?.registro_ms ?? null, tarja: c?.tarja ?? old?.tarja ?? null,
      }
    })
    await withTx(async (db) => {
      const r = await db.query(
        `with ins as (
           insert into products (ean, erp_code, description, aliases, name_key, search, group_name, active_ingredient, manufacturer, registro_ms, tarja, source, created_by)
           select x.ean, x.erp_code, x.description, x.aliases, x.name_key, x.search, x.group_name, x.active_ingredient, x.manufacturer, x.registro_ms, x.tarja, 'erp', $2::uuid
             from jsonb_to_recordset($1::jsonb) as x(ean text, erp_code text, description text, aliases text[], name_key text, search text, group_name text, active_ingredient text, manufacturer text, registro_ms text, tarja text)
           on conflict (ean) where ean is not null do update set
             erp_code = coalesce(excluded.erp_code, products.erp_code), description = excluded.description,
             aliases = (select coalesce(array_agg(distinct a), '{}') from unnest(products.aliases || excluded.aliases || array[products.description]) a where a <> excluded.description),
             name_key = excluded.name_key, search = excluded.search,
             group_name = coalesce(excluded.group_name, products.group_name), active_ingredient = coalesce(excluded.active_ingredient, products.active_ingredient),
             manufacturer = coalesce(excluded.manufacturer, products.manufacturer), registro_ms = coalesce(excluded.registro_ms, products.registro_ms), tarja = coalesce(excluded.tarja, products.tarja),
             active = true, updated_at = now()
           returning (xmax = 0) as created)
         select count(*) filter (where created)::int as created, count(*) filter (where not created)::int as updated from ins`,
        [JSON.stringify(items.filter((x) => x.ean)), userId])
      result.created += r.rows[0].created; result.updated += r.rows[0].updated
      const noEan = items.filter((x) => !x.ean)
      if (noEan.length) {
        const r2 = await db.query(
          `with ins as (
             insert into products (ean, erp_code, description, aliases, name_key, search, group_name, active_ingredient, manufacturer, registro_ms, tarja, source, created_by)
             select null, x.erp_code, x.description, x.aliases, x.name_key, x.search, x.group_name, x.active_ingredient, x.manufacturer, x.registro_ms, x.tarja, 'erp', $2::uuid
               from jsonb_to_recordset($1::jsonb) as x(erp_code text, description text, aliases text[], name_key text, search text, group_name text, active_ingredient text, manufacturer text, registro_ms text, tarja text)
             on conflict (name_key) where ean is null do update set
               erp_code = coalesce(excluded.erp_code, products.erp_code), search = excluded.search, group_name = coalesce(excluded.group_name, products.group_name),
               active_ingredient = coalesce(excluded.active_ingredient, products.active_ingredient), registro_ms = coalesce(excluded.registro_ms, products.registro_ms), active = true, updated_at = now()
             returning (xmax = 0) as created)
           select count(*) filter (where created)::int as created, count(*) filter (where not created)::int as updated from ins`,
          [JSON.stringify(noEan), userId])
        result.created += r2.rows[0].created; result.updated += r2.rows[0].updated
      }
    })
  }
  invalidateCatalogIndex()
  return result
}
