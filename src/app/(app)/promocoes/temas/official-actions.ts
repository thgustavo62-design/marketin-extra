"use server";
import { revalidatePath } from "next/cache";
import { writerOrError, audit } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { str, type FormState } from "@/lib/form";
import { DEFAULT_THEME } from "@/lib/domain/promo";
import { DEFAULT_OFFER_IDENTITY } from "@/lib/domain/offer-identity";
export async function installOfficialIdentity(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (str(fd, "confirmation") !== "MINAS FARMA")
    return {
      error: "Digite MINAS FARMA para confirmar a empresa da identidade.",
    };
  try {
    await withTx(async (db) => {
      const c = (
        await db.query(
          "select id,name,slug,owner_id from companies where id=nova7_private.active_company() and nova7_private.manage_company(id)",
        )
      ).rows[0];
      // Resolve the real company record, never infer ownership and never use a fixed UUID.
      if (!c || c.slug !== "minas-farma" || !c.owner_id)
        throw Error(
          "Selecione o cadastro real Minas Farma com proprietário já confirmado pela administração.",
        );
      const config = {
        ...DEFAULT_THEME,
        title: "CORTA PREÇO",
        showTag: false,
        stack: false,
        clouds: false,
        colors: {
          ...DEFAULT_THEME.colors,
          panel: "#ffffff",
          name: "#000000",
          skyTop: "#e90016",
          skyBottom: "#b90010",
          footer: "#bc0010",
        },
        grid: {
          story: { cols: 3, rows: 4 },
          feed: { cols: 3, rows: 3 },
          a4: { cols: 3, rows: 5 },
        },
        panel: { story: true, feed: true, a4: true },
        offerIdentity: DEFAULT_OFFER_IDENTITY,
      };
      const existing = (
        await db.query(
          "select id from promo_themes where company_id=$1 and official_code='CP-MF-006'",
          [c.id],
        )
      ).rows[0];
      if (existing) return;
      const theme = (
        await db.query(
          "insert into promo_themes(name,config,company_id,visibility,created_by,official_code)values('Minas Farma — Corta Preço 3D',$1,$2,'company',$3,'CP-MF-006')returning id",
          [JSON.stringify(config), c.id, g.user.id],
        )
      ).rows[0];
      const components = [
        ["CP-MF-001", "Etiqueta Corta Preço 3D", "price"],
        ["CP-MF-002", "Base Corta Preço sem valor", "base"],
        ["CP-MF-003", "Faixa Dourada de Fragrâncias", "ribbon"],
        ["CP-MF-004", "Descrição de Produto", "description"],
        ["CP-MF-005", "Composição de Oferta", "offer"],
        ["CP-MF-006", "Encarte Corta Preço", "flyer"],
      ];
      for (const [code, name, kind] of components)
        await db.query(
          "insert into campaign_components(company_id,code,name,kind,config,theme_id,created_by)values($1,$2,$3,$4,$5,$6,$7)",
          [
            c.id,
            code,
            name,
            kind,
            JSON.stringify(kind === "flyer" ? config : DEFAULT_OFFER_IDENTITY),
            theme.id,
            g.user.id,
          ],
        );
    });
    await audit("identidade_oficial_instalada", {
      userId: g.user.id,
      meta: { identity: "CP-MF", version: 1 },
    });
    revalidatePath("/promocoes/temas");
    return {
      ok: "Componentes CP-MF-001 a CP-MF-006 cadastrados exclusivamente na Minas Farma. Configure cabeçalho, rodapé e confira a prévia antes de aprovar.",
    };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Não foi possível cadastrar a identidade.",
    };
  }
}
