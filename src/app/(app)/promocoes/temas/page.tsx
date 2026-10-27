import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { listThemes } from "@/lib/promo/store";
import { PromoTabs } from "../promo-tabs";
import { NewTheme } from "./new-theme";
import { ModelPreview } from "./modelos/model-preview";
import { ModelTools, ImportModel, ModelCategory } from "./modelos/model-tools";

export default async function Temas() {
  const user = await requireUser();
  const themes = await listThemes(true);
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Layouts e modelos</h1>
        <p>
          <Link href="/promocoes">← Promoções</Link> · O tema é a
          &quot;cara&quot; da peça: cabeçalho, rodapé e fundo (suas artes) para
          story, feed e A4, mais cores, textos e quantos produtos por peça.
        </p>
      </header>
      {canWrite(user.role) && (
        <>
          <NewTheme />
          <ImportModel />
        </>
      )}
      {themes.length === 0 ? (
        <p className="empty">
          Nenhum tema ainda. Crie o primeiro: sem artes enviadas, o sistema usa
          um fundo azul padrão.
        </p>
      ) : (
        <div className="cards">
          {themes.map((t) => (
            <article key={t.id} className="card">
              <Link href={`/promocoes/temas/${t.id}`}>
                <h3>{t.name}</h3>
              </Link>
              <p className="muted">
                {t.category} · versão {t.version} ·{" "}
                {t.active ? "Ativo" : "Inativo"}
              </p>
              <ModelPreview id={t.id} config={t.config} roles={t.asset_roles} />
              <p>Story 1080×1920 · feed 1080×1350 · A4</p>
              <p className="muted">
                {t.assets} arte(s) · grade feed{" "}
                {t.config?.grid?.feed?.cols ?? 3} ×{" "}
                {t.config?.grid?.feed?.rows ?? 2}
              </p>
              {canWrite(user.role) && (
                <>
                  <ModelTools id={t.id} active={t.active} />
                  <ModelCategory
                    id={t.id}
                    category={t.category}
                    config={t.config}
                  />
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
