// Promoções: temas (artes), campanhas e itens. Importações com .ts para rodar também em scripts do Node.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { pool, withTx } from '../db.ts'
import { displayName, normalizeTheme, PROMO_FORMAT_KEYS, type PromoFormat, type PromoRow, type ThemeConfig } from '../domain/promo.ts'
import { groupItems, groupSummary, type GroupInput, type Variants } from '../domain/promo-group.ts'
import { sniffImage } from '../catalog/images.ts'

export type ThemeRole = 'background' | 'header' | 'footer' | 'badge' | 'tag'
export const THEME_ROLES: ThemeRole[] = ['background', 'header', 'footer', 'badge', 'tag']
export type ThemeAsset = { role: ThemeRole; format: PromoFormat; width: number; height: number }
export type Theme = { id: string; name: string; config: ThemeConfig; assets: ThemeAsset[] }
export type ThemeLite = { id: string; name: string; assets: number }

export async function listThemes(): Promise<ThemeLite[]> {
  return (await pool.query(`select t.id, t.name, (select count(*)::int from promo_theme_assets a where a.theme_id = t.id) as assets from promo_themes t order by t.name`)).rows
}

export async function getTheme(id: string): Promise<Theme | null> {
  const t = (await pool.query(`select id, name, config from promo_themes where id = $1`, [id])).rows[0]
  if (!t) return null
  const assets = (await pool.query(`select role, format, width, height from promo_theme_assets where theme_id = $1`, [id])).rows as ThemeAsset[]
  return { id: t.id, name: t.name, config: normalizeTheme(t.config), assets }
}

export async function createTheme(name: string, userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 80) return { ok: false, error: 'O nome do tema deve ter de 2 a 80 caracteres.' }
  try {
    const r = await pool.query(`insert into promo_themes (name, config, created_by) values ($1, '{}'::jsonb, $2) returning id`, [n, userId])
    return { ok: true, id: r.rows[0].id }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, error: 'Já existe um tema com este nome.' }
    throw e
  }
}

export async function saveThemeConfig(id: string, name: string, config: unknown): Promise<{ ok: boolean; error?: string }> {
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 80) return { ok: false, error: 'O nome do tema deve ter de 2 a 80 caracteres.' }
  try {
    const r = await pool.query(`update promo_themes set name = $2, config = $3::jsonb, updated_at = now() where id = $1`, [id, n, JSON.stringify(normalizeTheme(config))])
    return r.rowCount ? { ok: true } : { ok: false, error: 'Tema não encontrado.' }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, error: 'Já existe um tema com este nome.' }
    throw e
  }
}

export async function deleteTheme(id: string): Promise<void> {
  await pool.query(`delete from promo_themes where id = $1`, [id])
}

const MAX_ART_BYTES = 6 * 1024 * 1024
/** Guarda a arte de um tema (cabeçalho, rodapé, fundo ou selo) para um formato: valida, limita a 2400 px de largura e converte para WEBP mantendo a transparência. */
export async function setThemeAsset(themeId: string, role: ThemeRole, format: PromoFormat, buf: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!THEME_ROLES.includes(role) || !PROMO_FORMAT_KEYS.includes(format)) return { ok: false, error: 'Arte ou formato inválido.' }
  if (buf.length === 0) return { ok: false, error: 'Arquivo vazio.' }
  if (buf.length > MAX_ART_BYTES) return { ok: false, error: 'A arte passa de 6 MB.' }
  if (!sniffImage(buf)) return { ok: false, error: 'Use uma imagem PNG, JPG ou WEBP.' }
  try {
    const out = await sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 95 }).toBuffer({ resolveWithObject: true })
    const sha = createHash('sha256').update(out.data).digest('hex')
    const r = await pool.query(
      `insert into promo_theme_assets (theme_id, role, format, data, mime, width, height, sha256) select $1, $2, $3, $4, 'image/webp', $5, $6, $7 where exists (select 1 from promo_themes where id = $1)
       on conflict (theme_id, role, format) do update set data = excluded.data, mime = excluded.mime, width = excluded.width, height = excluded.height, sha256 = excluded.sha256, updated_at = now() returning theme_id`,
      [themeId, role, format, out.data, out.info.width, out.info.height, sha])
    return r.rowCount ? { ok: true } : { ok: false, error: 'Tema não encontrado.' }
  } catch {
    return { ok: false, error: 'Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).' }
  }
}

/**
 * Divide uma arte completa em branco (sem produtos nem preços): o topo vira o cabeçalho, a base vira o rodapé e a imagem inteira fica de fundo.
 * As alturas são em pixels da imagem enviada.
 */
