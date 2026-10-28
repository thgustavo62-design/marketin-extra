import { normalizeName } from "../domain/catalog";
import { createHash } from "node:crypto";
import { pool, withTx } from "../db";
import { brandAllowed, canWrite } from "../perms";
import { isUuid } from "../form";
import type { SessionUser } from "../session";
import { parseReviewWorkbook } from "./review-xlsx";
import {
  buildReview,
  chooseDistinctPhotos,
  DEFAULT_GROUPING_RULES,
  groupSignature,
  normalizeGroupingRules,
  validateReviewedGroup,
  commerciallyCompatible,
  type CatalogSku,
  type GroupingRules,
  type ImportLine,
  type ReviewGroup,
} from "../domain/promotion-review";
import { normalizeTheme, normalizeOverrides } from "../domain/promo";
import { promoLayoutGrid } from "../domain/promo-layouts";
import { getTheme } from "./store";
import { campaignModel, type ModelSelection } from "./model-selection";
const memoryKey = (signature: string) =>
  createHash("sha256").update(signature).digest("hex");
export type ReviewImport = {
  id: string;
  brand_id: string;
  name: string;
  filename: string;
  original_rows: ImportLine[];
  groups: ReviewGroup[];
  diagnostics: {
    errors: { section: string; line: number; message: string }[];
    sheets: { name: string; items: number }[];
  };
  rules: GroupingRules;
  revision: number;
  campaign_id: string | null;
};
export async function getGroupingRules(
  brandId: string,
): Promise<{ config: GroupingRules; revision: number }> {
  const r = (
    await pool.query(
      "select config,revision from promo_grouping_rules where brand_id=$1",
      [brandId],
    )
  ).rows[0];
  return {
    config: normalizeGroupingRules(r?.config),
    revision: r?.revision ?? 0,
  };
}
export async function readReview(
  id: string,
  user: SessionUser,
): Promise<ReviewImport | null> {
  if (!isUuid(id)) return null;
  const r = (
    await pool.query(
      "select id,brand_id,name,filename,original_rows,groups,diagnostics,rules,revision,campaign_id from promo_imports where id=$1",
      [id],
    )
  ).rows[0] as ReviewImport | undefined;
  return r && brandAllowed(user, r.brand_id) ? r : null;
}
async function catalogFor(
  lines: ImportLine[],
  companyId: string,
): Promise<CatalogSku[]> {
  // Candidate lookup is bounded by exact name-family prefix; it never enrolls a catalog SKU by itself.
  const prefixes = [
    ...new Set(
      lines
        .filter((l) => l.reference)
        .map(
          (l) => normalizeName(l.name).split(/\s+/).slice(0, 2).join(" ") + "%",
        ),
    ),
  ];
  const p = (
    await pool.query(
      `select id,ean,description as name,commercial_attributes as attributes from products where company_id=$3 and active and ean is not null and (ean=any($1::text[]) or name_key ilike any($2::text[])) order by ean limit 5000`,
      [lines.map((l) => l.ean), prefixes, companyId],
    )
  ).rows;
  const photos = (
    await pool.query(
      `select id,product_id,sha256 as sha from product_images where product_id=any($1::uuid[]) order by is_primary desc,created_at`,
      [p.map((x) => x.id)],
    )
  ).rows;
  return p.map((x) => ({
    ...x,
    photos: photos
      .filter((y) => y.product_id === x.id)
      .map(({ id, sha }) => ({ id, sha })),
  }));
}
export async function importForReview(o: {
  bytes: Buffer;
  name: string;
  filename: string;
  brandId: string;
  user: SessionUser;
  rulesOverride?: unknown;
}) {
  if (!canWrite(o.user.role) || !brandAllowed(o.user, o.brandId))
    throw Error("Sem permissão para importar nesta empresa.");
  const saved = await getGroupingRules(o.brandId),
    rules = o.rulesOverride
      ? normalizeGroupingRules(o.rulesOverride)
      : saved.config;
  const parsed = parseReviewWorkbook(o.bytes, rules.priceSource),
    catalog = await catalogFor(parsed.rows, o.brandId),
    groups = buildReview(parsed.rows, catalog, rules);
  const memory = (
    await pool.query(
      "select signature,decision,title from promo_grouping_memory where brand_id=$1",
      [o.brandId],
    )
  ).rows;
  const reused: ReviewGroup[] = [];
  for (const g of groups) {
    const m = memory.find((m) => m.signature === memoryKey(g.signature));
    // Memory only accepts the identical imported SKU set and descriptions, and builder already rechecks current prices.
    if (
      m?.decision === "approved" &&
      g.members.length > 1 &&
      g.photoIds.length > 0 &&
      g.members.every((m) => m.imported)
    ) {
      g.approved = true;
      g.status = "confirmed";
      g.confidence = 100;
      g.title = m.title || g.title;
      g.reasons.push(
        "Mesmo conjunto de SKUs e descrições aprovado anteriormente; preço atual conferido.",
      );
      reused.push(g);
    } else if (m?.decision === "rejected" && g.lineIds.length > 1) {
      const singles = buildReview(
        parsed.rows.filter((r) => g.lineIds.includes(r.id)),
        catalog,
        { ...rules, fragrances: false, diapers: false },
      );
      reused.push(...singles);
    } else reused.push(g);
  }
  const name =
    o.name.trim().slice(0, 120) ||
    o.filename.replace(/\.[^.]+$/, "").slice(0, 120);
  return (
    await pool.query(
      `insert into promo_imports(brand_id,name,filename,file_hash,original_file,original_rows,groups,diagnostics,rules,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10) returning id`,
      [
        o.brandId,
        name,
        o.filename.slice(0, 200),
        createHash("sha256").update(o.bytes).digest("hex"),
        o.bytes,
        JSON.stringify(parsed.rows),
        JSON.stringify(reused),
        JSON.stringify({ errors: parsed.errors, sheets: parsed.sheets }),
        JSON.stringify(rules),
        o.user.id,
      ],
    )
  ).rows[0].id as string;
}
export type ReviewEdit = {
  groupId: string;
  operation: "approve" | "split" | "edit" | "merge";
  title?: string;
  price?: number;
  note?: string;
  memberEans?: string[];
  photoIds?: string[];
  variantLabels?: Record<string, string>;
  otherGroupIds?: string[];
};
export async function editReview(
  id: string,
  revision: number,
  edit: ReviewEdit,
  user: SessionUser,
) {
  if (!canWrite(user.role)) throw Error("Seu perfil é somente leitura.");
  return withTx(async (db) => {
    const r = (
      await db.query("select * from promo_imports where id=$1 for update", [id])
    ).rows[0] as ReviewImport | undefined;
    if (!r || !brandAllowed(user, r.brand_id))
      throw Error("Importação não encontrada.");
    if (r.campaign_id)
      throw Error("A campanha já foi gerada. Edite os produtos no editor.");
    if (r.revision !== revision)
      throw Error("Esta revisão mudou. Recarregue antes de continuar.");
    const g = r.groups.find((g) => g.id === edit.groupId);
    if (!g) throw Error("Oferta não encontrada.");
    if (edit.operation === "split") {
      if (g.lineIds.length < 2) throw Error("Esta oferta já é individual.");
      const ids = new Set(g.lineIds),
        lines = r.original_rows.filter((l) => ids.has(l.id)),
        skus = g.members
          .filter((m) => m.productId)
          .map((m) => ({
            id: m.productId!,
            ean: m.ean,
            name: m.name,
            photos: m.photos,
          }));
      r.groups.splice(
        r.groups.indexOf(g),
        1,
        ...buildReview(lines, skus, {
          ...r.rules,
          fragrances: false,
          diapers: false,
        }),
      );
      await db.query(
        `insert into promo_grouping_memory(brand_id,signature,decision,updated_by) values($1,$2,'rejected',$3) on conflict(brand_id,signature) do update set decision='rejected',updated_by=excluded.updated_by,updated_at=now()`,
        [r.brand_id, memoryKey(g.signature), user.id],
      );
    } else if (edit.operation === "merge") {
      const selected = r.groups.filter(
        (x) => x.id === g.id || edit.otherGroupIds?.includes(x.id),
      );
      if (selected.length < 2) throw Error("Escolha pelo menos duas ofertas.");
      if (
        selected.some(
          (x) =>
            x.price !== g.price ||
            x.section !== g.section ||
            !commerciallyCompatible(
              g.members[0].name,
              x.members[0].name,
              g.section,
            ),
        )
      )
        throw Error(
          "Agrupamento recusado: tipos, apresentações, categorias ou preços incompatíveis.",
        );
      const all = selected.flatMap((x) => x.members),
        eans = new Set<string>();
      g.members = all.filter((m) => !eans.has(m.ean) && !!eans.add(m.ean));
      g.lineIds = selected.flatMap((x) => x.lineIds);
      g.signature = groupSignature(g.members, g.section);
      g.photoIds = chooseDistinctPhotos(g.members, r.rules.maxPhotos);
      g.status = "review";
      g.approved = false;
      g.variants = null;
      r.groups = r.groups.filter((x) => x.id === g.id || !selected.includes(x));
    } else {
      if (edit.title !== undefined) g.title = edit.title.trim().slice(0, 160);
      if (edit.price !== undefined) g.price = edit.price;
      if (edit.note !== undefined) g.note = edit.note.trim().slice(0, 400);
      if (edit.memberEans) {
        const allowed = [...g.members, ...g.candidates];
        const wanted = [...new Set(edit.memberEans)];
        if (
          !wanted.length ||
          wanted.some((e) => !allowed.some((m) => m.ean === e))
        )
          throw Error("SKU não elegível para esta oferta.");
        const original = allowed.filter((m) => m.imported);
        if (original.some((m) => !wanted.includes(m.ean)))
          throw Error(
            "Produtos originais não podem desaparecer; use Desagrupar.",
          );
        g.members = allowed.filter(
          (m, i) =>
            wanted.includes(m.ean) &&
            allowed.findIndex((x) => x.ean === m.ean) === i,
        );
        g.signature = groupSignature(g.members, g.section);
      }
      if (edit.variantLabels) {
        for (const m of g.members) {
          const v = edit.variantLabels[m.ean];
          if (typeof v === "string") m.variant = v.trim().slice(0, 100);
        }
      }
      if (edit.photoIds) g.photoIds = [...new Set(edit.photoIds)];
      g.approved = edit.operation === "approve";
      g.status = g.approved
        ? "confirmed"
        : g.status === "individual"
          ? "individual"
          : "review";
      const err = validateReviewedGroup({ ...g, approved: true }, r.rules);
      if (err) throw Error(err);
      if (g.approved && g.members.length > 1) {
        if (g.variants?.kind !== "sizes")
          g.variants = {
            kind: "options",
            show: r.rules.showVariants,
            members: g.members.map((m) => ({
              ean: m.ean,
              name: m.name,
              variant: m.variant || m.name,
            })),
          };
        await db.query(
          `insert into promo_grouping_memory(brand_id,signature,decision,title,updated_by) values($1,$2,'approved',$3,$4) on conflict(brand_id,signature) do update set decision='approved',title=excluded.title,updated_by=excluded.updated_by,updated_at=now()`,
          [r.brand_id, memoryKey(g.signature), g.title, user.id],
        );
      }
    }
    await db.query(
      "update promo_imports set groups=$2::jsonb,revision=revision+1,updated_at=now() where id=$1",
      [id, JSON.stringify(r.groups)],
    );
    return r.revision + 1;
  });
}
export async function generateReviewed(
  id: string,
  revision: number,
  user: SessionUser,
  opts: ModelSelection & {
    themeId?: string;
    layout: string;
    title: string;
    validity: string;
    square?: boolean;
  },
) {
  if (!canWrite(user.role)) throw Error("Seu perfil é somente leitura.");
  let theme =
    !opts.modelKey && opts.themeId && isUuid(opts.themeId)
      ? await getTheme(opts.themeId)
      : null;
  if (!opts.modelKey && opts.themeId && (!theme || theme.active === false))
    throw Error("Modelo não encontrado ou desativado.");
  if (!opts.themeId && !opts.modelKey) {
    const source = (
      await pool.query("select name,brand_id from promo_imports where id=$1", [
        id,
      ])
    ).rows[0];
    if (
      source &&
      /corta[\s_-]*pre[cç]o/i.test(`${source.name} ${opts.title}`)
    ) {
      const { prepareReferenceIdentity } = await import("./reference-identity");
      await prepareReferenceIdentity(source.brand_id, user.id);
      const official = (
        await pool.query(
          "select id from promo_themes where company_id=$1 and official_code='CP-MF-006' and active",
          [source.brand_id],
        )
      ).rows[0];
      if (official) theme = await getTheme(official.id);
    }
  }
  return withTx(async (db) => {
    const r = (
      await db.query("select * from promo_imports where id=$1 for update", [id])
    ).rows[0] as ReviewImport | undefined;
    if (!r || !brandAllowed(user, r.brand_id))
      throw Error("Importação não encontrada.");
    if (r.campaign_id) return r.campaign_id;
    if (r.revision !== revision)
      throw Error("Revisão alterada. Recarregue antes de gerar.");
    const model = await campaignModel(opts, r.brand_id, db);
    if (!r.groups.length) throw Error("Nenhuma oferta para gerar.");
    for (const g of r.groups) {
      const err = validateReviewedGroup(g, r.rules);
      if (err) throw Error(`${g.title}: ${err}`);
      if (g.photoIds.length) {
        const live = (
          await db.query(
            "select id,product_id,sha256 from product_images where id=any($1::uuid[])",
            [g.photoIds],
          )
        ).rows;
        if (
          live.length !== g.photoIds.length ||
          live.some(
            (p) =>
              !g.members.some(
                (m) =>
                  m.productId === p.product_id &&
                  m.photos.some(
                    (old) => old.id === p.id && old.sha === p.sha256,
                  ),
              ),
          )
        )
          throw Error(
            `${g.title}: as fotos mudaram. Atualize as fotos antes de gerar.`,
          );
        if (new Set(live.map((p) => p.sha256)).size !== live.length)
          throw Error("Não use a mesma fotografia duas vezes na oferta.");
      }
    }
    const report = {
      lines: r.original_rows.length,
      encartes: r.groups.length,
      gruposTamanho: 0,
      gruposOpcoes: r.groups.filter((g) => g.members.length > 1).length,
      grouped: true,
      sheets: r.diagnostics.sheets,
      notInCatalog: [],
      withoutPhoto: r.groups
        .filter((g) => !g.photoIds.length)
        .map((g) => ({ ean: g.members[0].ean, name: g.title })),
      rowErrors: r.diagnostics.errors.map((e) => ({
        line: e.line,
        message: `[${e.section}] ${e.message}`,
      })),
      skipped: [],
      reviewImport: id,
      rules: r.rules,
      modelVersion: theme?.version ?? null,
      globalModel: model ? { key: model.key, version: model.version } : null,
    };
    const c = (
      await db.query(
        `insert into promo_campaigns(name,theme_id,title,validity,created_by,import_report,group_variants,overrides,brand_id) values($1,$2,$3,$4,$5,$6::jsonb,true,$7::jsonb,$8) returning id`,
        [
          r.name,
          theme?.id ?? null,
          opts.title.slice(0, 60) || null,
          opts.validity.slice(0, 80) || null,
          user.id,
          JSON.stringify(report),
          JSON.stringify(
            normalizeOverrides({
              ...(model ? { model } : {}),
              grid: theme?.config.offerIdentity
                ? theme.config.grid
                : promoLayoutGrid(opts.layout),
              dimensions: opts.square
                ? { feed: { w: 1080, h: 1080 } }
                : undefined,
            }),
          ),
          r.brand_id,
        ],
      )
    ).rows[0].id;
    for (let i = 0; i < r.groups.length; i++) {
      const g = r.groups[i],
        m =
          g.members.find((m) => m.photos.some((p) => p.id === g.photoIds[0])) ??
          g.members[0];
      await db.query(
        `insert into promo_items(campaign_id,position,ean,product_id,name,price,section,variants,note,photo_image_id,photo_image_ids) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::uuid[])`,
        [
          c,
          i + 1,
          m.ean,
          m.productId,
          g.title,
          g.price,
          g.section,
          JSON.stringify(g.variants),
          g.note || null,
          g.photoIds[0] ?? null,
          g.photoIds,
        ],
      );
    }
    await db.query(
      "update promo_imports set campaign_id=$2,revision=revision+1,updated_at=now() where id=$1",
      [id, c],
    );
    return c as string;
  });
}
export async function previewRules(
  bytes: Buffer,
  rules: unknown,
  companyId: string,
) {
  const config = normalizeGroupingRules(rules),
    parsed = parseReviewWorkbook(bytes, config.priceSource),
    groups = buildReview(
      parsed.rows,
      await catalogFor(parsed.rows, companyId),
      config,
    );
  return {
    lines: parsed.rows.length,
    offers: groups.length,
    groups: groups.filter((g) => g.members.length > 1).length,
    pending: groups.filter((g) => g.status === "review").length,
  };
}
export async function refreshReviewPhotos(
  id: string,
  revision: number,
  user: SessionUser,
) {
  if (!canWrite(user.role)) throw Error("Seu perfil é somente leitura.");
  const r = await readReview(id, user);
  if (!r || r.campaign_id)
    throw Error("Importação não disponível para revisão.");
  const catalog = await catalogFor(r.original_rows, r.brand_id),
    byEan = new Map(catalog.map((s) => [s.ean, s]));
  for (const g of r.groups) {
    for (const m of [...g.members, ...g.candidates]) {
      const p = byEan.get(m.ean);
      m.productId = p?.id ?? null;
      m.photos = p?.photos ?? [];
    }
    const allowed = g.members.flatMap((m) => m.photos.map((p) => p.id));
    g.photoIds = g.photoIds.filter((id) => allowed.includes(id));
    if (!g.photoIds.length)
      g.photoIds = chooseDistinctPhotos(g.members, r.rules.maxPhotos);
  }
  const out = await pool.query(
    "update promo_imports set groups=$2::jsonb,revision=revision+1,updated_at=now() where id=$1 and revision=$3 and campaign_id is null returning id",
    [id, JSON.stringify(r.groups), revision],
  );
  if (!out.rowCount)
    throw Error("A revisão mudou. Recarregue antes de atualizar fotos.");
}
export async function approveSelectedGroups(
  id: string,
  revision: number,
  ids: string[],
  user: SessionUser,
) {
  if (!canWrite(user.role) || !ids.length || ids.length > 2000)
    throw Error("Selecione as ofertas que conferiu.");
  return withTx(async (db) => {
    const r = (
      await db.query("select * from promo_imports where id=$1 for update", [id])
    ).rows[0] as ReviewImport | undefined;
    if (!r || !brandAllowed(user, r.brand_id) || r.campaign_id)
      throw Error("Importação indisponível.");
    if (r.revision !== revision) throw Error("A revisão mudou. Recarregue.");
    if (ids.some((id) => !r.groups.some((g) => g.id === id)))
      throw Error("Oferta inválida.");
    for (const g of r.groups.filter((g) => ids.includes(g.id))) {
      g.approved = true;
      g.status = "confirmed";
      const err = validateReviewedGroup(g, r.rules);
      if (err) throw Error(`${g.title}: ${err}`);
      if (g.members.length > 1) {
        if (g.variants?.kind !== "sizes")
          g.variants = {
            kind: "options",
            show: r.rules.showVariants,
            members: g.members.map((m) => ({
              ean: m.ean,
              name: m.name,
              variant: m.variant || m.name,
            })),
          };
        await db.query(
          `insert into promo_grouping_memory(brand_id,signature,decision,title,updated_by) values($1,$2,'approved',$3,$4) on conflict(brand_id,signature) do update set decision='approved',title=excluded.title,updated_by=excluded.updated_by,updated_at=now()`,
          [r.brand_id, memoryKey(g.signature), g.title, user.id],
        );
      }
    }
    await db.query(
      "update promo_imports set groups=$2::jsonb,revision=revision+1,updated_at=now() where id=$1",
      [id, JSON.stringify(r.groups)],
    );
  });
}
