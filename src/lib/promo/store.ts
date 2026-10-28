// Promoções: temas (artes), campanhas e itens. Importações com .ts para rodar também em scripts do Node.
import { campaignAccess } from "./access";
import { offerEditVersion } from "../domain/offer-editing.ts";
import { getSession } from "../session";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { pool, withTx } from "../db.ts";
import {
  displayName,
  applyOverrides,
  normalizeItemStyle,
  normalizeOverrides,
  normalizeTheme,
  PROMO_FORMAT_KEYS,
  type ItemStyle,
  type PromoFormat,
  type PromoOverrides,
  type PromoRow,
  type ThemeConfig,
} from "../domain/promo.ts";
import {
  groupItems,
  groupSummary,
  type GroupInput,
  type Variants,
} from "../domain/promo-group.ts";
import { normalizeLayers, type Layers } from "../domain/promo-layers.ts";
import {
  autoSnapshot,
  logItemChange,
  money,
  snapshotVersion,
} from "./history.ts";
import {
  isArtKind,
  MAX_FIXED_PER_FORMAT,
  MAX_THEME_ARTS,
  type ArtKind,
} from "../domain/promo-fixed.ts";
import {
  applyTemplateTexts,
  isTemplateCategory,
  templateFields,
  type TemplateField,
} from "../domain/promo-templates.ts";
import {
  checkPromotion,
  pageCountsFor,
  summarizeCheck,
} from "../domain/promo-check.ts";
import { listLibrary, type LibraryItem } from "./library.ts";
import { sniffImage } from "../catalog/images.ts";
import { ingestImage, saveProduct } from "../catalog/store.ts";

export type ThemeRole = "background" | "header" | "footer" | "badge" | "tag";
export const THEME_ROLES: ThemeRole[] = [
  "background",
  "header",
  "footer",
  "badge",
  "tag",
];
export type ThemeAsset = {
  role: ThemeRole;
  format: PromoFormat;
  width: number;
  height: number;
};
export type ThemeArt = {
  id: string;
  name: string;
  kind: ArtKind;
  width: number;
  height: number;
};
export type Theme = {
  active?: boolean;
  version?: number;
  category?: string;
  id: string;
  name: string;
  config: ThemeConfig;
  assets: ThemeAsset[];
  /** artes fixas (bonecos, logos, fundos…) e onde ficam em cada formato */ fixed: Layers;
  arts: ThemeArt[];
};
export type ThemeLite = {
  id: string;
  name: string;
  assets: number;
  active: boolean;
  version: number;
  category: string;
  config: ThemeConfig;
  asset_roles: { role: string; format: string }[];
};

export async function listThemes(
  includeInactive = false,
): Promise<ThemeLite[]> {
  return (
    await pool.query(
      `select t.id, t.name, t.active, t.version, t.category, t.config, coalesce((select jsonb_agg(jsonb_build_object('role',a.role,'format',a.format)) from promo_theme_assets a where a.theme_id=t.id),'[]'::jsonb) as asset_roles, (select count(*)::int from promo_theme_assets a where a.theme_id = t.id) as assets from promo_themes t where ($1 or t.active) order by t.name`,
      [includeInactive],
    )
  ).rows;
}

export async function getTheme(
  id: string,
  db: Pick<typeof pool, "query"> = pool,
): Promise<Theme | null> {
  const t = (
    await db.query(
      `select id, name, config, fixed,active,version,category from promo_themes where id = $1`,
      [id],
    )
  ).rows[0];
  if (!t) return null;
  const assets = (
    await db.query(
      `select role, format, width, height, sha256 from promo_theme_assets where theme_id = $1`,
      [id],
    )
  ).rows as ThemeAsset[];
  const arts = (
    await db.query(
      `select id, name, kind, width, height from promo_theme_arts where theme_id = $1 order by created_at`,
      [id],
    )
  ).rows as ThemeArt[];
  return {
    active: t.active,
    version: t.version,
    category: t.category,
    id: t.id,
    name: t.name,
    config: normalizeTheme(t.config),
    assets,
    fixed: normalizeLayers(t.fixed),
    arts,
  };
}

export async function createTheme(
  name: string,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 80)
    return {
      ok: false,
      error: "O nome do tema deve ter de 2 a 80 caracteres.",
    };
  try {
    const r = await pool.query(
      `insert into promo_themes (name, config, created_by) values ($1, '{}'::jsonb, $2) returning id`,
      [n, userId],
    );
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return { ok: false, error: "Já existe um tema com este nome." };
    throw e;
  }
}

export async function saveThemeConfig(
  id: string,
  name: string,
  config: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 80)
    return {
      ok: false,
      error: "O nome do tema deve ter de 2 a 80 caracteres.",
    };
  try {
    return await withTx(async (db) => {
      const old = (
        await db.query(
          "select name,config,fixed,category,version from promo_themes where id=$1 for update",
          [id],
        )
      ).rows[0];
      if (!old) return { ok: false, error: "Tema não encontrado." };
      await db.query(
        "insert into promo_theme_versions(theme_id,version,snapshot) values($1,$2,$3::jsonb) on conflict do nothing",
        [id, old.version, JSON.stringify(old)],
      );
      await db.query(
        `update promo_themes set name=$2,config=$3::jsonb,version=version+1,updated_at=now() where id=$1`,
        [id, n, JSON.stringify(normalizeTheme(config))],
      );
      return { ok: true };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return { ok: false, error: "Já existe um tema com este nome." };
    throw e;
  }
}

export async function deleteTheme(id: string): Promise<void> {
  await pool.query(`delete from promo_themes where id = $1`, [id]);
}

const MAX_ART_BYTES = 6 * 1024 * 1024;
/** Guarda a arte de um tema (cabeçalho, rodapé, fundo ou selo) para um formato: valida, limita a 2400 px de largura e converte para WEBP mantendo a transparência. */
export async function setThemeAsset(
  themeId: string,
  role: ThemeRole,
  format: PromoFormat,
  buf: Buffer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!THEME_ROLES.includes(role) || !PROMO_FORMAT_KEYS.includes(format))
    return { ok: false, error: "Arte ou formato inválido." };
  if (buf.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (buf.length > MAX_ART_BYTES)
    return { ok: false, error: "A arte passa de 6 MB." };
  if (!sniffImage(buf))
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." };
  try {
    const out = await sharp(buf, {
      failOn: "error",
      limitInputPixels: 60_000_000,
    })
      .rotate()
      .resize({ width: 2400, withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 95 })
      .toBuffer({ resolveWithObject: true });
    const sha = createHash("sha256").update(out.data).digest("hex");
    const r = await pool.query(
      `insert into promo_theme_assets (theme_id, role, format, data, mime, width, height, sha256) select $1, $2, $3, $4, 'image/webp', $5, $6, $7 where exists (select 1 from promo_themes where id = $1)
       on conflict (theme_id, role, format) do update set data = excluded.data, mime = excluded.mime, width = excluded.width, height = excluded.height, sha256 = excluded.sha256, updated_at = now() returning theme_id`,
      [themeId, role, format, out.data, out.info.width, out.info.height, sha],
    );
    return r.rowCount
      ? { ok: true }
      : { ok: false, error: "Tema não encontrado." };
  } catch {
    return {
      ok: false,
      error:
        "Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).",
    };
  }
}

/**
 * Divide uma arte completa em branco (sem produtos nem preços): o topo vira o cabeçalho, a base vira o rodapé e a imagem inteira fica de fundo.
 * As alturas são em pixels da imagem enviada.
 */
export async function splitThemeArt(
  themeId: string,
  format: PromoFormat,
  buf: Buffer,
  headerPx: number,
  footerPx: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sniffImage(buf))
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." };
  try {
    const meta = await sharp(buf, { limitInputPixels: 60_000_000 }).metadata();
    const w = meta.width ?? 0,
      h = meta.height ?? 0;
    if (!w || !h) return { ok: false, error: "Não consegui ler a imagem." };
    const hp = Math.round(headerPx),
      fp = Math.round(footerPx);
    if (!(hp >= 0 && fp >= 0 && hp + fp < h - 100))
      return {
        ok: false,
        error:
          "As alturas do cabeçalho e do rodapé não cabem na imagem (sobra menos de 100 px no meio).",
      };
    const png = await sharp(buf, { failOn: "error" }).rotate().png().toBuffer();
    const cut = (top: number, height: number) =>
      sharp(png).extract({ left: 0, top, width: w, height }).png().toBuffer();
    const parts: [ThemeRole, Buffer][] = [["background", png]];
    if (hp > 0) parts.push(["header", await cut(0, hp)]);
    if (fp > 0) parts.push(["footer", await cut(h - fp, fp)]);
    for (const [role, b] of parts) {
      const r = await setThemeAsset(themeId, role, format, b);
      if (!r.ok) return r;
    }
    if (hp === 0) await deleteThemeAsset(themeId, "header", format);
    if (fp === 0) await deleteThemeAsset(themeId, "footer", format);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).",
    };
  }
}