export async function splitThemeArt(themeId: string, format: PromoFormat, buf: Buffer, headerPx: number, footerPx: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sniffImage(buf)) return { ok: false, error: 'Use uma imagem PNG, JPG ou WEBP.' }
  try {
    const meta = await sharp(buf, { limitInputPixels: 60_000_000 }).metadata()
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (!w || !h) return { ok: false, error: 'Não consegui ler a imagem.' }
    const hp = Math.round(headerPx), fp = Math.round(footerPx)
    if (!(hp >= 0 && fp >= 0 && hp + fp < h - 100)) return { ok: false, error: 'As alturas do cabeçalho e do rodapé não cabem na imagem (sobra menos de 100 px no meio).' }
    const png = await sharp(buf, { failOn: 'error' }).rotate().png().toBuffer()
    const cut = (top: number, height: number) => sharp(png).extract({ left: 0, top, width: w, height }).png().toBuffer()
    const parts: [ThemeRole, Buffer][] = [['background', png]]
    if (hp > 0) parts.push(['header', await cut(0, hp)])
    if (fp > 0) parts.push(['footer', await cut(h - fp, fp)])
    for (const [role, b] of parts) { const r = await setThemeAsset(themeId, role, format, b); if (!r.ok) return r }
    if (hp === 0) await deleteThemeAsset(themeId, 'header', format)
    if (fp === 0) await deleteThemeAsset(themeId, 'footer', format)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).' }
  }
}

export async function deleteThemeAsset(themeId: string, role: ThemeRole, format: PromoFormat): Promise<void> {
  await pool.query(`delete from promo_theme_assets where theme_id = $1 and role = $2 and format = $3`, [themeId, role, format])
}

export async function getThemeAsset(themeId: string, role: string, format: string): Promise<{ data: Buffer; mime: string; sha: string } | null> {
  const r = (await pool.query(`select data, mime, sha256 from promo_theme_assets where theme_id = $1 and role = $2 and format = $3`, [themeId, role, format])).rows[0]
  return r ? { data: r.data, mime: r.mime, sha: r.sha256 } : null
}

// ---------- campanhas ----------
export type CampaignStatus = 'rascunho' | 'aprovada'
export type CampaignLite = { id: string; name: string; theme_name: string | null; items: number; status: CampaignStatus; created_at: string }
export type ImportReport = {
  /** linhas válidas da planilha */ lines: number
  /** encartes depois do agrupamento */ encartes: number
  gruposTamanho: number; gruposOpcoes: number; grouped: boolean
  sheets: { name: string; items: number }[]
  /** códigos que não estão no catálogo de produtos (sem foto) */ notInCatalog: { ean: string; name: string }[]
  /** encartes sem nenhuma foto no banco de imagens */ withoutPhoto: { ean: string; name: string }[]
  /** linhas com problema na planilha (código ou valor inválido, repetição, aba ignorada) */ rowErrors: { line: number; message: string }[]
  /** linhas que não entraram (sem descrição) */ skipped: { ean: string; reason: string }[]
}
export type Campaign = {
  id: string; name: string; theme_id: string | null; title: string | null; validity: string | null
  status: CampaignStatus; approved_by_name: string | null; approved_at: string | null; import_report: ImportReport | null; group_variants: boolean
}
export type PromoItem = {
  id: string; position: number; ean: string | null; product_id: string | null; name: string; price: number
  section: string | null; variants: Variants | null; photo_image_id: string | null; /** foto usada na arte (a escolhida ou a principal do produto) */ photo_id: string | null
  /** todas as fotos do produto, para trocar */ photos: string[]
}

export async function listCampaigns(): Promise<CampaignLite[]> {
  return (await pool.query(
    `select c.id, c.name, t.name as theme_name, (select count(*)::int from promo_items i where i.campaign_id = c.id) as items, c.status, c.created_at::text as created_at
       from promo_campaigns c left join promo_themes t on t.id = c.theme_id order by c.created_at desc limit 100`)).rows
}

/** Qualquer mudança nos encartes tira a aprovação: quem mexeu precisa aprovar de novo. */
async function touch(db: { query: (sql: string, args?: unknown[]) => Promise<unknown> }, campaignId: string): Promise<void> {
  await db.query(`update promo_campaigns set updated_at = now(), status = 'rascunho', approved_by = null, approved_at = null where id = $1`, [campaignId])
}

