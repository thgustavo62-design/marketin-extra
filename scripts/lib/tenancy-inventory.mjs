// Read-only inventory shared by the release check and disposable migration tests.
export async function tenancyInventory(client) {
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query("set local statement_timeout='15s'");
    const has = async (table, column) =>
      (
        await client.query(
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2)as present",
          [table, column],
        )
      ).rows[0].present;
    const modern = await has("companies", "owner_id"),
      table = modern ? "companies" : "brands";
    const companies = (
      await client.query(
        `select id,slug,name,${modern ? "owner_id" : "null::uuid as owner_id"} from ${table} order by slug`,
      )
    ).rows;
    const counts = {};
    for (const table of [
      "branches",
      "products",
      "product_images",
      "promo_campaigns",
      "promo_items",
      "promo_themes",
      "promo_theme_assets",
      "media_assets",
      "media_blobs",
      "promo_library",
      "studio_pages",
    ]) {
      counts[table] = Number(
        (await client.query(`select count(*)as total from ${table}`)).rows[0]
          .total,
      );
    }
    const assigned = await has("products", "company_id");
    const catalog = (
      await client.query(`with usage as(
   select i.product_id,c.brand_id from promo_items i join promo_campaigns c on c.id=i.campaign_id where i.product_id is not null and c.brand_id is not null
   union select x.product_id,p.brand_id from post_products x join posts p on p.id=x.post_id where p.brand_id is not null
  ), grouped as(select product_id,count(distinct brand_id)as companies from usage group by product_id)
  select count(*)::int as total,count(*)filter(where ${assigned ? "p.company_id is null" : "true"})::int as unassigned,
   count(*)filter(where coalesce(g.companies,0)=0)::int as without_usage,
   count(*)filter(where g.companies=1)::int as used_by_one_company,
   count(*)filter(where g.companies>1)::int as shared_between_companies
  from products p left join grouped g on g.product_id=p.id`)
    ).rows[0];
    const readOnly =
      (
        await client.query(
          "select current_setting('transaction_read_only')as value",
        )
      ).rows[0].value === "on";
    await client.query("commit");
    return {
      readOnly,
      schema: modern ? "owner-hierarchy" : "legacy-brands",
      companies: companies.map((c) => ({
        ...c,
        ownership: c.owner_id
          ? "confirmed"
          : "requires-administrative-confirmation",
      })),
      counts,
      catalog,
      automaticOwnerAssignments: 0,
      automaticCatalogAssignments: 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
