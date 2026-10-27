import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PROMO_FORMATS } from "@/lib/domain/promo";
import { canWrite } from "@/lib/perms";
import { listDesigns } from "@/lib/promo/store";
import { DesignCard } from "../design-card";

export default async function MeusDesigns() {
  const user = await requireUser();
  const designs = await listDesigns();
  const write = canWrite(user.role);
  return (
    <>
      <header className="page-head">
        <h1>Meus designs</h1>
        <p>
          Continue suas artes, duplique uma campanha ou comece um{" "}
          <Link href="/criacao">novo design</Link>.
        </p>
      </header>

      <h2 style={{ marginTop: 22 }}>Seus designs</h2>
      {designs.length === 0 ? (
        <p className="empty">
          Nenhum design ainda. Escolha um formato na aba Criar design.
        </p>
      ) : (
        <div className="cards">
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              canEdit={write}
              design={{
                thumbAt: d.thumb_at,
                id: d.id,
                name: d.name,
                status: d.status,
                pages: d.pages,
                format: d.format,
                formatLabel: PROMO_FORMATS[d.format].label,
                hint:
                  d.width && d.height
                    ? `${d.width} × ${d.height} px`
                    : PROMO_FORMATS[d.format].hint,
                updated: d.updated_at
                  .slice(0, 10)
                  .split("-")
                  .reverse()
                  .join("/"),
                by: d.created_by_name,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