/**
 * Cria a promoção a partir das linhas da planilha. Só entram código de barras, descrição e valor aproximado: o nome do encarte é a descrição da planilha
 * (ou a do catálogo, se a planilha não trouxe), o preço é o valor da planilha e a foto vem do banco de imagens pelo código. Com `groupVariants`, produtos que só mudam
 * de tamanho ou de fragrância viram um encarte só (política de encartes).
 */
export async function createCampaignFromRows(o: {
  name: string; themeId: string | null; title: string | null; validity: string | null; rows: PromoRow[]; userId: string
  groupVariants?: boolean; sheets?: { name: string; items: number }[]; rowErrors?: { line: number; message: string }[]
}): Promise<{ ok: true; id: string; report: ImportReport } | { ok: false; error: string }> {
  const name = o.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'O nome da promoção deve ter de 2 a 120 caracteres.' }
  if (!o.rows.length) return { ok: false, error: 'A planilha não tem nenhuma linha válida.' }
  const prods = (await pool.query(
    `select p.id, p.ean, p.description, (select i.id from product_images i where i.product_id = p.id order by i.is_primary desc, i.created_at limit 1) as photo from products p where p.active and p.ean = any($1::text[])`, [o.rows.map((r) => r.ean)])).rows
  const byEan = new Map(prods.map((p) => [p.ean as string, p]))
  const skipped: ImportReport['skipped'] = []
  const inputs: GroupInput[] = []
  for (const r of o.rows) {
    const desc = r.name ?? byEan.get(r.ean)?.description ?? null
    if (!desc) { skipped.push({ ean: r.ean, reason: 'sem descrição na planilha e fora do catálogo' }); continue }
    inputs.push({ ean: r.ean, name: displayName(desc), price: r.price, section: r.section })
  }
  if (!inputs.length) return { ok: false, error: 'Nenhuma linha tem descrição. Confira se a planilha tem a coluna "Descrição".' }
  const grouped = o.groupVariants !== false
  const encartes = groupItems(inputs, grouped)
  const notInCatalog = inputs.filter((x) => !byEan.has(x.ean)).map((x) => ({ ean: x.ean, name: x.name }))
  const withoutPhoto: ImportReport['withoutPhoto'] = []
  const rows = encartes.map((e, k) => {
    // o encarte usa a foto do primeiro membro que tiver; sem foto em nenhum, usa o produto do primeiro (se estiver no catálogo)
    const member = e.eans.map((x) => byEan.get(x)).find((p) => p?.photo) ?? e.eans.map((x) => byEan.get(x)).find(Boolean) ?? null
    if (!member?.photo) withoutPhoto.push({ ean: e.ean, name: e.name })
    return { pos: k + 1, ean: e.ean, product_id: member?.id ?? null, name: e.name, price: e.price, section: e.section, variants: e.variants }
  })
  const sum = groupSummary(inputs.length, encartes)
  const report: ImportReport = { lines: sum.linhas, encartes: sum.encartes, gruposTamanho: sum.gruposTamanho, gruposOpcoes: sum.gruposOpcoes, grouped, sheets: o.sheets ?? [], notInCatalog: notInCatalog.slice(0, 200), withoutPhoto: withoutPhoto.slice(0, 200), rowErrors: (o.rowErrors ?? []).slice(0, 100), skipped: skipped.slice(0, 100) }
  const id = await withTx(async (db) => {
    const c = await db.query(`insert into promo_campaigns (name, theme_id, title, validity, created_by, import_report, group_variants) values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id`, [name, o.themeId, o.title, o.validity, o.userId, JSON.stringify(report), grouped])
    await db.query(
      `insert into promo_items (campaign_id, position, ean, product_id, name, price, section, variants)
       select $1, x.pos, x.ean, x.product_id, x.name, x.price, x.section, x.variants from jsonb_to_recordset($2::jsonb) as x(pos int, ean text, product_id uuid, name text, price numeric, section text, variants jsonb)`,
      [c.rows[0].id, JSON.stringify(rows)])
    return c.rows[0].id as string
  })
  return { ok: true, id, report }
}

