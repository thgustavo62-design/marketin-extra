import {
  normalizeTheme,
  applyOverrides,
  paginateSections,
  PROMO_FORMAT_KEYS,
} from "@/lib/domain/promo";
import { promoLayout, promoLayoutGrid } from "@/lib/domain/promo-layouts";
import { NextResponse } from "next/server";
import { audit, sameOrigin } from "@/lib/auth";
import { isUuid } from "@/lib/form";
import { canWrite } from "@/lib/perms";
import {
  createCampaignFromRows,
  preparePromotionRows,
  getTheme,
} from "@/lib/promo/store";
import { parsePromoXlsx } from "@/lib/promo/xlsx";
import { getSession } from "@/lib/session";
import { pool } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { campaignModel } from "@/lib/promo/model-selection";

export const maxDuration = 60;

// Planilha de promoção (.xlsx, até 4 MB) → campanha com os produtos do catálogo, o nome do ERP e o preço da planilha.
export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.mustChange)
    return NextResponse.json(
      { error: "Sessão expirada. Entre novamente." },
      { status: 401 },
    );
  if (!sameOrigin(req))
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
  if (!canWrite(user.role))
    return NextResponse.json(
      { error: "Seu perfil é somente leitura." },
      { status: 403 },
    );
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envio inválido ou grande demais (máximo 4 MB)." },
      { status: 413 },
    );
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json(
      { error: "Escolha a planilha (.xlsx)." },
      { status: 400 },
    );
  if (file.size > 4 * 1024 * 1024)
    return NextResponse.json(
      { error: "A planilha passa de 4 MB." },
      { status: 413 },
    );
  let themeId = String(fd.get("theme_id") ?? "");
  const scope = await getScope();
  const companyId = scope.brand?.id ?? null;
  if (!companyId || String(fd.get("brand_id") ?? "") !== companyId)
    return NextResponse.json(
      {
        error:
          "Selecione a empresa da campanha no cabeçalho e tente novamente.",
      },
      { status: 409 },
    );
  const { prepareReferenceIdentity } = await import(
    "@/lib/promo/reference-identity"
  );
  await prepareReferenceIdentity(companyId, user.id);
  if (!themeId && !fd.get("model_key")) {
    themeId =
      (
        await pool.query(
          "select id from promo_themes where company_id=$1 and official_code='CP-MF-006' and active",
          [companyId],
        )
      ).rows[0]?.id ?? "";
  }
  let model;
  try {
    model = await campaignModel(
      {
        modelKey: String(
          fd.get("model_key") || (themeId ? "" : "ofertas-impacto"),
        ),
        primary: String(fd.get("model_primary") ?? ""),
        accent: String(fd.get("model_accent") ?? ""),
        useBrandColors: fd.get("model_brand_colors") === "1",
        priceLabel: String(fd.get("price_label") || ""),
      },
      companyId,
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && !("code" in e)
            ? e.message
            : "Não foi possível preparar o modelo.",
      },
      { status: 422 },
    );
  }
  const parsed = await parsePromoXlsx(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  const name =
    String(fd.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  const layout = String(fd.get("layout") ?? "theme");
  if (!promoLayout(layout))
    return NextResponse.json(
      { error: "Escolha um layout válido." },
      { status: 400 },
    );
  const overrides = {
      grid: promoLayoutGrid(layout),
      ...(model ? { model } : {}),
    },
    theme = !model && isUuid(themeId) ? await getTheme(themeId) : null;
  if (!model && themeId && !theme)
    return NextResponse.json(
      { error: "O tema selecionado não está mais disponível." },
      { status: 422 },
    );
  if (fd.get("preview") === "1") {
    const ready = await preparePromotionRows({
      rows: parsed.rows,
      groupVariants: String(fd.get("group") ?? "1") !== "0",
      sheets: parsed.sheets,
      rowErrors: parsed.errors,
    });
    if (!ready.ok)
      return NextResponse.json({ error: ready.error }, { status: 422 });
    const cfg = applyOverrides(theme?.config ?? normalizeTheme({}), overrides),
      pages = Object.fromEntries(
        PROMO_FORMAT_KEYS.map((f) => [
          f,
          Math.max(
            1,
            paginateSections(
              ready.rows,
              cfg.grid[f].cols * cfg.grid[f].rows,
              cfg.breakBySection[f],
            ).length,
          ),
        ]),
      );
    return NextResponse.json(
      {
        ok: true,
        preview: {
          report: ready.report,
          rows: ready.rows.slice(0, 100).map((r) => ({
            ean: r.ean,
            name: r.name,
            price: r.price,
            photo_id: r.photo_id,
          })),
          missingPhotos: ready.missingPhotos,
          missingCatalog: ready.missingCatalog,
          skipped: ready.skippedCount,
          pages,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const r = await createCampaignFromRows({
    name,
    themeId: !model && isUuid(themeId) ? themeId : null,
    title:
      String(fd.get("title") ?? "")
        .trim()
        .slice(0, 60) || null,
    validity:
      String(fd.get("validity") ?? "")
        .trim()
        .slice(0, 80) || null,
    rows: parsed.rows,
    userId: user.id,
    overrides,
    groupVariants: String(fd.get("group") ?? "1") !== "0",
    sheets: parsed.sheets,
    rowErrors: parsed.errors,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  await audit("promocao_criada", {
    userId: user.id,
    target: r.id,
    meta: {
      linhas: r.report.lines,
      encartes: r.report.encartes,
      grupos_tamanho: r.report.gruposTamanho,
      grupos_opcoes: r.report.gruposOpcoes,
      fora_do_catalogo: r.report.notInCatalog.length,
      sem_foto: r.report.withoutPhoto.length,
    },
  });
  return NextResponse.json({ ok: true, id: r.id, report: r.report });
}
