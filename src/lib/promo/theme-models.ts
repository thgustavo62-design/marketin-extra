import { pool, withTx } from "../db";
import { normalizeTheme } from "../domain/promo";
import { normalizeLayers } from "../domain/promo-layers";
export async function duplicateThemeModel(id: string, userId: string) {
  return withTx(async (db) => {
    const t = (await db.query("select * from promo_themes where id=$1", [id]))
      .rows[0];
    if (!t) throw Error("Modelo não encontrado.");
    const name = `${t.name.slice(0, 56)} · cópia ${Date.now().toString().slice(-6)}`;
    const n = (
      await db.query(
        "insert into promo_themes(name,config,created_by,category) values($1,$2::jsonb,$3,$4) returning id",
        [name, JSON.stringify(t.config), userId, t.category],
      )
    ).rows[0].id;
    await db.query(
      "insert into promo_theme_assets(theme_id,role,format,data,mime,width,height,sha256) select $2,role,format,data,mime,width,height,sha256 from promo_theme_assets where theme_id=$1",
      [id, n],
    );
    const arts = (
      await db.query("select * from promo_theme_arts where theme_id=$1", [id])
    ).rows;
    let fixed = JSON.stringify(t.fixed ?? {});
    for (const a of arts) {
      const copied = (
        await db.query(
          "insert into promo_theme_arts(theme_id,name,kind,data,mime,width,height,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
          [
            n,
            a.name,
            a.kind,
            a.data,
            a.mime,
            a.width,
            a.height,
            a.sha256,
            userId,
          ],
        )
      ).rows[0].id;
      fixed = fixed.split(a.id).join(copied);
    }
    await db.query("update promo_themes set fixed=$2::jsonb where id=$1", [
      n,
      fixed,
    ]);
    return n as string;
  });
}
export async function versionThemeModel(id: string, userId: string) {
  return withTx(async (db) => {
    const t = (
      await db.query(
        "select name,config,fixed,category,version from promo_themes where id=$1 for update",
        [id],
      )
    ).rows[0];
    if (!t) return;
    await db.query(
      "insert into promo_theme_versions(theme_id,version,snapshot,created_by) values($1,$2,$3::jsonb,$4) on conflict do nothing",
      [id, t.version, JSON.stringify(t), userId],
    );
    await db.query("update promo_themes set version=version+1 where id=$1", [
      id,
    ]);
  });
}
export async function themeModelMetadata(id: string) {
  const r = (
    await pool.query(
      "select active,category,version from promo_themes where id=$1",
      [id],
    )
  ).rows[0];
  return r ?? null;
}
export async function importThemeConfig(
  name: string,
  raw: unknown,
  userId: string,
) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const config = normalizeTheme(r.config ?? r);
  return (
    await pool.query(
      "insert into promo_themes(name,config,created_by) values($1,$2::jsonb,$3) returning id",
      [
        name.trim().slice(0, 70) || "Layout importado",
        JSON.stringify(config),
        userId,
      ],
    )
  ).rows[0].id as string;
}
