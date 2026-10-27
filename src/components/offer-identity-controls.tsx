"use client";
import {
  normalizeOfferIdentity,
  DEFAULT_OFFER_IDENTITY,
  type OfferIdentity,
} from "@/lib/domain/offer-identity";
export function OfferIdentityControls({
  value,
  onChange,
  disabled = false,
}: {
  value?: OfferIdentity;
  onChange: (v: OfferIdentity | undefined) => void;
  disabled?: boolean;
}) {
  const v = value ?? DEFAULT_OFFER_IDENTITY;
  return (
    <fieldset disabled={disabled}>
      <legend>Etiqueta 3D e composição da oferta</legend>
      <label>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? { ...v } : undefined)}
        />
        Usar etiqueta APENAS com preço dinâmico
      </label>
      {value && (
        <>
          <p>
            Moeda, reais e centavos são editáveis no Design. A prévia usa o
            preço cadastrado e ajusta o tamanho automaticamente.
          </p>
          {[
            ["labelScale", "Tamanho da etiqueta (%)", 70, 110],
            ["angle", "Inclinação (graus)", -8, 8],
            ["priceScale", "Escala do preço (%)", 60, 110],
            ["centsGap", "Distância dos centavos (%)", 0, 12],
            ["labelX", "Posição horizontal (%)", -5, 5],
            ["labelY", "Posição vertical (%)", -3, 3],
            ["descriptionScale", "Tamanho da descrição (%)", 65, 130],
            ["photoCount", "Fotografias por oferta", 1, 2],
          ].map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={v[key as keyof OfferIdentity] as number}
                onChange={(e) =>
                  onChange(
                    normalizeOfferIdentity({
                      ...v,
                      [key]: Number(e.target.value),
                    }),
                  )
                }
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={v.ribbonEnabled}
              onChange={(e) =>
                onChange({ ...v, ribbonEnabled: e.target.checked })
              }
            />
            Exibir faixa dourada
          </label>
          <label>
            Texto da faixa
            <input
              maxLength={80}
              value={v.ribbonText}
              onChange={(e) => onChange({ ...v, ribbonText: e.target.value })}
            />
          </label>
          <p>
            “Todas as fragrâncias” exige confirmação de todas as variações. Sem
            essa confirmação, a prévia usa “Fragrâncias selecionadas”.
          </p>
        </>
      )}
    </fieldset>
  );
}
