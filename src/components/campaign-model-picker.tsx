"use client";
import { useState } from "react";
import { PHARMACY_MODELS, pharmacyModel } from "@/lib/domain/pharmacy-models";
import { CampaignModelPreview } from "./campaign-model-preview";

export function CampaignModelPicker({
  initial = "",
  brandColors = [],
  onChange,
}: {
  initial?: string;
  brandColors?: string[];
  onChange?: () => void;
}) {
  const [key, setKey] = useState(pharmacyModel(initial)?.key ?? "");
  const [primary, setPrimary] = useState("");
  const [accent, setAccent] = useState("");
  const [useBrand, setUseBrand] = useState(false);
  const model = pharmacyModel(key);
  const p =
    (useBrand ? brandColors[0] : undefined) || primary || model?.primary;
  const a = (useBrand ? brandColors[1] : undefined) || accent || model?.accent;
  return (
    <section
      className="campaign-model-picker"
      aria-label="Modelo visual da campanha"
    >
      <label htmlFor="campaign-model-key">Modelo global de farmácia</label>
      <select
        id="campaign-model-key"
        name="model_key"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setPrimary("");
          setAccent("");
          onChange?.();
        }}
      >
        <option value="">Usar identidade da empresa ou tema selecionado</option>
        {PHARMACY_MODELS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.name} · {m.label}
          </option>
        ))}
      </select>
      {model && (
        <div className="campaign-model-customize">
          <CampaignModelPreview modelKey={key} primary={p} accent={a} />
          <div>
            <p>{model.description}</p>
            <div className="campaign-model-colors">
              <label>
                Cor principal
                <input
                  type="color"
                  name="model_primary"
                  aria-label="Cor principal do modelo"
                  value={p}
                  disabled={useBrand && !!brandColors[0]}
                  onChange={(e) => {
                    setPrimary(e.target.value);
                    onChange?.();
                  }}
                />
              </label>
              <label>
                Cor de destaque
                <input
                  type="color"
                  name="model_accent"
                  aria-label="Cor de destaque do modelo"
                  value={a}
                  disabled={useBrand && !!brandColors[1]}
                  onChange={(e) => {
                    setAccent(e.target.value);
                    onChange?.();
                  }}
                />
              </label>
            </div>
            {brandColors.length > 0 && (
              <label className="check">
                <input
                  type="checkbox"
                  name="model_brand_colors"
                  value="1"
                  checked={useBrand}
                  onChange={(e) => {
                    setUseBrand(e.target.checked);
                    onChange?.();
                  }}
                />
                Usar cores do kit da empresa
              </label>
            )}
            <p className="muted">
              A escolha vale para esta campanha. Produtos, preços e fotos vêm da
              sua importação. Os elementos continuam editáveis no Studio.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
