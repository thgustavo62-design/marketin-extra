"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReviewUpload({
  brands,
  selected,
}: {
  brands: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="card stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/promocoes/revisao", {
              method: "POST",
              body: fd,
            }),
            r = await res.json();
          if (!res.ok) throw Error(r.error || "Falha na importação.");
          router.push(`/promocoes/revisao/${r.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha no envio.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="review-company">Empresa da campanha</label>
      <select
        id="review-company"
        name="brand_id"
        defaultValue={selected}
        required
        disabled={busy}
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <label htmlFor="review-name">Nome da campanha</label>
      <input
        type="text"
        id="review-name"
        name="name"
        maxLength={120}
        placeholder="Corta Preço"
        disabled={busy}
      />
      <label htmlFor="review-file">Planilha para revisão inteligente</label>
      <input
        id="review-file"
        type="file"
        name="file"
        accept=".xlsx,.xls"
        required
        disabled={busy}
      />
      <p className="muted">
        Até 4 MB · todas as abas · preços e referências originais preservados. A
        importação cria um rascunho de revisão, sem gerar as artes.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !brands.length}>
        {busy ? "Analisando planilha…" : "Importar e revisar ofertas"}
      </button>
    </form>
  );
}
