"use client";
import { CampaignModelPicker } from "@/components/campaign-model-picker";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PROMO_LAYOUTS } from "@/lib/domain/promo-layouts";
import type { ReviewImport, ReviewEdit } from "@/lib/promo/review-store";
import type { ReviewGroup } from "@/lib/domain/promotion-review";
import {
  changeReview,
  generateReview,
  refreshPhotos,
  approveSelected,
} from "../actions";
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Offer({
  g,
  data,
  canEdit,
  selected,
  onSelect,
}: {
  g: ReviewGroup;
  data: ReviewImport;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter(),
    [busy, start] = useTransition(),
    [error, setError] = useState(""),
    [title, setTitle] = useState(g.title),
    [price, setPrice] = useState(String(g.price)),
    [note, setNote] = useState(g.note),
    [members, setMembers] = useState(g.members.map((m) => m.ean)),
    [photos, setPhotos] = useState(g.photoIds),
    [variantLabels, setVariantLabels] = useState(
      Object.fromEntries(g.members.map((m) => [m.ean, m.variant])),
    );
  const all = [...g.members, ...g.candidates].filter(
      (m, i, a) => a.findIndex((x) => x.ean === m.ean) === i,
    ),
    available = all
      .filter((m) => members.includes(m.ean))
      .flatMap((m) => m.photos.map((p) => ({ ...p, ean: m.ean, name: m.name })))
      .filter((p, i, a) => a.findIndex((x) => x.sha === p.sha) === i);
  const send = (operation: ReviewEdit["operation"]) => {
    start(async () => {
      setError("");
      const r = await changeReview(data.id, data.revision, {
        groupId: g.id,
        operation,
        title,
        price: Number(price.replace(",", ".")),
        note,
        memberEans: members,
        photoIds: photos,
        variantLabels,
      });
      if (r.error) setError(r.error);
      else router.refresh();
    });
  };
  return (
    <article
      className="card review-offer"
      aria-label={`Revisar oferta ${g.title}`}
    >
      <div className="form-actions">
        <span
          className={`pill ${g.status === "confirmed" ? "on" : g.status === "review" ? "warn" : "soft"}`}
        >
          {g.status === "confirmed"
            ? "Agrupamento confirmado"
            : g.status === "review"
              ? "Sugestão para revisar"
              : "Produto individual"}
        </span>
        <small>Confiança {g.confidence}%</small>
        {canEdit && (
          <label className="check">
            <input type="checkbox" checked={selected} onChange={onSelect} />
            Selecionar para agrupar
          </label>
        )}
      </div>
      <div className="review-comparison">
        <section>
          <h3>Produtos originais</h3>
          {data.original_rows
            .filter((r) => g.lineIds.includes(r.id))
            .map((r) => (
              <div key={r.id} className="review-original">
                <b>{r.name}</b>
                <small>
                  {r.section} · linha {r.line} · EAN {r.ean}
                </small>
                <p>
                  {brl(r.price)} · REF: {r.reference || "—"}
                </p>
                <details>
                  <summary>Conferir valores originais</summary>
                  <pre>{JSON.stringify(r.original, null, 2)}</pre>
                </details>
              </div>
            ))}
        </section>
        <section>
          <h3>Oferta no encarte</h3>
          <label>
            Título
            <input
              type="text"
              aria-label={`Título ${g.id}`}
              value={title}
              maxLength={160}
              disabled={!canEdit || busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Preço da arte
            <input
              type="text"
              aria-label={`Preço ${g.id}`}
              value={price}
              inputMode="decimal"
              disabled={!canEdit || busy}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            Descrição complementar
            <textarea
              value={note}
              maxLength={400}
              disabled={!canEdit || busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <details>
            <summary>SKUs e variações participantes ({members.length})</summary>
            {all.map((m) => (
              <label key={m.ean} className="check">
                <input
                  type="checkbox"
                  checked={members.includes(m.ean)}
                  disabled={!canEdit || busy || m.imported}
                  onChange={(e) => {
                    setMembers(
                      e.target.checked
                        ? [...members, m.ean]
                        : members.filter((x) => x !== m.ean),
                    );
                    setPhotos(
                      photos.filter((id) => !m.photos.some((p) => p.id === id)),
                    );
                  }}
                />
                {m.name} · {m.ean}
                {m.imported
                  ? " · consta na planilha"
                  : " · confirmar participação"}
                {members.includes(m.ean) && (
                  <input
                    type="text"
                    aria-label={`Variação confirmada ${m.ean}`}
                    value={variantLabels[m.ean] ?? m.variant}
                    maxLength={100}
                    disabled={!canEdit || busy}
                    placeholder="Fragrância ou variação confirmada"
                    onChange={(e) =>
                      setVariantLabels({
                        ...variantLabels,
                        [m.ean]: e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
          </details>
          <div className="review-photo-options">
            {available.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={photos.includes(p.id)}
                  disabled={
                    !canEdit ||
                    busy ||
                    (!photos.includes(p.id) &&
                      photos.length >= data.rules.maxPhotos)
                  }
                  onChange={(e) =>
                    setPhotos(
                      e.target.checked
                        ? [...photos, p.id]
                        : photos.filter((id) => id !== p.id),
                    )
                  }
                />
                <img src={`/api/produtos/imagem/${p.id}?mini=1`} alt={p.name} />
                <small>{p.ean}</small>
              </label>
            ))}
            {!available.length && (
              <p className="notice">
                Sem foto exata.{" "}
                <Link href="/produtos/importar#fotos">
                  Importe e vincule as fotos dos produtos
                </Link>
                . Após importar, use Atualizar fotos da campanha.
              </p>
            )}
          </div>
          <ul>
            {g.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {canEdit && (
            <div className="form-actions">
              <button
                className="btn"
                disabled={busy}
                onClick={() => send("edit")}
              >
                Salvar alterações
              </button>
              <button
                className="btn primary-link"
                disabled={busy}
                onClick={() => send("approve")}
              >
                Aprovar oferta
              </button>
              {g.lineIds.length > 1 && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => send("split")}
                >
                  Desagrupar
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
export function ReviewEditor({
  data,
  themes,
  canEdit,
  initialModel = "",
  initialLabel,
  brandColors = [],
}: {
  data: ReviewImport;
  themes: { id: string; name: string }[];
  canEdit: boolean;
  initialModel?: string;
  initialLabel?: string;
  brandColors?: string[];
}) {
  const router = useRouter(),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, start] = useTransition();
  const pending = data.groups.filter(
      (g) => g.status === "review" && !g.approved,
    ),
    missing = data.groups.filter((g) => !g.photoIds.length),
    visible = data.groups.filter(
      (g) =>
        filter === "all" ||
        (filter === "pending" && g.status === "review" && !g.approved) ||
        (filter === "missing" && !g.photoIds.length),
    );
  return (
    <>
      <div className="cards">
        <div className="card">
          <b>{data.original_rows.length}</b> linhas originais
        </div>
        <div className="card">
          <b>{data.groups.length}</b> ofertas
        </div>
        <div className="card">
          <b>{pending.length}</b> para revisar
        </div>
        <div className="card">
          <b>{missing.length}</b> sem foto
        </div>
      </div>
      <details className="card">
        <summary>
          {data.diagnostics.sheets.length} categorias ·{" "}
          {data.diagnostics.errors.length} avisos da planilha
        </summary>
        <p>
          {data.diagnostics.sheets
            .map((s) => `${s.name}: ${s.items}`)
            .join(" · ")}
        </p>
        <ul>
          {data.diagnostics.errors.map((e, i) => (
            <li key={i}>
              {e.section}, linha {e.line}: {e.message}
            </li>
          ))}
        </ul>
      </details>
      {data.campaign_id ? (
        <p className="notice info">
          Campanha gerada.{" "}
          <Link href={`/studio/${data.campaign_id}`}>
            Abrir arte editável no Studio
          </Link>
        </p>
      ) : (
        <>
          <p className="muted">
            Salve alterações de título, preço, variações e fotos antes de
            aprovar ofertas em lote.
          </p>
          <div className="form-actions">
            {canEdit && (
              <>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => setSelected(visible.map((g) => g.id))}
                >
                  Selecionar ofertas visíveis
                </button>
                <button
                  className="btn"
                  disabled={busy || !selected.length}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Aprovar as ${selected.length} ofertas selecionadas? Confira os SKUs, fotos e preços antes de continuar.`,
                      )
                    )
                      return;
                    start(async () => {
                      const r = await approveSelected(
                        data.id,
                        data.revision,
                        selected,
                      );
                      if (r.error) setError(r.error);
                      else {
                        setSelected([]);
                        router.refresh();
                      }
                    });
                  }}
                >
                  Aprovar selecionadas
                </button>
              </>
            )}
            {canEdit && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await refreshPhotos(data.id, data.revision);
                    if (r.error) setError(r.error);
                    else router.refresh();
                  })
                }
              >
                Atualizar fotos da campanha
              </button>
            )}
            <label>
              Mostrar{" "}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todas as ofertas</option>
                <option value="pending">Sugestões para revisar</option>
                <option value="missing">Produtos sem foto</option>
              </select>
            </label>
            {canEdit && (
              <button
                className="btn"
                disabled={busy || selected.length < 2}
                onClick={() =>
                  start(async () => {
                    const r = await changeReview(data.id, data.revision, {
                      groupId: selected[0],
                      otherGroupIds: selected.slice(1),
                      operation: "merge",
                    });
                    if (r.error) setError(r.error);
                    else {
                      setSelected([]);
                      router.refresh();
                    }
                  })
                }
              >
                Agrupar selecionadas
              </button>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {visible.map((g) => (
            <Offer
              key={`${g.id}:${data.revision}`}
              g={g}
              data={data}
              canEdit={canEdit}
              selected={selected.includes(g.id)}
              onSelect={() =>
                setSelected(
                  selected.includes(g.id)
                    ? selected.filter((x) => x !== g.id)
                    : [...selected, g.id],
                )
              }
            />
          ))}
          {canEdit && (
            <form
              className="card stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  setError("");
                  const r = await generateReview(data.id, data.revision, {
                    layout: String(fd.get("layout")),
                    themeId: String(fd.get("theme_id") || ""),
                    modelKey: String(fd.get("model_key") || ""),
                    primary: String(fd.get("model_primary") || ""),
                    accent: String(fd.get("model_accent") || ""),
                    useBrandColors: fd.get("model_brand_colors") === "1",
                    priceLabel: String(fd.get("price_label") || ""),
                    title: String(fd.get("title") || ""),
                    validity: String(fd.get("validity") || ""),
                    square: fd.get("square") === "1",
                    confirmed: fd.get("confirmed") === "1",
                  });
                  if (r.error) setError(r.error);
                  else if (r.id) router.push(`/studio/${r.id}`);
                });
              }}
            >
              <h2>Gerar artes revisadas</h2>
              <CampaignModelPicker
                initial={initialModel}
                initialLabel={initialLabel}
                brandColors={brandColors}
              />
              <label>
                Layout e identidade
                <select name="theme_id">
                  <option value="">
                    Identidade automática da campanha ou padrão Encartiva
                  </option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Produtos por página
                <select name="layout">
                  {PROMO_LAYOUTS.map((l) => (
                    <option value={l.id} key={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" name="square" value="1" />
                Gerar o feed quadrado em 1080 × 1080 (story e A4 mantidos)
              </label>
              <label>
                Título nas artes
                <input type="text" name="title" maxLength={60} />
              </label>
              <label>
                Validade
                <input type="text" name="validity" maxLength={80} />
              </label>
              <label className="check">
                <input type="checkbox" name="confirmed" value="1" required />
                Conferi produtos, variações, preços e fotos antes de gerar.
              </label>
              <p>
                {pending.length
                  ? `Faltam ${pending.length} sugestões para aprovar ou desagrupar.`
                  : "Ofertas prontas para a confirmação final."}
              </p>
              <button className="primary" disabled={busy || pending.length > 0}>
                {busy ? "Gerando…" : "Confirmar revisão e gerar no Studio"}
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