export async function deleteThemeAsset(
  themeId: string,
  role: ThemeRole,
  format: PromoFormat,
): Promise<void> {
  await pool.query(
    `delete from promo_theme_assets where theme_id = $1 and role = $2 and format = $3`,
    [themeId, role, format],
  );
}

export async function getThemeAsset(
  themeId: string,
  role: string,
  format: string,
): Promise<{ data: Buffer; mime: string; sha: string } | null> {
  const r = (
    await pool.query(
      `select data, mime, sha256 from promo_theme_assets where theme_id = $1 and role = $2 and format = $3`,
      [themeId, role, format],
    )
  ).rows[0];
  return r ? { data: r.data, mime: r.mime, sha: r.sha256 } : null;
}

// ---------- campanhas ----------
export type CampaignStatus = "rascunho" | "aprovada";
export type CampaignLite = {
  id: string;
  name: string;
  theme_name: string | null;
  items: number;
  status: CampaignStatus;
  created_at: string;
  thumb_at: string | null;
};
export type ImportReport = {
  /** linhas válidas da planilha */ lines: number;
  /** encartes depois do agrupamento */ encartes: number;
  gruposTamanho: number;
  gruposOpcoes: number;
  grouped: boolean;
  sheets: { name: string; items: number }[];
  /** códigos que não estão no catálogo de produtos (sem foto) */ notInCatalog: {
    ean: string;
    name: string;
  }[];
  /** encartes sem nenhuma foto no banco de imagens */ withoutPhoto: {
    ean: string;
    name: string;
  }[];
  /** linhas com problema na planilha (código ou valor inválido, repetição, aba ignorada) */ rowErrors: {
    line: number;
    message: string;
  }[];
  /** linhas que não entraram (sem descrição) */ skipped: {
    ean: string;
    reason: string;
  }[];
};
export type Campaign = {
  id: string;
  brand_id?: string | null;
  brand_name?: string | null;
  name: string;
  theme_id: string | null;
  title: string | null;
  validity: string | null;
  status: CampaignStatus;
  approved_by_name: string | null;
  approved_at: string | null;
  import_report: ImportReport | null;
  group_variants: boolean;
  overrides: PromoOverrides;
  /** elementos livres (texto, imagem, formas) por formato */ layers: Layers;
  /** revisão dos elementos livres (controle de edição simultânea) */ layers_rev: number;
  /** 'promocao' (planilha) ou 'design' (arte livre) */ kind:
    | "promocao"
    | "design"
    | "template";
  design_format: PromoFormat | null;
  design_pages: number;
  /** imagens enviadas para esta promoção (elementos e fundos) */ assets: CampaignAsset[];
  /** imagens da biblioteca (ícones, logos, selos…) para colocar na peça */ library: LibraryItem[];
  /** temas que têm imagem de fundo, para escolher o fundo de outro tema */ themeBackgrounds: {
    id: string;
    name: string;
    formats: PromoFormat[];
  }[];
};
export type CampaignAsset = {
  id: string;
  width: number;
  height: number;
  used: boolean;
};
export type PromoItem = {
  id: string;
  position: number;
  ean: string | null;
  product_id: string | null;
  name: string;
  price: number;
  section: string | null;
  variants: Variants | null;
  old_price: number | null;
  note: string | null;
  style: ItemStyle;
  photo_image_id: string | null;
  /** foto usada na arte (a escolhida ou a principal do produto) */ photo_id:
    | string
    | null;
  photo_image_ids?: string[];
  /** todas as fotos do produto, para trocar */ photos: string[];
};

export async function listCampaigns(): Promise<CampaignLite[]> {
  const user = await getSession();
  if (!user) return [];
  return (
    await pool.query(
      `select c.id, c.name, t.name as theme_name, (select count(*)::int from promo_items i where i.campaign_id = c.id) as items, c.status, c.created_at::text as created_at, c.thumb_at::text as thumb_at
       from promo_campaigns c left join promo_themes t on t.id = c.theme_id where c.kind = 'promocao' and (c.brand_id is null or $1::uuid[] is null or c.brand_id=any($1::uuid[])) order by c.created_at desc limit 100`,
      [user.role === "admin" ? null : user.brandIds],
    )
  ).rows;
}

export type DesignLite = {
  width?: number | null;
  height?: number | null;
  id: string;
  name: string;
  format: PromoFormat;
  pages: number;
  status: CampaignStatus;
  updated_at: string;
  created_by_name: string | null;
  thumb_at: string | null;
};
export async function listDesigns(): Promise<DesignLite[]> {
  return (
    await pool.query(
      `select c.id, c.name, c.design_format as format, c.design_pages as pages, c.status, c.updated_at::text as updated_at, u.display_name as created_by_name, c.thumb_at::text as thumb_at,
       (select (o->>'width')::numeric from jsonb_array_elements(sp.scene->'objects') o where o->>'name'='clip' limit 1)::int as width,
       (select (o->>'height')::numeric from jsonb_array_elements(sp.scene->'objects') o where o->>'name'='clip' limit 1)::int as height
       from promo_campaigns c left join users u on u.id = c.created_by
       left join studio_pages sp on sp.campaign_id=c.id and sp.format=c.design_format and sp.page=0 where c.kind = 'design' order by c.updated_at desc limit 200`,
    )
  ).rows;
}

/** Cria uma arte livre (sem planilha): formato fixo, uma peça, fundo branco. */
export async function createDesign(o: {
  name: string;
  format: string;
  userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = o.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120)
    return {
      ok: false,
      error: "O nome do design deve ter de 2 a 120 caracteres.",
    };
  if (!PROMO_FORMAT_KEYS.includes(o.format as PromoFormat))
    return { ok: false, error: "Escolha o formato: Story, Feed ou A4." };
  const r = await pool.query(
    `insert into promo_campaigns (name, kind, design_format, created_by, overrides) values ($1, 'design', $2, $3, $4::jsonb) returning id`,
    [
      name,
      o.format,
      o.userId,
      JSON.stringify({ background: { kind: "color", color: "#ffffff" } }),
    ],
  );
  return { ok: true, id: r.rows[0].id };
}

