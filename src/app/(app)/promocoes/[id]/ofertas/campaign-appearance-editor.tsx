"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import {
  PHARMACY_MODELS,
  pharmacyModel,
  type ModelSnapshot,
} from "@/lib/domain/pharmacy-models";
import {
  PRICE_LABELS,
  recommendedPriceLabel,
  type PriceLabelId,
} from "@/lib/domain/price-labels";
import {
  appearanceEditVersion,
  appearanceSelection,
  updateModelAppearance,
} from "@/lib/domain/campaign-appearance";
import type { PromoOverrides } from "@/lib/domain/promo";

export function CampaignAppearanceEditor({
  id,
  model,
  canEdit,
  offerDirty,
  onDirty,
  onPreview,
  onBusy,
  onApplied,
}: {
  id: string;
  model: ModelSnapshot;
  canEdit: boolean;
  offerDirty: boolean;
  onDirty: (value: boolean) => void;
  onPreview: (model: ModelSnapshot | undefined) => void;
  onBusy: (value: boolean) => void;
  onApplied: (overrides: PromoOverrides) => void;
}) {
  const [selection, setSelection] = useState(() => appearanceSelection(model));
  const [version, setVersion] = useState(() =>
    appearanceEditVersion({ model }),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const draft = useMemo(
    () => updateModelAppearance(model, selection),
    [model, selection],
  );
  const dirty =
    appearanceEditVersion({ model: draft }) !==
    appearanceEditVersion({ model });
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(
    () => onPreview(dirty ? draft : undefined),
    [dirty, draft, onPreview],
  );

  async function save() {
    if (saving.current || !canEdit || offerDirty || !dirty) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/promocoes/${id}/visual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ ...selection, version }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.error || "Não foi possível salvar.");
      setVersion(result.version);
      setSelection(appearanceSelection(result.overrides.model));
      onApplied(result.overrides);
      onDirty(false);
      onPreview(undefined);
      setMessage(
        "Visual salvo. No Studio, use “Regenerar página” nas páginas que deseja atualizar.",
      );
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "O servidor demorou para responder. Suas escolhas foram mantidas; tente novamente.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <section
      className="card campaign-appearance-editor"
      aria-label="Visual desta campanha"
    >
      <div>
        <span className="design-kicker">VISUAL DA CAMPANHA</span>
        <h2>Outra composição, as mesmas ofertas.</h2>
        <p className="muted">
          Troque modelo, cores e etiqueta sem reenviar a planilha. A prévia do
          produto selecionado acompanha suas escolhas.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!canEdit || busy || offerDirty}>
          <div className="campaign-appearance-fields">
            <label>
              Modelo da campanha
              <select
                aria-label="Modelo da campanha"
                value={selection.modelKey}
                onChange={(e) => {
                  const m = pharmacyModel(e.target.value)!;
                  setSelection({
                    modelKey: m.key,
                    primary: m.primary,
                    accent: m.accent,
                    priceLabel: recommendedPriceLabel(m.key),
                  });
                  setMessage("");
                }}
              >
                {PHARMACY_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etiqueta geral da campanha
              <select
                aria-label="Etiqueta geral da campanha"
                value={selection.priceLabel}
                onChange={(e) =>
                  setSelection({
                    ...selection,
                    priceLabel: e.target.value as PriceLabelId,
                  })
                }
              >
                {PRICE_LABELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cor principal
              <input
                type="color"
                aria-label="Cor principal da campanha"
                value={selection.primary}
                onChange={(e) =>
                  setSelection({ ...selection, primary: e.target.value })
                }
              />
            </label>
            <label>
              Cor de destaque
              <input
                type="color"
                aria-label="Cor de destaque da campanha"
                value={selection.accent}
                onChange={(e) =>
                  setSelection({ ...selection, accent: e.target.value })
                }
              />
            </label>
          </div>
          <div className="quick-offer-actions">
            <button
              type="submit"
              className="btn primary-link"
              disabled={!dirty}
            >
              <Save size={16} />
              {busy ? "Salvando visual…" : "Salvar visual da campanha"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!dirty}
              onClick={() => {
                setSelection(appearanceSelection(model));
                setMessage("");
                setFailed(false);
              }}
            >
              <RotateCcw size={16} />
              Descartar mudanças de visual
            </button>
          </div>
        </fieldset>
        {offerDirty && (
          <p className="notice info">
            Salve ou descarte a edição da oferta antes de alterar o visual da
            campanha.
          </p>
        )}
        <p className="muted">
          A etiqueta geral vale para ofertas sem etiqueta individual. Preços,
          fotos e exceções de cada oferta são preservados. As páginas já
          editadas no Studio só mudam após regenerar.
        </p>
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "form-error" : "muted"}
        >
          {message ||
            (dirty
              ? "Prévia de visual com alterações ainda não salvas."
              : "Visual atual da campanha.")}
        </p>
      </form>
    </section>
  );
}