export async function getCampaign(id: string): Promise<{ campaign: Campaign; theme: Theme | null; items: PromoItem[] } | null> {
  const c = (await pool.query(
    `select c.id, c.name, c.theme_id, c.title, c.validity, c.status, u.display_name as approved_by_name, c.approved_at::text as approved_at, c.import_report, c.group_variants
       from promo_campaigns c left join users u on u.id = c.approved_by where c.id = $1`, [id])).rows[0]
  if (!c) return null
  const rows = (await pool.query(
    `select i.id, i.position, i.ean, i.product_id, i.name, i.price::float8 as price, i.section, i.variants, i.photo_image_id,
            coalesce(i.photo_image_id, (select m.id from product_images m where m.product_id = i.product_id order by m.is_primary desc, m.created_at limit 1)) as photo_id,
            coalesce((select array_agg(m.id order by m.is_primary desc, m.created_at) from product_images m where m.product_id = i.product_id), '{}') as photos
       from promo_items i where i.campaign_id = $1 order by i.position`, [id])).rows
  return { campaign: c, theme: c.theme_id ? await getTheme(c.theme_id) : null, items: rows }
}

export async function updateCampaign(id: string, v: { name: string; title: string | null; validity: string | null; themeId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const name = v.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'O nome da promoção deve ter de 2 a 120 caracteres.' }
  const r = await pool.query(`update promo_campaigns set name = $2, title = $3, validity = $4, theme_id = $5 where id = $1`, [id, name, v.title, v.validity, v.themeId])
  if (!r.rowCount) return { ok: false, error: 'Promoção não encontrada.' }
  await touch(pool, id)
  return { ok: true }
}

export async function deleteCampaign(id: string): Promise<void> {
  await pool.query(`delete from promo_campaigns where id = $1`, [id])
}

/** Aprova os encartes: guarda quem aprovou e quando. Qualquer edição depois disso volta para rascunho. */
export async function approveCampaign(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(`update promo_campaigns set status = 'aprovada', approved_by = $2, approved_at = now(), updated_at = now() where id = $1 and exists (select 1 from promo_items where campaign_id = $1)`, [id, userId])
  return r.rowCount ? { ok: true } : { ok: false, error: 'Promoção não encontrada ou sem encartes.' }
}

export type SizeEdit = { label: string; units: number | null }

export async function updateItem(itemId: string, v: { name: string; price: number; photoImageId: string | null; sizes?: SizeEdit[] }): Promise<{ ok: boolean; error?: string }> {
  const name = displayName(v.name)
  if (!name || name.length > 160) return { ok: false, error: 'O nome deve ter de 1 a 160 caracteres.' }
  if (!(v.price >= 0 && v.price < 100000)) return { ok: false, error: 'Preço inválido.' }
  return withTx(async (db) => {
    const cur = (await db.query(`select campaign_id, variants from promo_items where id = $1 for update`, [itemId])).rows[0]
    if (!cur) return { ok: false, error: 'Item não encontrado.' }
    let variants = cur.variants as Variants | null
    // tabela de tamanhos: a pessoa pode corrigir o nome do tamanho e as unidades (mesma quantidade de linhas)
    if (v.sizes && variants?.kind === 'sizes') {
      if (v.sizes.length !== variants.rows.length) return { ok: false, error: 'A tabela de tamanhos mudou. Recarregue a página.' }
      const rows = variants.rows.map((r, i) => {
        const label = String(v.sizes![i].label ?? '').toUpperCase().replace(/[^A-Z0-9/+-]/g, '').slice(0, 6) || r.label
        const u = v.sizes![i].units
        return { ...r, label, units: u === null || u === undefined || !Number.isFinite(Number(u)) || Number(u) < 0 || Number(u) > 9999 ? null : Math.round(Number(u)) }
      })
      variants = { kind: 'sizes', rows }
    }
    // a foto escolhida precisa ser do mesmo produto
    await db.query(
      `update promo_items i set name = $2, price = $3, variants = $5::jsonb, photo_image_id = case when $4::uuid is not null and exists (select 1 from product_images m where m.id = $4 and m.product_id = i.product_id) then $4 else null end where i.id = $1`,
      [itemId, name, v.price, v.photoImageId, variants ? JSON.stringify(variants) : null])
    await touch(db, cur.campaign_id)
    return { ok: true }
  })
}

export async function removeItem(itemId: string): Promise<void> {
  await withTx(async (db) => {
    const it = (await db.query(`delete from promo_items where id = $1 returning campaign_id, position`, [itemId])).rows[0]
    if (it) { await db.query(`update promo_items set position = position - 1 where campaign_id = $1 and position > $2`, [it.campaign_id, it.position]); await touch(db, it.campaign_id) }
  })
}