type Db = {
  query: (
    sql: string,
    args?: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
}; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Copia um design/modelo inteiro (peças, elementos, fundo, miniatura e imagens: cada imagem ganha cópia própria) como outro design ou modelo. */
async function cloneDesign(
  db: Db,
  sourceId: string,
  o: {
    sourceKinds: string[];
    kind: "design" | "template";
    name: string;
    userId: string;
    category?: string | null;
    texts?: Record<string, unknown>;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = (
    await db.query(
      `select design_format, design_pages, overrides, layers, thumb, thumb_at from promo_campaigns where id = $1 and kind = any($2::text[])`,
      [sourceId, o.sourceKinds],
    )
  ).rows[0];
  if (!c) return { ok: false, error: "Design ou modelo não encontrado." };
  const n = (
    await db.query(
      `insert into promo_campaigns (name, kind, design_format, design_pages, created_by, template_category, thumb, thumb_at) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        o.name.slice(0, 120),
        o.kind,
        c.design_format,
        c.design_pages,
        o.userId,
        o.kind === "template" ? o.category : null,
        c.thumb,
        c.thumb_at,
      ],
    )
  ).rows[0].id as string;
  await db.query(
    `insert into promo_assets (campaign_id, data, mime, width, height, sha256, created_by) select $2, data, mime, width, height, sha256, $3 from promo_assets where campaign_id = $1`,
    [sourceId, n, o.userId],
  );
  const map = (
    await db.query(
      `select o.id as old, w.id as new from promo_assets o join promo_assets w on w.sha256 = o.sha256 and w.campaign_id = $2 where o.campaign_id = $1`,
      [sourceId, n],
    )
  ).rows as { old: string; new: string }[];
  let layers = JSON.stringify(c.layers ?? null),
    overrides = JSON.stringify(c.overrides ?? null);
  for (const m of map) {
    layers = layers.split(m.old).join(m.new);
    overrides = overrides.split(m.old).join(m.new);
  }
  const finalLayers = o.texts
    ? applyTemplateTexts(normalizeLayers(JSON.parse(layers)), o.texts)
    : JSON.parse(layers);
  await db.query(
    `update promo_campaigns set layers = $2::jsonb, overrides = $3::jsonb where id = $1`,
    [n, JSON.stringify(finalLayers), overrides],
  );
  const savedPages = (
    await db.query(
      "select format,page,scene,source_hash from studio_pages where campaign_id=$1",
      [sourceId],
    )
  ).rows;
  for (const page of savedPages) {
    let scene = JSON.stringify(page.scene);
    for (const m of map) scene = scene.split(m.old).join(m.new);
    await db.query(
      "insert into studio_pages(campaign_id,format,page,scene,source_hash,updated_by) values($1,$2,$3,$4::jsonb,$5,$6)",
      [n, page.format, page.page, scene, page.source_hash, o.userId],
    );
  }
  return { ok: true, id: n };
}

/** Duplica um design com as peças, os elementos e as imagens. */
export async function duplicateDesign(
  id: string,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return withTx(async (db) => {
    const c = (
      await db.query(
        `select name from promo_campaigns where id = $1 and kind = 'design'`,
        [id],
      )
    ).rows[0];
    if (!c) return { ok: false as const, error: "Design não encontrado." };
    return cloneDesign(db as Db, id, {
      sourceKinds: ["design"],
      kind: "design",
      name: `${c.name} (cópia)`,
      userId,
    });
  });
}

export type TemplateLite = {
  id: string;
  name: string;
  format: PromoFormat;
  pages: number;
  category: string;
  thumb_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};
export async function listTemplates(): Promise<TemplateLite[]> {
  return (
    await pool.query(
      `select c.id, c.name, c.design_format as format, c.design_pages as pages, c.template_category as category, c.thumb_at::text as thumb_at, c.created_by, u.display_name as created_by_name, c.created_at::text as created_at
       from promo_campaigns c left join users u on u.id = c.created_by where c.kind = 'template' order by c.created_at desc limit 300`,
    )
  ).rows;
}

/** Os textos que podem ser trocados ao criar um design a partir do modelo. */
export async function getTemplateFields(
  id: string,
): Promise<{ name: string; fields: TemplateField[] } | null> {
  const r = (
    await pool.query(
      `select name, layers from promo_campaigns where id = $1 and kind = 'template'`,
      [id],
    )
  ).rows[0];
  return r
    ? { name: r.name, fields: templateFields(normalizeLayers(r.layers)) }
    : null;
}

/** Congela uma cópia do design como modelo (nome e categoria). */
export async function createTemplate(o: {
  designId: string;
  name: string;
  category: string;
  userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = o.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120)
    return {
      ok: false,
      error: "O nome do modelo deve ter de 2 a 120 caracteres.",
    };
  if (!isTemplateCategory(o.category))
    return { ok: false, error: "Escolha a categoria do modelo." };
  return withTx((db) =>
    cloneDesign(db as Db, o.designId, {
      sourceKinds: ["design"],
      kind: "template",
      name,
      userId: o.userId,
      category: o.category,
    }),
  );
}

/** Cria um design novo a partir do modelo, já com os textos que a pessoa preencheu. */
export async function createDesignFromTemplate(o: {
  templateId: string;
  name: string;
  texts: Record<string, unknown>;
  userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = o.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120)
    return {
      ok: false,
      error: "O nome do design deve ter de 2 a 120 caracteres.",
    };
  return withTx((db) =>
    cloneDesign(db as Db, o.templateId, {
      sourceKinds: ["template"],
      kind: "design",
      name,
      userId: o.userId,
      texts: o.texts,
    }),
  );
}

export async function deleteTemplate(
  id: string,
  user: { id: string; role: string },
): Promise<{ ok: boolean; error?: string }> {
  const t = (
    await pool.query(
      `select created_by from promo_campaigns where id = $1 and kind = 'template'`,
      [id],
    )
  ).rows[0];
  if (!t) return { ok: false, error: "Modelo não encontrado." };
  if (user.role !== "admin" && t.created_by !== user.id)
    return {
      ok: false,
      error: "Só o administrador ou quem criou o modelo pode excluir.",
    };
  await pool.query(`delete from promo_campaigns where id = $1`, [id]);
  return { ok: true };
}

/** Qualquer mudança nos encartes tira a aprovação: quem mexeu precisa aprovar de novo. */
async function touch(
  db: { query: (sql: string, args?: unknown[]) => Promise<unknown> },
  campaignId: string,
): Promise<void> {
  await db.query(
    `update promo_campaigns set updated_at = now(), status = 'rascunho', approved_by = null, approved_at = null where id = $1`,
    [campaignId],
  );
}

/**
 * Cria a promoção a partir das linhas da planilha. Só entram código de barras, descrição e valor aproximado: o nome do encarte é a descrição da planilha
 * (ou a do catálogo, se a planilha não trouxe), o preço é o valor da planilha e a foto vem do banco de imagens pelo código. Com `groupVariants`, produtos que só mudam
 * de tamanho ou de fragrância viram um encarte só (política de encartes).
 */
type PromotionRowsInput = {
  rows: PromoRow[];
  groupVariants?: boolean;
  sheets?: { name: string; items: number }[];
  rowErrors?: { line: number; message: string }[];
};
export async function preparePromotionRows(o: PromotionRowsInput) {
  const prods = (
    await pool.query(
      `select p.id, p.ean, p.description, (select i.id from product_images i where i.product_id = p.id order by i.is_primary desc, i.created_at limit 1) as photo from products p where p.active and p.ean = any($1::text[])`,
      [o.rows.map((r) => r.ean)],
    )
  ).rows;
  const byEan = new Map(prods.map((p) => [p.ean as string, p]));
  const skipped: ImportReport["skipped"] = [];
  const inputs: GroupInput[] = [];
  for (const r of o.rows) {
    const desc = r.name ?? byEan.get(r.ean)?.description ?? null;
    if (!desc) {
      skipped.push({
        ean: r.ean,
        reason: "sem descrição na planilha e fora do catálogo",
      });
      continue;
    }
    inputs.push({
      ean: r.ean,
      name: displayName(desc),
      price: r.price,
      section: r.section,
    });
  }
  if (!inputs.length)
    return {
      ok: false as const,
      error:
        'Nenhuma linha tem descrição. Confira se a planilha tem a coluna "Descrição".',
    };
  const grouped = o.groupVariants !== false;
  const encartes = groupItems(inputs, grouped);
  const notInCatalog = inputs
    .filter((x) => !byEan.has(x.ean))
    .map((x) => ({ ean: x.ean, name: x.name }));
  const withoutPhoto: ImportReport["withoutPhoto"] = [];
  const rows = encartes.map((e, k) => {
    // o encarte usa a foto do primeiro membro que tiver; sem foto em nenhum, usa o produto do primeiro (se estiver no catálogo)
    const member =
      e.eans.map((x) => byEan.get(x)).find((p) => p?.photo) ??
      e.eans.map((x) => byEan.get(x)).find(Boolean) ??
      null;
    if (!member?.photo) withoutPhoto.push({ ean: e.ean, name: e.name });
    return {
      pos: k + 1,
      ean: e.ean,
      product_id: member?.id ?? null,
      name: e.name,
      price: e.price,
      section: e.section,
      variants: e.variants,
      photo_id: member?.photo ?? null,
    };
  });
  const sum = groupSummary(inputs.length, encartes);
  const report: ImportReport = {
    lines: sum.linhas,
    encartes: sum.encartes,
    gruposTamanho: sum.gruposTamanho,
    gruposOpcoes: sum.gruposOpcoes,
    grouped,
    sheets: o.sheets ?? [],
    notInCatalog: notInCatalog.slice(0, 200),
    withoutPhoto: withoutPhoto.slice(0, 200),
    rowErrors: (o.rowErrors ?? []).slice(0, 100),
    skipped: skipped.slice(0, 100),
  };
  return {
    ok: true as const,
    rows,
    report,
    grouped,
    missingPhotos: withoutPhoto.length,
    missingCatalog: notInCatalog.length,
    skippedCount: skipped.length,
  };
}

export async function createCampaignFromRows(o: {
  name: string;
  themeId: string | null;
  title: string | null;
  validity: string | null;
  rows: PromoRow[];
  userId: string;
  groupVariants?: boolean;
  sheets?: { name: string; items: number }[];
  rowErrors?: { line: number; message: string }[];
  overrides?: PromoOverrides;
}): Promise<
  { ok: true; id: string; report: ImportReport } | { ok: false; error: string }
> {
  const name = o.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120)
    return {
      ok: false,
      error: "O nome da promoção deve ter de 2 a 120 caracteres.",
    };
  if (!o.rows.length)
    return { ok: false, error: "A planilha não tem nenhuma linha válida." };
  const prepared = await preparePromotionRows(o);
  if (!prepared.ok) return prepared;
  const { rows, report, grouped } = prepared;
  const id = await withTx(async (db) => {
    const c = await db.query(
      `insert into promo_campaigns (name, theme_id, title, validity, created_by, import_report, group_variants,overrides) values ($1, $2, $3, $4, $5, $6::jsonb, $7,$8::jsonb) returning id`,
      [
        name,
        o.themeId,
        o.title,
        o.validity,
        o.userId,
        JSON.stringify(report),
        grouped,
        JSON.stringify(normalizeOverrides(o.overrides)),
      ],
    );
    await db.query(
      `insert into promo_items (campaign_id, position, ean, product_id, name, price, section, variants)
       select $1, x.pos, x.ean, x.product_id, x.name, x.price, x.section, x.variants from jsonb_to_recordset($2::jsonb) as x(pos int, ean text, product_id uuid, name text, price numeric, section text, variants jsonb)`,
      [c.rows[0].id, JSON.stringify(rows)],
    );
    return c.rows[0].id as string;
  });
  return { ok: true, id, report };
}

export async function getCampaign(
  id: string,
  options: { workspace?: boolean; db?: Pick<typeof pool, "query"> } = {},
): Promise<{
  campaign: Campaign;
  theme: Theme | null;
  items: PromoItem[];
} | null> {
  if (!options.db) return withTx((db) => getCampaign(id, { ...options, db }));
  const db = options.db,
    workspace = options.workspace !== false;
  if (!(await campaignAccess(id, undefined, db))) return null;
  const c = (
    await db.query(
      `select c.id, c.name, c.brand_id, (select co.name from companies co where co.id=c.brand_id) as brand_name, c.theme_id, c.title, c.validity, c.status, u.display_name as approved_by_name, c.approved_at::text as approved_at, c.import_report, c.group_variants, c.overrides, c.layers, c.layers_rev, c.kind, c.design_format, c.design_pages
       from promo_campaigns c left join users u on u.id = c.approved_by where c.id = $1`,
      [id],
    )
  ).rows[0];
  if (!c) return null;
  const rows = (
    await db.query(
      `select i.id, i.position, i.ean, i.product_id, i.name, i.price::float8 as price, i.section, i.variants, i.old_price::float8 as old_price, i.note, i.style, i.photo_image_id, i.photo_image_ids,
            coalesce(i.photo_image_id, (select m.id from product_images m where m.product_id = i.product_id order by m.is_primary desc, m.created_at limit 1)) as photo_id,
            coalesce((select array_agg(m.id order by m.is_primary desc, m.created_at) from product_images m where m.product_id = i.product_id), '{}') as photos
       from promo_items i where i.campaign_id = $1 order by i.position`,
      [id],
    )
  ).rows;
  const layers = normalizeLayers(c.layers),
    overrides = normalizeOverrides(c.overrides);
  const usedIds = new Set<string>(
    PROMO_FORMAT_KEYS.flatMap((f) =>
      layers[f].map((l) => l.asset).filter((x): x is string => !!x),
    ),
  );
  if (overrides.background?.kind === "asset")
    usedIds.add(overrides.background.asset);
  const assets: CampaignAsset[] = workspace
    ? (
        await db.query(
          `select id, width, height from promo_assets where campaign_id = $1 order by created_at`,
          [id],
        )
      ).rows.map((a) => ({
        id: a.id,
        width: a.width,
        height: a.height,
        used: usedIds.has(a.id),
      }))
    : [];
  const tb = workspace
    ? (
        await db.query(
          `select t.id, t.name, array_agg(a.format order by a.format) as formats from promo_themes t join promo_theme_assets a on a.theme_id = t.id and a.role = 'background' group by t.id, t.name order by t.name`,
        )
      ).rows
    : [];
  return {
    campaign: {
      ...c,
      overrides,
      layers,
      assets,
      library: workspace ? await listLibrary(undefined, db) : [],
      themeBackgrounds: tb as Campaign["themeBackgrounds"],
    },
    theme: c.theme_id ? await getTheme(c.theme_id, db) : null,
    items: rows.map((r) => ({ ...r, style: normalizeItemStyle(r.style) })),
  };
}

export async function updateCampaign(
  id: string,
  v: {
    name: string;
    title: string | null;
    validity: string | null;
    themeId: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const name = v.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120)
    return {
      ok: false,
      error: "O nome da promoção deve ter de 2 a 120 caracteres.",
    };
  const r = await pool.query(
    `update promo_campaigns set name = $2, title = $3, validity = $4, theme_id = $5 where id = $1`,
    [id, name, v.title, v.validity, v.themeId],
  );
  if (!r.rowCount) return { ok: false, error: "Promoção não encontrada." };
  await touch(pool, id);
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<void> {
  await pool.query(`delete from promo_campaigns where id = $1`, [id]);
}

/** Aprova os encartes: guarda quem aprovou e quando. Qualquer edição depois disso volta para rascunho. */
export async function approveCampaign(
  id: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  // "Verificar arte": erro de dado (preço ou nome inválido) impede aprovar
  const data = await getCampaign(id);
  if (data) {
    const issues = checkPromotion({
      items: data.items,
      layers: data.campaign.layers,
      validity: data.campaign.validity,
      pageCount: pageCountsFor(
        data.items,
        applyOverrides(
          data.theme?.config ?? normalizeTheme({}),
          data.campaign.overrides,
        ),
      ),
    });
    const bl = issues.filter((i) => i.severity === "bloqueio");
    if (bl.length)
      return {
        ok: false,
        error: `Corrija antes de aprovar (${summarizeCheck(issues).bloqueio}): ${bl
          .slice(0, 3)
          .map((i) => i.message)
          .join(" ")}${bl.length > 3 ? " …" : ""}`,
      };
  }
  const r = await pool.query(
    `update promo_campaigns set status = 'aprovada', approved_by = $2, approved_at = now(), updated_at = now() where id = $1 and (kind = 'design' or exists (select 1 from promo_items where campaign_id = $1))`,
    [id, userId],
  );
  if (r.rowCount)
    await snapshotVersion(pool, id, "aprovacao", "Aprovado", userId);
  return r.rowCount
    ? { ok: true }
    : { ok: false, error: "Promoção não encontrada ou sem encartes." };
}

export type SizeEdit = { label: string; units: number | null };
export type ItemPatch = {
  expectedOfferVersion?: string;
  name?: string;
  price?: number;
  photoImageId?: string | null;
  /** tabela de tamanhos (mesma quantidade de linhas) */ sizes?: SizeEdit[];
  /** preço original ("De R$"); null = sem */ oldPrice?: number | null;
  /** subtítulo / descrição curta abaixo do nome; null = sem */ note?:
    | string
    | null;
  style?: ItemStyle;
  /** mostra a tabela de tamanhos (fraldas) ou a lista de fragrâncias/opções no encarte */ showVariants?: boolean;
};

/** Altera só o que veio no pedido. Qualquer mudança tira a aprovação. */
export async function patchItem(
  itemId: string,
  p: ItemPatch,
  userId: string | null = null,
): Promise<{
  ok: boolean;
  error?: string;
  conflict?: boolean;
  version?: string;
}> {
  return withTx(async (db) => {
    // Same lock order as Studio saves: campaign first, then item.
    await db.query(
      "select id from promo_campaigns where id=(select campaign_id from promo_items where id=$1) for update",
      [itemId],
    );
    const cur = (
      await db.query(
        `select campaign_id, product_id, name, price::float8 as price, variants, old_price::float8 as old_price, note, style, photo_image_id,photo_image_ids from promo_items where id = $1 for update`,
        [itemId],
      )
    ).rows[0];
    if (!cur) return { ok: false, error: "Item não encontrado." };
    const name =
      p.name === undefined ? (cur.name as string) : displayName(p.name);
    if (!name || name.length > 160)
      return { ok: false, error: "O nome deve ter de 1 a 160 caracteres." };
    const price = p.price === undefined ? (cur.price as number) : p.price;
    if (!(price >= 0 && price < 100000))
      return { ok: false, error: "Preço inválido." };
    let oldPrice: number | null =
      p.oldPrice === undefined ? (cur.old_price as number | null) : p.oldPrice;
    if (oldPrice !== null && !(oldPrice >= 0 && oldPrice < 100000))
      return { ok: false, error: "Preço original inválido." };
    if (oldPrice === 0) oldPrice = null;
    const note =
      p.note === undefined
        ? (cur.note as string | null)
        : (p.note ?? "").trim().replace(/\s+/g, " ").slice(0, 100) || null;
    if (
      p.expectedOfferVersion !== undefined &&
      p.expectedOfferVersion !== offerEditVersion(cur)
    ) {
      if (
        name === cur.name &&
        price === cur.price &&
        note === cur.note &&
        (p.photoImageId === undefined || p.photoImageId === cur.photo_image_id)
      )
        return { ok: true, version: offerEditVersion(cur) };
      return {
        ok: false,
        conflict: true,
        error:
          "Esta oferta mudou em outra aba. Recarregue para conferir antes de salvar.",
      };
    }
    const style =
      p.style === undefined
        ? normalizeItemStyle(cur.style)
        : normalizeItemStyle(p.style);
    let variants = cur.variants as Variants | null;
    if (variants && p.sizes && variants.kind === "sizes") {
      if (p.sizes.length !== variants.rows.length)
        return {
          ok: false,
          error: "A tabela de tamanhos mudou. Recarregue a página.",
        };
      variants = {
        ...variants,
        rows: variants.rows.map((r, i) => {
          const label =
            String(p.sizes![i].label ?? "")
              .toUpperCase()
              .replace(/[^A-Z0-9/+-]/g, "")
              .slice(0, 6) || r.label;
          const u = p.sizes![i].units;
          return {
            ...r,
            label,
            units:
              u === null ||
              u === undefined ||
              !Number.isFinite(Number(u)) ||
              Number(u) < 0 ||
              Number(u) > 9999
                ? null
                : Math.round(Number(u)),
          };
        }),
      };
    }
    if (variants && p.showVariants !== undefined)
      variants = { ...variants, show: p.showVariants } as Variants;
    // a foto escolhida precisa ser do mesmo produto
    const photo = p.photoImageId === undefined ? undefined : p.photoImageId;
    if (
      photo &&
      !(
        await db.query(
          "select 1 from product_images where id=$1 and product_id=$2",
          [photo, cur.product_id],
        )
      ).rowCount
    )
      return {
        ok: false,
        error: "A foto não pertence ao produto desta oferta.",
      };
    await db.query(
      `update promo_items i set name = $2, price = $3, old_price = $4, note = $5, style = $6::jsonb, variants = $7::jsonb where i.id = $1`,
      [
        itemId,
        name,
        price,
        oldPrice,
        note,
        Object.keys(style).length ? JSON.stringify(style) : null,
        variants ? JSON.stringify(variants) : null,
      ],
    );
    if (photo !== undefined)
      await db.query(
        `update promo_items i set photo_image_ids='{}', photo_image_id = case when $2::uuid is not null and exists (select 1 from product_images m where m.id = $2 and m.product_id = i.product_id) then $2 else null end where i.id = $1`,
        [itemId, photo],
      );
    // registro de alterações: quem mudou o quê (nome, preço, preço original, subtítulo, foto)
    const log = (field: string, oldV: string | null, newV: string | null) =>
      logItemChange(db, {
        campaignId: cur.campaign_id,
        itemId,
        itemName: name,
        userId,
        field,
        oldV,
        newV,
      });
    if (name !== cur.name) await log("nome", cur.name, name);
    if (price !== cur.price) await log("preço", money(cur.price), money(price));
    if (oldPrice !== (cur.old_price ?? null))
      await log("preço original", money(cur.old_price), money(oldPrice));
    if (note !== (cur.note ?? null))
      await log("subtítulo", cur.note ?? null, note);
    if (photo !== undefined && photo !== (cur.photo_image_id ?? null))
      await log(
        "foto",
        cur.photo_image_id ? "outra foto" : "sem foto escolhida",
        photo ? "foto escolhida trocada" : "foto padrão do produto",
      );
    await touch(db, cur.campaign_id);
    return {
      ok: true,
      version: offerEditVersion({
        ...cur,
        name,
        price,
        note,
        photo_image_id: photo === undefined ? cur.photo_image_id : photo,
        photo_image_ids: photo === undefined ? cur.photo_image_ids : [],
      }),
    };
  });
}

/** Textos da promoção que valem no lugar dos do tema (etiqueta, rodapé, texto livre). */
export async function saveOverrides(
  campaignId: string,
  o: PromoOverrides,
): Promise<{ ok: boolean; error?: string }> {
  const clean = normalizeOverrides(o);
  const bg = clean.background;
  if (
    bg?.kind === "asset" &&
    !(
      await pool.query(
        `select 1 from promo_assets where id = $1 and campaign_id = $2`,
        [bg.asset, campaignId],
      )
    ).rowCount
  )
    delete clean.background;
  if (
    bg?.kind === "theme" &&
    !(
      await pool.query(
        `select 1 from promo_theme_assets where theme_id = $1 and role = 'background'`,
        [bg.themeId],
      )
    ).rowCount
  )
    delete clean.background;
  const r = await pool.query(
    `update promo_campaigns set overrides = $2::jsonb where id = $1`,
    [campaignId, Object.keys(clean).length ? JSON.stringify(clean) : null],
  );
  if (!r.rowCount) return { ok: false, error: "Promoção não encontrada." };
  await touch(pool, campaignId);
  return { ok: true };
}

/** Guarda os elementos livres da promoção. Imagem que não pertence à promoção é descartada; qualquer mudança tira a aprovação. */
export async function saveLayers(
  campaignId: string,
  raw: unknown,
  expectedRev?: number,
  designPages?: number,
  userId: string | null = null,
): Promise<{
  ok: boolean;
  error?: string;
  layers?: Layers;
  rev?: number;
  conflict?: boolean;
}> {
  const layers = normalizeLayers(raw);
  const used = [
    ...new Set(
      PROMO_FORMAT_KEYS.flatMap((f) =>
        layers[f].map((l) => l.asset).filter((x): x is string => !!x),
      ),
    ),
  ];
  if (used.length) {
    const ok = new Set(
      (
        await pool.query(
          `select id from promo_assets where campaign_id = $1 and id = any($2::uuid[])`,
          [campaignId, used],
        )
      ).rows.map((r) => r.id as string),
    );
    for (const f of PROMO_FORMAT_KEYS)
      layers[f] = layers[f].filter(
        (l) => l.type !== "image" || (l.asset && ok.has(l.asset)),
      );
  }
  const r = await pool.query(
    `update promo_campaigns set layers = $2::jsonb, layers_rev = layers_rev + 1, design_pages = case when kind = 'design' and $4::int is not null then least(30, greatest(1, $4::int)) else design_pages end where id = $1 and ($3::int is null or layers_rev = $3) returning layers_rev`,
    [
      campaignId,
      JSON.stringify(layers),
      expectedRev ?? null,
      designPages ?? null,
    ],
  );
  if (!r.rowCount) {
    if (
      !(
        await pool.query(`select 1 from promo_campaigns where id = $1`, [
          campaignId,
        ])
      ).rowCount
    )
      return { ok: false, error: "Promoção não encontrada." };
    return {
      ok: false,
      conflict: true,
      error:
        "Os elementos desta promoção foram alterados em outra aba ou por outra pessoa. Suas mudanças não foram salvas.",
    };
  }
  await touch(pool, campaignId);
  await autoSnapshot(pool, campaignId, userId);
  return { ok: true, layers, rev: r.rows[0].layers_rev };
}

/** Imagem enviada para usar como elemento (logo, selo, adesivo): vira WEBP de até 2000 px, mantendo a transparência. A mesma imagem não entra duas vezes. */
export async function addAsset(
  campaignId: string,
  buf: Buffer,
  userId: string,
): Promise<
  | { ok: true; id: string; width: number; height: number }
  | { ok: false; error: string }
> {
  if (!(await campaignAccess(campaignId)))
    return { ok: false, error: "Promoção não encontrada." };
  if (buf.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (buf.length > 8 * 1024 * 1024)
    return { ok: false, error: "A imagem passa de 8 MB." };
  if (!sniffImage(buf))
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." };
  if (
    !(
      await pool.query(`select 1 from promo_campaigns where id = $1`, [
        campaignId,
      ])
    ).rowCount
  )
    return { ok: false, error: "Promoção não encontrada." };
  try {
    const out = await sharp(buf, {
      failOn: "error",
      limitInputPixels: 60_000_000,
    })
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90, alphaQuality: 95 })
      .toBuffer({ resolveWithObject: true });
    const sha = createHash("sha256").update(out.data).digest("hex");
    const r = await pool.query(
      `insert into promo_assets (campaign_id, data, width, height, sha256, created_by) values ($1, $2, $3, $4, $5, $6)
       on conflict (campaign_id, sha256) do update set sha256 = excluded.sha256 returning id`,
      [campaignId, out.data, out.info.width, out.info.height, sha, userId],
    );
    return {
      ok: true,
      id: r.rows[0].id,
      width: out.info.width,
      height: out.info.height,
    };
  } catch {
    return {
      ok: false,
      error:
        "Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).",
    };
  }
}

export async function getAsset(
  assetId: string,
  mini = false,
): Promise<{ data: Buffer; mime: string; sha: string } | null> {
  const owner = (
    await pool.query("select campaign_id from promo_assets where id=$1", [
      assetId,
    ])
  ).rows[0];
  if (!owner || !(await campaignAccess(owner.campaign_id))) return null;
  const r = (
    await pool.query(
      `select data, mime, sha256 from promo_assets where id = $1`,
      [assetId],
    )
  ).rows[0];
  if (!r) return null;
  if (!mini) return { data: r.data, mime: r.mime, sha: r.sha256 };
  // miniatura para a galeria (não muda o arquivo guardado)
  const small = await sharp(r.data)
    .resize({
      width: 320,
      height: 320,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();
  return { data: small, mime: "image/webp", sha: `${r.sha256}-m` };
}

/** Apaga uma imagem enviada, se nenhum elemento nem o fundo da promoção a usa. */
export async function deleteAsset(
  campaignId: string,
  assetId: string,
): Promise<{ ok: boolean; error?: string }> {
  const c = (
    await pool.query(
      `select layers, overrides from promo_campaigns where id = $1`,
      [campaignId],
    )
  ).rows[0];
  if (!c) return { ok: false, error: "Promoção não encontrada." };
  const layers = normalizeLayers(c.layers),
    bg = normalizeOverrides(c.overrides).background;
  if (
    (bg?.kind === "asset" && bg.asset === assetId) ||
    PROMO_FORMAT_KEYS.some((f) => layers[f].some((l) => l.asset === assetId))
  )
    return {
      ok: false,
      error:
        "Esta imagem está em uso na peça (fundo ou elemento). Troque ou remova antes de excluir.",
    };
  try {
    const used = await pool.query(
      "select 1 from studio_pages where position($1 in scene::text)>0 limit 1",
      [assetId],
    );
    if (used.rowCount)
      return {
        ok: false,
        error: "Esta imagem está em uso em uma arte do Encartiva Studio.",
      };
  } catch (e) {
    if ((e as { code?: string }).code !== "42P01") throw e;
  }
  const r = await pool.query(
    `delete from promo_assets where id = $1 and campaign_id = $2`,
    [assetId, campaignId],
  );
  if (!r.rowCount) return { ok: false, error: "Imagem não encontrada." };
  await touch(pool, campaignId);
  return { ok: true };
}

/** Troca o produto do banco de imagens que fornece as fotos do encarte (a foto escolhida antes é esquecida). */
export async function setItemProduct(
  itemId: string,
  productId: string,
  userId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    if (
      !(
        await db.query(`select 1 from products where id = $1 and active`, [
          productId,
        ])
      ).rowCount
    )
      return { ok: false, error: "Produto não encontrado." };
    const r = await db.query(
      `update promo_items set product_id = $2, photo_image_id = null, photo_image_ids='{}' where id = $1 returning campaign_id, name`,
      [itemId, productId],
    );
    if (!r.rowCount) return { ok: false, error: "Item não encontrado." };
    const pd = (
      await db.query(`select description from products where id = $1`, [
        productId,
      ])
    ).rows[0];
    await logItemChange(db, {
      campaignId: r.rows[0].campaign_id,
      itemId,
      itemName: r.rows[0].name,
      userId,
      field: "produto da foto",
      oldV: null,
      newV: pd?.description ?? null,
    });
    await touch(db, r.rows[0].campaign_id);
    return { ok: true };
  });
}

/**
 * Foto enviada direto no encarte que está sem foto. A imagem entra no banco de imagens (fundo transparente quando o fundo for liso) ligada ao produto;
 * se o código de barras ainda não estava no catálogo, o produto é criado com a descrição do encarte.
 */
export async function attachItemPhoto(
  itemId: string,
  buf: Buffer,
  fileName: string,
  userId: string,
): Promise<{ ok: true; imageId: string } | { ok: false; error: string }> {
  const it = (
    await pool.query(
      `select campaign_id, ean, name, product_id from promo_items where id = $1`,
      [itemId],
    )
  ).rows[0];
  if (!it) return { ok: false, error: "Item não encontrado." };
  let productId: string | null = it.product_id;
  if (!productId) {
    if (it.ean)
      productId =
        (
          await pool.query(
            `select id from products where ean = $1 and active`,
            [it.ean],
          )
        ).rows[0]?.id ?? null;
    if (!productId) {
      const created = await saveProduct(
        null,
        {
          description: it.name,
          ean: it.ean,
          group_name: null,
          manufacturer: null,
          active_ingredient: null,
        },
        userId,
      );
      if (!created.ok) return { ok: false, error: created.error };
      productId = created.id;
    }
    await pool.query(`update promo_items set product_id = $2 where id = $1`, [
      itemId,
      productId,
    ]);
  }
  const r = await ingestImage({
    buf,
    fileName,
    userId,
    source: "upload",
    productId,
    method: "manual",
  });
  if (r.status === "invalida")
    return { ok: false, error: r.error ?? "Imagem não aceita." };
  let imageId = r.imageId ?? null;
  if (!imageId)
    imageId =
      (
        await pool.query(
          `select id from product_images where product_id = $1 order by is_primary desc, created_at limit 1`,
          [productId],
        )
      ).rows[0]?.id ?? null; // já existia no produto
  if (!imageId) return { ok: false, error: "Não consegui guardar a imagem." };
  await pool.query(
    `update promo_items set photo_image_id = $2,photo_image_ids='{}' where id = $1`,
    [itemId, imageId],
  );
  await logItemChange(pool, {
    campaignId: it.campaign_id,
    itemId,
    itemName: it.name,
    userId,
    field: "foto enviada",
    oldV: null,
    newV: fileName.slice(0, 80),
  });
  await touch(pool, it.campaign_id);
  return { ok: true, imageId };
}

export async function removeItem(
  itemId: string,
  userId: string | null = null,
): Promise<void> {
  await withTx(async (db) => {
    const it = (
      await db.query(
        `delete from promo_items where id = $1 returning campaign_id, position, name, price::float8 as price`,
        [itemId],
      )
    ).rows[0];
    if (it) {
      await logItemChange(db, {
        campaignId: it.campaign_id,
        itemId: null,
        itemName: it.name,
        userId,
        field: "encarte removido",
        oldV: money(it.price),
        newV: null,
      });
      await db.query(
        `update promo_items set position = position - 1 where campaign_id = $1 and position > $2`,
        [it.campaign_id, it.position],
      );
      await touch(db, it.campaign_id);
    }
  });
}

/** Move um item uma posição para cima (-1) ou para baixo (+1). */
export async function moveItem(itemId: string, dir: -1 | 1): Promise<void> {
  await withTx(async (db) => {
    const it = (
      await db.query(
        `select campaign_id, position from promo_items where id = $1 for update`,
        [itemId],
      )
    ).rows[0];
    if (!it) return;
    const other = (
      await db.query(
        `select id from promo_items where campaign_id = $1 and position = $2 for update`,
        [it.campaign_id, it.position + dir],
      )
    ).rows[0];
    if (!other) return;
    // posição temporária para não bater na regra de unicidade
    await db.query(`update promo_items set position = -1 where id = $1`, [
      itemId,
    ]);
    await db.query(`update promo_items set position = $2 where id = $1`, [
      other.id,
      it.position,
    ]);
    await db.query(`update promo_items set position = $2 where id = $1`, [
      itemId,
      it.position + dir,
    ]);
    await touch(db, it.campaign_id);
  });
}

export async function addItem(
  campaignId: string,
  productId: string,
  price: number,
  userId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  if (!(price >= 0 && price < 100000))
    return { ok: false, error: "Preço inválido." };
  return withTx(async (db) => {
    const p = (
      await db.query(
        `select id, ean, description from products where id = $1 and active`,
        [productId],
      )
    ).rows[0];
    if (!p) return { ok: false, error: "Produto não encontrado." };
    if (
      !(
        await db.query(`select 1 from promo_campaigns where id = $1`, [
          campaignId,
        ])
      ).rowCount
    )
      return { ok: false, error: "Promoção não encontrada." };
    const pos = (
      await db.query(
        `select coalesce(max(position), 0) + 1 as n from promo_items where campaign_id = $1`,
        [campaignId],
      )
    ).rows[0].n as number;
    const ins = await db.query(
      `insert into promo_items (campaign_id, position, ean, product_id, name, price) values ($1, $2, $3, $4, $5, $6) returning id`,
      [campaignId, pos, p.ean, p.id, displayName(p.description), price],
    );
    await logItemChange(db, {
      campaignId,
      itemId: ins.rows[0].id,
      itemName: displayName(p.description),
      userId,
      field: "encarte adicionado",
      oldV: null,
      newV: money(price),
    });
    await touch(db, campaignId);
    return { ok: true };
  });
}

/** Define a ordem dos produtos da promoção (a lista precisa ter exatamente os mesmos itens). Usada ao arrastar na peça ou na lista. */
export async function reorderItems(
  campaignId: string,
  ids: string[],
): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const cur = (
      await db.query(
        `select id from promo_items where campaign_id = $1 for update`,
        [campaignId],
      )
    ).rows.map((r) => r.id as string);
    if (
      cur.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((i) => cur.includes(i))
    )
      return {
        ok: false,
        error:
          "A lista de produtos mudou. Recarregue a página e tente de novo.",
      };
    // posições temporárias negativas: a regra de unicidade (campanha, posição) não pode bater no meio da troca
    await db.query(
      `update promo_items set position = -position - 1 where campaign_id = $1`,
      [campaignId],
    );
    await db.query(
      `update promo_items i set position = u.ord from unnest($2::uuid[]) with ordinality as u(id, ord) where i.id = u.id and i.campaign_id = $1`,
      [campaignId, ids],
    );
    await touch(db, campaignId);
    return { ok: true };
  });
}

/** Desfaz um encarte agrupado: cada produto do grupo volta a ser um encarte próprio, logo depois do original. */
export async function ungroupItem(
  itemId: string,
  userId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const it = (
      await db.query(
        `select campaign_id, position, price, section, variants from promo_items where id = $1 for update`,
        [itemId],
      )
    ).rows[0];
    if (!it || !it.variants)
      return { ok: false, error: "Este encarte não é um grupo." };
    const v = it.variants as Variants;
    const members: { ean: string; name: string }[] =
      v.kind === "sizes"
        ? v.rows.map((r) => ({ ean: r.ean, name: r.name }))
        : v.members.map((m) => ({ ean: m.ean, name: m.name }));
    if (members.length < 2)
      return { ok: false, error: "Este encarte não é um grupo." };
    const prods = (
      await db.query(
        `select id, ean from products where ean = any($1::text[]) and active`,
        [members.map((m) => m.ean)],
      )
    ).rows;
    const pid = new Map(prods.map((p) => [p.ean as string, p.id as string]));
    const extra = members.length - 1;
    // abre espaço (posições temporárias negativas para não bater na unicidade) e insere os outros membros logo depois
    await db.query(
      `update promo_items set position = -position - 1 where campaign_id = $1 and position > $2`,
      [it.campaign_id, it.position],
    );
    await db.query(
      `update promo_items set position = -position - 1 + $3 where campaign_id = $1 and position < 0 and -position - 1 > $2`,
      [it.campaign_id, it.position, extra],
    );
    await logItemChange(db, {
      campaignId: it.campaign_id,
      itemId,
      itemName: members[0].name,
      userId,
      field: "encarte desagrupado",
      oldV: `${members.length} produtos num encarte`,
      newV: `${members.length} encartes`,
    });
    await db.query(
      `update promo_items set name = $2, ean = $3, product_id = $4, variants = null, photo_image_id = null, photo_image_ids='{}' where id = $1`,
      [
        itemId,
        displayName(members[0].name),
        members[0].ean,
        pid.get(members[0].ean) ?? null,
      ],
    );
    for (let k = 1; k < members.length; k++) {
      await db.query(
        `insert into promo_items (campaign_id, position, ean, product_id, name, price, section) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          it.campaign_id,
          it.position + k,
          members[k].ean,
          pid.get(members[k].ean) ?? null,
          displayName(members[k].name),
          it.price,
          it.section,
        ],
      );
    }
    await touch(db, it.campaign_id);
    return { ok: true };
  });
}

