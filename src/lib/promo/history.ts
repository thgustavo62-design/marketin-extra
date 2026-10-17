// Histórico da arte: registro de alterações dos encartes e versões (retratos) dos elementos/fundo/textos com restauração.
import { pool, withTx } from '../db.ts'

type Db = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> } // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_VERSIONS = 60

export type AuditRow = { id: number; item_name: string; field: string; old_value: string | null; new_value: string | null; at: string; user_name: string | null }
export type VersionRow = { id: string; kind: 'manual' | 'aprovacao' | 'auto' | 'antes-de-restaurar'; label: string | null; created_at: string; user_name: string | null; elements: number }

const brl = (n: number | null | undefined) => (n === null || n === undefined ? null : `R$ ${Number(n).toFixed(2).replace('.', ',')}`)
export const money = brl

/** Anota uma mudança num encarte (quem, quando, de quê para quê). */
export async function logItemChange(db: Db, o: { campaignId: string; itemId: string | null; itemName: string; userId: string | null; field: string; oldV: string | null; newV: string | null }): Promise<void> {
  await db.query(`insert into promo_item_audit (campaign_id, item_id, item_name, user_id, field, old_value, new_value) values ($1, $2, $3, $4, $5, $6, $7)`, [o.campaignId, o.itemId, o.itemName.slice(0, 160), o.userId, o.field, o.oldV, o.newV])
}

export async function listAudit(campaignId: string, limit = 100): Promise<AuditRow[]> {
  return (await pool.query(
    `select a.id, a.item_name, a.field, a.old_value, a.new_value, a.at::text as at, u.display_name as user_name
       from promo_item_audit a left join users u on u.id = a.user_id where a.campaign_id = $1 order by a.at desc, a.id desc limit $2`, [campaignId, limit])).rows
}

/** Tira um retrato dos elementos, do fundo/textos e do número de peças. Guarda as 60 versões mais novas. */
export async function snapshotVersion(db: Db, campaignId: string, kind: VersionRow['kind'], label: string | null, userId: string | null): Promise<string | null> {
  const r = await db.query(
    `insert into promo_versions (campaign_id, kind, label, layers, overrides, design_pages, created_by)
     select id, $2, $3, layers, overrides, design_pages, $4 from promo_campaigns where id = $1 returning id`, [campaignId, kind, label ? label.slice(0, 80) : null, userId])
  await db.query(`delete from promo_versions where id in (select id from promo_versions where campaign_id = $1 order by created_at desc, id offset ${MAX_VERSIONS})`, [campaignId])
  return r.rows[0]?.id ?? null
}

/** Retrato automático no máximo a cada 20 minutos de edição (para sempre haver um ponto de volta recente). */
export async function autoSnapshot(db: Db, campaignId: string, userId: string | null): Promise<void> {
  const recent = await db.query(`select 1 from promo_versions where campaign_id = $1 and kind = 'auto' and created_at > now() - interval '20 minutes'`, [campaignId])
  if (!recent.rowCount) await snapshotVersion(db, campaignId, 'auto', null, userId)
}

export async function listVersions(campaignId: string): Promise<VersionRow[]> {
  return (await pool.query(
    `select v.id, v.kind, v.label, v.created_at::text as created_at, u.display_name as user_name,
            coalesce((select sum(jsonb_array_length(e.value))::int from jsonb_each(coalesce(v.layers, '{}'::jsonb)) e where jsonb_typeof(e.value) = 'array'), 0) as elements
       from promo_versions v left join users u on u.id = v.created_by where v.campaign_id = $1 order by v.created_at desc, v.id limit ${MAX_VERSIONS}`, [campaignId])).rows
}

export async function createManualVersion(campaignId: string, label: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await pool.query(`select 1 from promo_campaigns where id = $1`, [campaignId])).rowCount) return { ok: false, error: 'Não encontrado.' }
  await snapshotVersion(pool, campaignId, 'manual', label.trim() || 'Versão salva', userId)
  return { ok: true }
}

/**
 * Volta os elementos, o fundo e os textos para o retrato escolhido. Antes, guarda o estado atual (dá para desfazer a restauração).
 * A promoção volta para "em edição" e quem estiver com a tela aberta recebe o aviso de edição simultânea.
 */
export async function restoreVersion(campaignId: string, versionId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const v = (await db.query(`select layers, overrides, design_pages from promo_versions where id = $1 and campaign_id = $2`, [versionId, campaignId])).rows[0]
    if (!v) return { ok: false, error: 'Versão não encontrada.' }
    await snapshotVersion(db, campaignId, 'antes-de-restaurar', 'Antes de restaurar uma versão', userId)
    await db.query(
      `update promo_campaigns set layers = $2::jsonb, overrides = $3::jsonb, design_pages = case when kind = 'design' and $4::int is not null then $4 else design_pages end,
              layers_rev = layers_rev + 1, updated_at = now(), status = 'rascunho', approved_by = null, approved_at = null where id = $1`,
      [campaignId, v.layers === null ? null : JSON.stringify(v.layers), v.overrides === null ? null : JSON.stringify(v.overrides), v.design_pages])
    return { ok: true }
  })
}