/** Move um item uma posição para cima (-1) ou para baixo (+1). */
export async function moveItem(itemId: string, dir: -1 | 1): Promise<void> {
  await withTx(async (db) => {
    const it = (await db.query(`select campaign_id, position from promo_items where id = $1 for update`, [itemId])).rows[0]
    if (!it) return
    const other = (await db.query(`select id from promo_items where campaign_id = $1 and position = $2 for update`, [it.campaign_id, it.position + dir])).rows[0]
    if (!other) return
    // posição temporária para não bater na regra de unicidade
    await db.query(`update promo_items set position = -1 where id = $1`, [itemId])
    await db.query(`update promo_items set position = $2 where id = $1`, [other.id, it.position])
    await db.query(`update promo_items set position = $2 where id = $1`, [itemId, it.position + dir])
    await touch(db, it.campaign_id)
  })
}

export async function addItem(campaignId: string, productId: string, price: number): Promise<{ ok: boolean; error?: string }> {
  if (!(price >= 0 && price < 100000)) return { ok: false, error: 'Preço inválido.' }
  return withTx(async (db) => {
    const p = (await db.query(`select id, ean, description from products where id = $1 and active`, [productId])).rows[0]
    if (!p) return { ok: false, error: 'Produto não encontrado.' }
    if (!(await db.query(`select 1 from promo_campaigns where id = $1`, [campaignId])).rowCount) return { ok: false, error: 'Promoção não encontrada.' }
    const pos = ((await db.query(`select coalesce(max(position), 0) + 1 as n from promo_items where campaign_id = $1`, [campaignId])).rows[0].n) as number
    await db.query(`insert into promo_items (campaign_id, position, ean, product_id, name, price) values ($1, $2, $3, $4, $5, $6)`, [campaignId, pos, p.ean, p.id, displayName(p.description), price])
    await touch(db, campaignId)
    return { ok: true }
  })
}

/** Define a ordem dos produtos da promoção (a lista precisa ter exatamente os mesmos itens). Usada ao arrastar na peça ou na lista. */
export async function reorderItems(campaignId: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const cur = (await db.query(`select id from promo_items where campaign_id = $1 for update`, [campaignId])).rows.map((r) => r.id as string)
    if (cur.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((i) => cur.includes(i))) return { ok: false, error: 'A lista de produtos mudou. Recarregue a página e tente de novo.' }
    // posições temporárias negativas: a regra de unicidade (campanha, posição) não pode bater no meio da troca
    await db.query(`update promo_items set position = -position - 1 where campaign_id = $1`, [campaignId])
    await db.query(`update promo_items i set position = u.ord from unnest($2::uuid[]) with ordinality as u(id, ord) where i.id = u.id and i.campaign_id = $1`, [campaignId, ids])
    await touch(db, campaignId)
    return { ok: true }
  })
}

/** Desfaz um encarte agrupado: cada produto do grupo volta a ser um encarte próprio, logo depois do original. */
export async function ungroupItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const it = (await db.query(`select campaign_id, position, price, section, variants from promo_items where id = $1 for update`, [itemId])).rows[0]
    if (!it || !it.variants) return { ok: false, error: 'Este encarte não é um grupo.' }
    const v = it.variants as Variants
    const members: { ean: string; name: string }[] = v.kind === 'sizes' ? v.rows.map((r) => ({ ean: r.ean, name: r.name })) : v.members.map((m) => ({ ean: m.ean, name: m.name }))
    if (members.length < 2) return { ok: false, error: 'Este encarte não é um grupo.' }
    const prods = (await db.query(`select id, ean from products where ean = any($1::text[]) and active`, [members.map((m) => m.ean)])).rows
    const pid = new Map(prods.map((p) => [p.ean as string, p.id as string]))
    const extra = members.length - 1
    // abre espaço (posições temporárias negativas para não bater na unicidade) e insere os outros membros logo depois
    await db.query(`update promo_items set position = -position - 1 where campaign_id = $1 and position > $2`, [it.campaign_id, it.position])
    await db.query(`update promo_items set position = -position - 1 + $3 where campaign_id = $1 and position < 0 and -position - 1 > $2`, [it.campaign_id, it.position, extra])
    await db.query(`update promo_items set name = $2, ean = $3, product_id = $4, variants = null, photo_image_id = null where id = $1`, [itemId, displayName(members[0].name), members[0].ean, pid.get(members[0].ean) ?? null])
    for (let k = 1; k < members.length; k++) {
      await db.query(`insert into promo_items (campaign_id, position, ean, product_id, name, price, section) values ($1, $2, $3, $4, $5, $6, $7)`, [it.campaign_id, it.position + k, members[k].ean, pid.get(members[k].ean) ?? null, displayName(members[k].name), it.price, it.section])
    }
    await touch(db, it.campaign_id)
    return { ok: true }
  })
}
