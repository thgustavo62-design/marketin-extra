import assert from "node:assert/strict";
import { tenancyInventory } from "../../scripts/lib/tenancy-inventory.mjs";

// Seed only the disposable pre-migration database. No owner is invented for legacy brands.
export async function seedLegacyTenancy(db) {
  const brands = (
    await db.query("select id,slug,name from brands order by slug")
  ).rows;
  const user = (
    await db.query(
      "insert into users(username,username_normalized,display_name,password_hash,role)values('legacy_admin','legacy_admin','Legacy admin','fixture','admin')returning id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "insert into products(description,name_key,search)values('PRODUTO LEGADO COMPARTILHADO','legacy-shared','legacy shared')returning id",
    )
  ).rows[0].id;
  const image = (
    await db.query(
      "insert into product_images(product_id,data,thumb,width,height,size_bytes,sha256,source)values($1,decode('01020304','hex'),decode('01020304','hex'),1,1,4,repeat('d',64),'upload')returning id",
      [product],
    )
  ).rows[0].id;
  const campaigns = [],
    branches = [];
  for (const [i, b] of brands.entries()) {
    branches.push(
      (
        await db.query(
          "insert into branches(brand_id,name)values($1,'Filial legada preservada')returning id,brand_id,name",
          [b.id],
        )
      ).rows[0],
    );
    const campaign = (
      await db.query(
        "insert into promo_campaigns(brand_id,name)values($1,$2)returning id",
        [b.id, "Campanha legada " + b.slug],
      )
    ).rows[0].id;
    await db.query(
      "insert into promo_items(campaign_id,position,name,price,product_id,photo_image_id)values($1,1,'PRODUTO LEGADO COMPARTILHADO',$2,$3,$4)",
      [campaign, i ? 4.99 : 29.99, product, image],
    );
    campaigns.push(campaign);
  }
  let unassignedCampaign;
  if (process.env.ENCARTIVA_DB_PERF_TEST === "1") {
    await db.query(
      "insert into products(description,name_key,search)select 'PRODUTO LEGADO '||n,'perf-legacy-'||n,'perf legacy '||n from generate_series(1,8871)n",
    );
    unassignedCampaign = (
      await db.query(
        "insert into promo_campaigns(name,kind,design_format)values('Campanha legada sem empresa','promocao','feed')returning id",
      )
    ).rows[0].id;
  }
  const inventory = await tenancyInventory(db);
  assert.equal(inventory.readOnly, true);
  assert.equal(inventory.catalog.shared_between_companies, 1);
  return {
    brands,
    user,
    product,
    image,
    campaigns,
    branches,
    inventory,
    unassignedCampaign,
  };
}

export async function verifyLegacyTenancy(db, old) {
  const brands = (
    await db.query("select id,slug,name from companies order by slug")
  ).rows;
  assert.deepEqual(brands, old.brands);
  assert.equal(
    (await db.query("select count(*)::int as n from owners")).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from companies where owner_id is null and ownership_status='unverified'",
      )
    ).rows[0].n,
    old.brands.length,
  );
  assert.equal(
    (
      await db.query("select is_platform_admin from users where id=$1", [
        old.user,
      ])
    ).rows[0].is_platform_admin,
    true,
  );
  assert.deepEqual(
    (
      await db.query(
        "select id,brand_id,name from branches where id=any($1::uuid[])order by id",
        [old.branches.map((b) => b.id)],
      )
    ).rows,
    old.branches.slice().sort((a, b) => a.id.localeCompare(b.id)),
  );
  const product = (
    await db.query("select id,company_id from products where id=$1", [
      old.product,
    ])
  ).rows[0];
  assert.equal(product.id, old.product);
  assert.equal(product.company_id, null);
  const image = (
    await db.query(
      "select encode(data,'hex')as data,product_id from product_images where id=$1",
      [old.image],
    )
  ).rows[0];
  assert.equal(image.data, "01020304");
  assert.equal(image.product_id, old.product);
  const items = (
    await db.query(
      "select product_id,photo_image_id,price from promo_items where campaign_id=any($1::uuid[])order by price",
      [old.campaigns],
    )
  ).rows;
  assert.deepEqual(
    items.map((i) => Number(i.price)),
    [4.99, 29.99],
  );
  assert.ok(
    items.every(
      (i) => i.product_id === old.product && i.photo_image_id === old.image,
    ),
  );
  const inventory = await tenancyInventory(db);
  assert.equal(inventory.readOnly, true);
  assert.deepEqual(inventory.counts, old.inventory.counts);
  assert.equal(inventory.catalog.shared_between_companies, 1);
  console.log(
    "PASS legacy company IDs, branches, administrator, shared catalog, image bytes and campaign prices preserved without owners",
  );
  return 15;
}