// ---------- miniatura da arte (gerada no editor) ----------
/** Guarda a miniatura da primeira peça (WEBP de até 360 px de largura). Não mexe na aprovação: é só uma prévia. */
export async function saveThumb(
  id: string,
  buf: Buffer,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await campaignAccess(id)))
    return { ok: false, error: "Promoção não encontrada." };
  if (buf.length === 0 || buf.length > 400 * 1024)
    return { ok: false, error: "Miniatura inválida." };
  if (!sniffImage(buf))
    return { ok: false, error: "A miniatura precisa ser uma imagem." };
  try {
    const out = await sharp(buf, {
      failOn: "error",
      limitInputPixels: 20_000_000,
    })
      .resize({ width: 360, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const r = await pool.query(
      `update promo_campaigns set thumb = $2, thumb_at = now() where id = $1`,
      [id, out],
    );
    return r.rowCount ? { ok: true } : { ok: false, error: "Não encontrado." };
  } catch {
    return { ok: false, error: "Não consegui ler a miniatura." };
  }
}

export async function getThumb(
  id: string,
): Promise<{ data: Buffer; at: string } | null> {
  if (!(await campaignAccess(id))) return null;
  const r = (
    await pool.query(
      `select thumb, thumb_at::text as at from promo_campaigns where id = $1 and thumb is not null`,
      [id],
    )
  ).rows[0];
  return r ? { data: r.thumb, at: r.at } : null;
}

// ---------- artes fixas do tema (bonecos, logos, fundos…) ----------
/** Guarda uma arte no tema: WEBP de até 2000 px, com transparência. A mesma imagem não entra duas vezes no mesmo tema. */
export async function addThemeArt(o: {
  themeId: string;
  buf: Buffer;
  name: string;
  kind: string;
  userId: string;
}): Promise<
  { ok: true; id: string; duplicate: boolean } | { ok: false; error: string }
> {
  if (o.buf.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (o.buf.length > 8 * 1024 * 1024)
    return { ok: false, error: "A imagem passa de 8 MB." };
  if (!sniffImage(o.buf))
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." };
  if (
    !(await pool.query(`select 1 from promo_themes where id = $1`, [o.themeId]))
      .rowCount
  )
    return { ok: false, error: "Tema não encontrado." };
  if (
    Number(
      (
        await pool.query(
          `select count(*)::int n from promo_theme_arts where theme_id = $1`,
          [o.themeId],
        )
      ).rows[0].n,
    ) >= MAX_THEME_ARTS
  )
    return { ok: false, error: `O tema aceita até ${MAX_THEME_ARTS} artes.` };
  const kind: ArtKind = isArtKind(o.kind) ? o.kind : "outro";
  const name =
    o.name
      .replace(/\.[^.]+$/, "")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Arte";
  try {
    const out = await sharp(o.buf, {
      failOn: "error",
      limitInputPixels: 60_000_000,
    })
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90, alphaQuality: 95 })
      .toBuffer({ resolveWithObject: true });
    const sha = createHash("sha256").update(out.data).digest("hex");
    const dup = (
      await pool.query(
        `select id from promo_theme_arts where theme_id = $1 and sha256 = $2`,
        [o.themeId, sha],
      )
    ).rows[0];
    if (dup) return { ok: true, id: dup.id, duplicate: true };
    const r = await pool.query(
      `insert into promo_theme_arts (theme_id, name, kind, data, width, height, sha256, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        o.themeId,
        name,
        kind,
        out.data,
        out.info.width,
        out.info.height,
        sha,
        o.userId,
      ],
    );
    return { ok: true, id: r.rows[0].id, duplicate: false };
  } catch {
    return {
      ok: false,
      error:
        "Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).",
    };
  }
}

export async function getThemeArtImage(
  artId: string,
  mini = false,
): Promise<{ data: Buffer; mime: string; sha: string } | null> {
  const r = (
    await pool.query(
      `select data, mime, sha256 from promo_theme_arts where id = $1`,
      [artId],
    )
  ).rows[0];
  if (!r) return null;
  if (!mini) return { data: r.data, mime: r.mime, sha: r.sha256 };
  const small = await sharp(r.data)
    .resize({
      width: 240,
      height: 240,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();
  return { data: small, mime: "image/webp", sha: `${r.sha256}-m` };
}

/** Renomeia / troca o tipo da arte. */
export async function updateThemeArt(
  themeId: string,
  artId: string,
  v: { name: string; kind: string },
): Promise<{ ok: boolean; error?: string }> {
  const name = v.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name || !isArtKind(v.kind))
    return { ok: false, error: "Nome ou tipo inválido." };
  const r = await pool.query(
    `update promo_theme_arts set name = $3, kind = $4 where id = $2 and theme_id = $1`,
    [themeId, artId, name, v.kind],
  );
  return r.rowCount
    ? { ok: true }
    : { ok: false, error: "Arte não encontrada." };
}

/** Exclui a arte e tira das posições do tema. */
export async function deleteThemeArt(
  themeId: string,
  artId: string,
): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const r = await db.query(
      `delete from promo_theme_arts where id = $1 and theme_id = $2`,
      [artId, themeId],
    );
    if (!r.rowCount) return { ok: false, error: "Arte não encontrada." };
    const cur = normalizeLayers(
      (
        await db.query(`select fixed from promo_themes where id = $1`, [
          themeId,
        ])
      ).rows[0]?.fixed,
    );
    const next = { ...cur };
    for (const f of PROMO_FORMAT_KEYS)
      next[f] = cur[f].filter((l) => l.asset !== artId);
    await db.query(`update promo_themes set fixed = $2::jsonb where id = $1`, [
      themeId,
      JSON.stringify(next),
    ]);
    return { ok: true };
  });
}

/** Guarda onde cada arte fica em cada formato. Só entram imagens que são artes deste tema; limite por formato. */
export async function saveThemeFixed(
  themeId: string,
  raw: unknown,
): Promise<{ ok: boolean; error?: string; fixed?: Layers }> {
  const layers = normalizeLayers(raw);
  const ids = new Set(
    (
      await pool.query(`select id from promo_theme_arts where theme_id = $1`, [
        themeId,
      ])
    ).rows.map((r) => r.id as string),
  );
  for (const f of PROMO_FORMAT_KEYS)
    layers[f] = layers[f]
      .filter((l) => l.type === "image" && !!l.asset && ids.has(l.asset))
      .slice(0, MAX_FIXED_PER_FORMAT)
      .map((l) => ({ ...l, page: null, locked: false }));
  const r = await pool.query(
    `update promo_themes set fixed = $2::jsonb where id = $1`,
    [themeId, JSON.stringify(layers)],
  );
  return r.rowCount
    ? { ok: true, fixed: layers }
    : { ok: false, error: "Tema não encontrado." };
}
