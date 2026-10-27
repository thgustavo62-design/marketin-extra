import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { listCampaigns, listThemes } from "@/lib/promo/store";
import { catalogStats } from "@/lib/catalog/store";
import { NewPromo } from "./new-promo";
import { PromoTabs } from "./promo-tabs";

export default async function Promocoes() {
  const user = await requireUser();
  const [campaigns, themes, stats] = await Promise.all([
    listCampaigns(),
    listThemes(),
    catalogStats(),
  ]);
  const write = canWrite(user.role);
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Promoções automáticas</h1>
        <p>
          Traga a planilha, confira fotos e preços e finalize as peças no Nova7
          Studio.
        </p>
      </header>
      {write && (
        <div className="notice info">
          <span>
            <b>Revisão inteligente de encartes</b> · Confira os SKUs, aprove
            agrupamentos e escolha até duas fotos reais por oferta.{" "}
            <Link className="btn primary-link" href="/promocoes/importar">
              Importar e revisar campanha
            </Link>
          </span>
        </div>
      )}
      <div className="promo-readiness">
        <Link href="/produtos">
          <span>01 · CATÁLOGO</span>
          <b>{stats.products.toLocaleString("pt-BR")} produtos</b>
          <small>Cadastros e códigos de barras</small>
        </Link>
        <Link href="/produtos/importar#fotos">
          <span>02 · FOTOS DOS PRODUTOS</span>
          <b>{stats.withImage.toLocaleString("pt-BR")} produtos com foto</b>
          <small>Importar sua pasta de recortes</small>
        </Link>
        <Link href="/promocoes/temas">
          <span>03 · IDENTIDADE</span>
          <b>{themes.length} temas de campanha</b>
          <small>Cores, fundos e elementos da marca</small>
        </Link>
      </div>
      {write && (
        <NewPromo themes={themes.map((t) => ({ id: t.id, name: t.name }))} />
      )}
      <h2 style={{ marginTop: 22 }}>Promoções criadas</h2>
      {campaigns.length === 0 ? (
        <p className="empty">
          Nenhuma promoção ainda. Envie a primeira planilha acima.
        </p>
      ) : (
        <div className="cards">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/promocoes/${c.id}`}
              className="card"
              style={{ color: "inherit" }}
            >
              {c.thumb_at ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="design-thumb"
                  src={`/api/promocoes/miniatura/${c.id}?v=${encodeURIComponent(c.thumb_at)}`}
                  alt=""
                  loading="lazy"
                />
              ) : null}
              <h3>{c.name}</h3>
              <p className="muted">
                <span
                  className={`badge`}
                  style={
                    c.status === "aprovada"
                      ? { background: "#e1f5ec", color: "#1a7f4b" }
                      : undefined
                  }
                >
                  {c.status === "aprovada" ? "Aprovada" : "Em edição"}
                </span>{" "}
                {c.items} encarte(s) · {c.theme_name ?? "sem tema"} ·{" "}
                {c.created_at.slice(0, 10).split("-").reverse().join("/")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
