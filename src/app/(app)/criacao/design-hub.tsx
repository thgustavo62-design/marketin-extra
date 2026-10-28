"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers,
  LayoutTemplate,
  Monitor,
  Palette,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { DESIGN_PRESETS, type DesignPreset } from "@/lib/domain/design-presets";
import { createPresetAction } from "./actions";
type Recent = {
  id: string;
  name: string;
  thumb_at: string | null;
  pages: number;
};
export function DesignHub({
  canEdit,
  recent,
  total,
  models,
  aiReady,
}: {
  canEdit: boolean;
  recent: Recent[];
  total: number;
  models: number;
  aiReady: boolean;
}) {
  const [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [chosen, setChosen] = useState<DesignPreset | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, start] = useTransition(),
    dialog = useRef<HTMLDialogElement>(null),
    router = useRouter();
  useEffect(() => {
    if (chosen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [chosen]);
  const shown = DESIGN_PRESETS.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      `${p.name} ${p.description}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(
          query
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
        ),
  );
  const choose = (p: DesignPreset) => {
    setChosen(p);
    setName(p.name);
    setError("");
  };
  return (
    <>
      <section className="design-hero">
        <div>
          <span className="design-kicker">
            <Sparkles size={14} /> SEU ESTÚDIO CRIATIVO
          </span>
          <h1>
            O que vamos
            <br />
            <em>criar hoje?</em>
          </h1>
          <p>
            Da primeira ideia à peça final. Escolha um formato, use sua marca e
            dê vida à próxima campanha.
          </p>
          <Link href="/criacao/modelos" className="design-hero-link">
            Explorar modelos prontos <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="design-hero-art" aria-hidden="true">
          <div className="design-art-sheet">
            <span>ENCARTIVA</span>
            <b>
              Ideias que
              <br />
              ganham
              <br />
              <i>forma.</i>
            </b>
            <div className="design-art-orbit" />
          </div>
          <div className="design-art-tag">
            <Check size={14} /> Sua próxima criação
          </div>
        </div>
      </section>
      <div className="design-overview">
        <Link href="/criacao/projetos">
          <Layers size={20} />
          <span>
            <b>{total}</b>
            <small>designs no workspace</small>
          </span>
          <ArrowUpRight size={15} />
        </Link>
        <Link href="/criacao/modelos">
          <LayoutTemplate size={20} />
          <span>
            <b>Modelos prontos</b>
            <small>Farmácia e {models} modelos salvos</small>
          </span>
          <ArrowUpRight size={15} />
        </Link>
        <Link href="/criacao/ia">
          <Sparkles size={20} />
          <span>
            <b>Imagens e IA</b>
            <small>
              {aiReady ? "Ferramentas disponíveis" : "Prepare sua integração"}
            </small>
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <section aria-labelledby="create-design-title">
        <div className="design-section-head">
          <div>
            <span className="design-kicker">COMECE PELO FORMATO</span>
            <h2 id="create-design-title">Uma ideia, muitas possibilidades.</h2>
          </div>
          <label className="design-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar formato de design"
              placeholder="Buscar formato…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div
          className="design-categories"
          role="group"
          aria-label="Categoria do design"
        >
          {[
            { id: "all", name: "Todos os formatos" },
            { id: "social", name: "Redes sociais" },
            { id: "print", name: "Impressos" },
            { id: "display", name: "TV e banners" },
          ].map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {!canEdit && (
          <p className="notice">
            Seu perfil permite visualizar e exportar os designs. A criação é
            feita por editores e administradores.
          </p>
        )}
        <div className="design-format-grid">
          {shown.map((p) => (
            <button
              type="button"
              className={`design-format-card design-tone-${p.category}`}
              key={p.id}
              disabled={!canEdit}
              onClick={() => choose(p)}
              aria-label={`Criar ${p.name}`}
            >
              <div
                className={`design-format-preview ${p.visual}`}
                aria-hidden="true"
              >
                <div className="design-preview-frame">
                  <span />
                  <b />
                  <i />
                </div>
                {p.visual === "carousel" && (
                  <span className="design-preview-pages">5 páginas</span>
                )}
                <span className="design-format-add">
                  <Plus size={17} />
                </span>
              </div>
              <div className="design-format-copy">
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <small>{p.size}</small>
              </div>
            </button>
          ))}
        </div>
        {shown.length === 0 && (
          <p className="empty">Nenhum formato encontrado. Tente outro termo.</p>
        )}
      </section>
      <section className="design-promo-callout">
        <div className="design-promo-icon">
          <Monitor size={23} />
        </div>
        <div>
          <h2>Vai criar uma campanha com produtos?</h2>
          <p>
            Use suas planilhas, preços e fotos para montar promoções automáticas
            e finalizar no mesmo editor.
          </p>
        </div>
        <Link href="/promocoes" className="btn">
          Abrir promoções <ArrowRight size={16} />
        </Link>
      </section>
      <section aria-labelledby="recent-designs-title">
        <div className="design-section-head">
          <div>
            <span className="design-kicker">CONTINUE DE ONDE PAROU</span>
            <h2 id="recent-designs-title">Seus designs recentes</h2>
          </div>
          <Link href="/criacao/projetos" className="design-text-link">
            Ver todos <ArrowRight size={15} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="design-empty">
            <Palette size={28} />
            <b>Sua próxima ideia começa aqui.</b>
            <p>Escolha um formato acima ou use um modelo da sua biblioteca.</p>
          </div>
        ) : (
          <div className="design-recent-grid">
            {recent.map((d) => (
              <Link
                key={d.id}
                className="design-recent-card"
                href={`/studio/${d.id}`}
              >
                <div>
                  {d.thumb_at ? (
                    <img
                      src={`/api/promocoes/miniatura/${d.id}?v=${encodeURIComponent(d.thumb_at)}`}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <Palette size={32} />
                  )}
                </div>
                <b>{d.name}</b>
                <small>
                  {d.pages} {d.pages === 1 ? "página" : "páginas"}{" "}
                  <ArrowUpRight size={14} />
                </small>
              </Link>
            ))}
          </div>
        )}
      </section>
      <dialog
        ref={dialog}
        className="design-create-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setChosen(null);
        }}
      >
        <button
          type="button"
          className="ghost design-dialog-close"
          aria-label="Fechar novo design"
          disabled={busy}
          onClick={() => setChosen(null)}
        >
          <X size={19} />
        </button>
        {chosen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              start(async () => {
                const r = await createPresetAction(name, chosen.id);
                if (r.ok) router.push(`/studio/${r.id}`);
                else setError(r.error ?? "Não foi possível criar.");
              });
            }}
          >
            <span className="design-kicker">NOVO DESIGN</span>
            <h2>{chosen.name}</h2>
            <p className="muted">
              {chosen.size} ·{" "}
              {chosen.pages === 1
                ? "Uma página em branco"
                : `${chosen.pages} páginas em branco`}
            </p>
            <label htmlFor="preset-design-name">
              Como vamos chamar esta criação?
            </label>
            <input
              id="preset-design-name"
              type="text"
              value={name}
              maxLength={120}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary"
              disabled={busy || name.trim().length < 2}
            >
              {busy ? "Preparando seu design…" : "Criar e abrir no editor"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
