import { pool } from "../db";
import { getSession } from "../session";
import { brandAllowed } from "../perms";
import { isUuid } from "../form";
export async function campaignAccess(
  id: string,
  itemId?: string,
): Promise<boolean> {
  if (!isUuid(id) || (itemId !== undefined && !isUuid(itemId))) return false;
  const user = await getSession();
  if (!user || user.mustChange) return false;
  const r = (
    await pool.query("select brand_id from promo_campaigns where id=$1", [id])
  ).rows[0];
  if (!r || (r.brand_id && !brandAllowed(user, r.brand_id))) return false;
  return (
    itemId === undefined ||
    !!(
      await pool.query(
        "select 1 from promo_items where id=$1 and campaign_id=$2",
        [itemId, id],
      )
    ).rowCount
  );
}
export async function itemAccess(itemId: string) {
  if (!isUuid(itemId)) return false;
  const r = (
    await pool.query("select campaign_id from promo_items where id=$1", [
      itemId,
    ])
  ).rows[0];
  return !!r && (await campaignAccess(r.campaign_id, itemId));
}
