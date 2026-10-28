import { withTx } from "../db";
/** Installs the user-supplied package using the caller's actual company/session permissions. */
export async function prepareReferenceIdentity(
  companyId: string,
  userId: string,
) {
  return withTx(async (db) => {
    const c = (
      await db.query(
        "select id from companies where id=$1 and slug='minas-farma' and nova7_private.manage_company(id)",
        [companyId],
      )
    ).rows[0];
    if (!c) return;
    const t = (
      await db.query(
        "select id,name,config,fixed,category,version from promo_themes where company_id=$1 and official_code='CP-MF-006' for update",
        [c.id],
      )
    ).rows[0];
    if (!t || t.config?.referencePackage === "minas-corta-20261028") return;
    const { default: assets } = await import("./minas-reference-assets.json");
    await db.query(
      "insert into promo_theme_versions(theme_id,version,snapshot,created_by)values($1,$2,$3::jsonb,$4)on conflict do nothing",
      [t.id, t.version, JSON.stringify(t), userId],
    );
    for (const a of assets)
      await db.query(
        "insert into promo_theme_assets(theme_id,role,format,data,mime,width,height,sha256)values($1,'header',$2,$3,'image/webp',$4,$5,$6)on conflict(theme_id,role,format)do update set data=excluded.data,mime=excluded.mime,width=excluded.width,height=excluded.height,sha256=excluded.sha256",
        [
          t.id,
          a.format,
          Buffer.from(a.base64, "base64"),
          a.width,
          a.height,
          a.sha,
        ],
      );
    const config = {
      ...t.config,
      referencePackage: "minas-corta-20261028",
      colors: {
        ...t.config.colors,
        skyTop: "#092875",
        skyBottom: "#102e80",
        footer: "#092875",
      },
      grid: { ...t.config.grid, a4: { cols: 3, rows: 4 } },
      footerLines: [
        "Minas Farma · Baixo Guandu e Aimorés",
        "WhatsApp (27) 99983-3947",
      ],
    };
    await db.query(
      "update promo_themes set config=$2::jsonb,version=version+1 where id=$1",
      [t.id, JSON.stringify(config)],
    );
    await db.query(
      "update campaign_components set config=$2::jsonb where theme_id=$1 and code='CP-MF-006'",
      [t.id, JSON.stringify(config)],
    );
  });
}
