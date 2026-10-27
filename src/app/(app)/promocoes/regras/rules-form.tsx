"use client";
import { useState, useActionState, startTransition } from "react";
import type { GroupingRules } from "@/lib/domain/promotion-review";
import { saveGroupingRules } from "./actions";
export function RulesForm({
  brandId,
  config,
  revision,
}: {
  brandId: string;
  config: GroupingRules;
  revision: number;
}) {
  const [rules, setRules] = useState(config),
    [state, run, pending] = useActionState(saveGroupingRules, {}),
    [file, setFile] = useState<File | null>(null),
    [test, setTest] = useState(""),
    [testing, setTesting] = useState(false);
  const flag = (
    key: "fragrances" | "diapers" | "showVariants",
    label: string,
  ) => (
    <label className="check">
      <input
        type="checkbox"
        checked={rules[key]}
        onChange={(e) => setRules({ ...rules, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <form
      className="card stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("brand_id", brandId);
        fd.set("revision", String(revision));
        fd.set("config", JSON.stringify(rules));
        startTransition(() => run(fd));
      }}
    >
      <fieldset disabled={pending || testing}>
        {flag("fragrances", "Sugerir agrupamentos de fragrâncias")}
        {flag(
          "diapers",
          "Sugerir tamanhos de fraldas em uma oferta (regra separada)",
        )}
        {flag("showVariants", "Exibir variações confirmadas na descrição")}
        <label>
          Fotos reais por oferta
          <select
            value={rules.maxPhotos}
            onChange={(e) =>
              setRules({ ...rules, maxPhotos: Number(e.target.value) as 1 | 2 })
            }
          >
            <option value={1}>1</option>
            <option value={2}>Até 2 fotos distintas</option>
          </select>
        </label>
        <label>
          Preço exibido nas artes
          <select
            value={rules.priceSource}
            onChange={(e) =>
              setRules({
                ...rules,
                priceSource: e.target.value as GroupingRules["priceSource"],
              })
            }
          >
            <option value="approximate">
              Valor aproximado (padrão Corta Preço)
            </option>
            <option value="promotion">Preço de promoção</option>
            <option value="sale">Preço de venda</option>
          </select>
        </label>
        <label>
          Referências genéricas (FRAGANCIAS / TODAS VARIAÇÕES)
          <select
            value={rules.genericEligibility}
            onChange={(e) =>
              setRules({
                ...rules,
                genericEligibility: e.target
                  .value as GroupingRules["genericEligibility"],
              })
            }
          >
            <option value="review">Exigir confirmação de cada SKU</option>
            <option value="compatible">
              Pré-selecionar SKUs compatíveis, ainda exigir aprovação da oferta
            </option>
          </select>
        </label>
        <label>
          Ofertas sem foto
          <select
            value={rules.missingPhotos}
            onChange={(e) =>
              setRules({
                ...rules,
                missingPhotos: e.target.value as GroupingRules["missingPhotos"],
              })
            }
          >
            <option value="review">Sinalizar para revisão</option>
            <option value="block">Bloquear geração até receber foto</option>
          </select>
        </label>
        <label>
          Exceções por marca, linha ou categoria (uma por linha)
          <textarea
            value={rules.excludedTerms.join("\n")}
            onChange={(e) =>
              setRules({ ...rules, excludedTerms: e.target.value.split("\n") })
            }
            rows={4}
          />
        </label>
        <p className="notice info">
          Preços diferentes, shampoo/condicionador, volumes, FPS, kits e
          apresentações de medicamentos incompatíveis nunca são agrupados
          automaticamente. A confirmação final é obrigatória.
        </p>
        <h3>Testar sem salvar</h3>
        <input
          type="file"
          accept=".xlsx,.xls"
          aria-label="Planilha para testar regras"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn"
          disabled={!file}
          onClick={async () => {
            if (!file) return;
            setTesting(true);
            setTest("");
            try {
              const fd = new FormData();
              fd.set("file", file);
              fd.set("brand_id", brandId);
              fd.set("test", "1");
              fd.set("rules", JSON.stringify(rules));
              const res = await fetch("/api/promocoes/revisao", {
                  method: "POST",
                  body: fd,
                }),
                r = await res.json();
              if (!res.ok) throw Error(r.error);
              setTest(
                `${r.lines} linhas → ${r.offers} ofertas; ${r.groups} grupos sugeridos; ${r.pending} para revisar. Nenhum rascunho ou regra foi salvo.`,
              );
            } catch (e) {
              setTest(e instanceof Error ? e.message : "Falha no teste.");
            } finally {
              setTesting(false);
            }
          }}
        >
          Testar regras nesta planilha
        </button>
        {test && <p role="status">{test}</p>}
        <button className="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar regras da empresa"}
        </button>
      </fieldset>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="form-ok" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}
