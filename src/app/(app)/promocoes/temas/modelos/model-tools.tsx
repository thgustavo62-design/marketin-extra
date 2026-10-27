"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { themeModelAction, importModelConfig } from "./actions";
export function ModelTools({ id, active }: { id: string; active: boolean }) {
  const router = useRouter(),
    [busy, start] = useTransition(),
    [error, setError] = useState("");
  return (
    <>
      <div className="form-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await themeModelAction(id, "duplicate");
              if (r.error) setError(r.error);
              else if (r.id) router.push(`/promocoes/temas/${r.id}`);
            })
          }
        >
          Duplicar layout
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await themeModelAction(
                id,
                active ? "deactivate" : "activate",
              );
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          {active ? "Desativar" : "Ativar"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function ImportModel() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <label className="card">
      Importar configuração de layout (.json)
      <input
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 100000) {
            setError(
              "Use JSON de até 100 KB. Imagens entram separadamente no editor.",
            );
            return;
          }
          setBusy(true);
          const r = await importModelConfig(
            file.name.replace(/\.json$/i, ""),
            await file.text(),
          );
          setBusy(false);
          if (r.error) setError(r.error);
          else if (r.id) router.push(`/promocoes/temas/${r.id}`);
        }}
      />
      {error && <p role="alert">{error}</p>}
      <small>
        Configura cores, grades e áreas seguras. Artes, mascotes e selos são
        enviados separadamente.
      </small>
    </label>
  );
}

export function ModelCategory({
  id,
  category,
  config,
}: {
  id: string;
  category: string;
  config: unknown;
}) {
  const router = useRouter(),
    [value, setValue] = useState(category),
    [error, setError] = useState("");
  return (
    <>
      <label>
        Categoria do layout
        <input
          type="text"
          maxLength={60}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button
          className="btn"
          onClick={async () => {
            const r = await themeModelAction(id, "category", value);
            if (r.error) setError(r.error);
            else router.refresh();
          }}
        >
          Salvar categoria
        </button>
        <button
          className="btn"
          onClick={() => {
            const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      { schema: "nova7-layout-v1", config },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              ),
              a = document.createElement("a");
            a.href = url;
            a.download = "nova7-layout.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Exportar configuração
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
