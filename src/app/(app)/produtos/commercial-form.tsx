"use client";
import { useActionState, startTransition } from "react";
import { saveCommercialProduct } from "./actions";
import {
  COMMERCIAL_FIELDS,
  type CommercialAttributes,
} from "@/lib/domain/product-commercial";
const labels: Record<string, string> = {
  commercialName: "Nome comercial",
  brand: "Marca",
  line: "Linha",
  category: "Categoria",
  type: "Tipo de produto",
  volume: "Volume ou peso",
  unit: "Unidade (ML, G, L…)",
  packaging: "Apresentação / embalagem",
  quantity: "Quantidade na embalagem",
  variation: "Fragrância / cor / variação",
};
export function CommercialForm({
  id,
  value,
  canEdit,
}: {
  id: string;
  value: CommercialAttributes;
  canEdit: boolean;
}) {
  const [state, run, pending] = useActionState(saveCommercialProduct, {});
  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("id", id);
        startTransition(() => run(fd));
      }}
    >
      <div className="grid-2">
        {COMMERCIAL_FIELDS.map((k) => (
          <label key={k}>
            {labels[k]}
            <input
              type="text"
              name={k}
              defaultValue={value[k] ?? ""}
              maxLength={120}
              disabled={!canEdit || pending}
            />
          </label>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          name="validated"
          value="1"
          defaultChecked={value.validated}
          disabled={!canEdit || pending}
        />
        Conferi os atributos desta apresentação e variação.
      </label>
      {canEdit && (
        <button className="primary" disabled={pending}>
          Salvar atributos comerciais
        </button>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p role="status">{state.ok}</p>}
    </form>
  );
}
