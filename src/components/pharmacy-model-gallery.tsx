"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { PHARMACY_MODELS } from "@/lib/domain/pharmacy-models";
import type { PromoFormat } from "@/lib/domain/promo";
import { CampaignModelPreview } from "./campaign-model-preview";

export function PharmacyModelGallery({
  canEdit,
  compact = false,
}: {
  canEdit: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("todos"),
    [format, setFormat] = useState<PromoFormat>("feed");
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const shown = PHARMACY_MODELS.filter(
    (m) =>
      (category === "todos" || category === m.category) &&
      norm(`${m.name} ${m.description} ${m.label}`).includes(norm(query)),
  );
  const categories = [
    ...new Map(PHARMACY_MODELS.map((m) => [m.category, m.label])).entries(),
  ];
  return (
    <section
      className="pharmacy-gallery"
      aria-label="Biblioteca global de farmácia"
    >
      <div className="design-section-head">
        <div>
          <span className="design-kicker">BIBLIOTECA ENCARTIVA</span>
          <h2>Modelos para a próxima campanha.</h2>
          <p>
            Disponíveis para todas as empresas. Personalize cores e use seus
            próprios produtos.
          </p>
        </div>
        <label className="design-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Buscar modelos de farmácia"
            placeholder="Buscar modelo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="model-gallery-toolbar">
        <div
          className="canva-chips"
          role="group"
          aria-label="Segmento dos modelos"
        >
          <button
            type="button"
            aria-pressed={category === "todos"}
            className={category === "todos" ? "on" : ""}
            onClick={() => setCategory("todos")}
          >
            Todos
          </button>
          {categories.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={category === id ? "on" : ""}
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Prévia em
          <select
            aria-label="Formato da prévia dos modelos"
            value={format}
            onChange={(e) => setFormat(e.target.value as PromoFormat)}
          >
            <option value="feed">Feed</option>
            <option value="story">Stories</option>
            <option value="a4">A4</option>
          </select>
        </label>
      </div>
      <div className={`pharmacy-model-grid${compact ? " compact" : ""}`}>
        {shown.map((m) => (
          <article
            key={m.key}
            className="pharmacy-model-card"
            data-model={m.key}
          >
            <CampaignModelPreview modelKey={m.key} format={format} />
            <div className="pharmacy-model-info">
              <span className="badge">{m.label}</span>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <div className="model-palette" aria-label="Cores sugeridas">
                <i style={{ background: m.primary }} />
                <i style={{ background: m.accent }} />
                <i style={{ background: m.surface }} />
                <small>Feed · Stories · A4</small>
              </div>
              {canEdit ? (
                <Link
                  className="btn primary-link"
                  href={`/promocoes/importar?modelo=${m.key}`}
                >
                  Usar com minha planilha <ArrowUpRight size={15} />
                </Link>
              ) : (
                <small>Seu acesso permite visualizar os modelos.</small>
              )}
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <p className="empty">
          Nenhum modelo encontrado. Experimente outra categoria.
        </p>
      )}
    </section>
  );
}
