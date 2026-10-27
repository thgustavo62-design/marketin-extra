"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Editor } from "./types";
export function AiPanel({
  campaignId,
  editor,
  removeBackground,
  configured,
  onError,
}: {
  campaignId: string;
  editor: Editor | undefined;
  removeBackground: boolean;
  configured: boolean;
  onError: (s: string) => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const selected = editor?.selectedObjects[0],
    enabled = configured && (!removeBackground || selected?.type === "image");
  const run = async () => {
    setBusy(true);
    try {
      const image = removeBackground
          ? (selected as import("fabric").fabric.Image).toDataURL({
              format: "png",
            })
          : undefined,
        start = await fetch(`/api/studio/${campaignId}/ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: removeBackground ? "remove-bg" : "generate",
            prompt,
            image,
          }),
        });
      let result = await start.json();
      if (!start.ok) throw new Error(result.error);
      for (let i = 0; !result.src && i < 90 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(
          `/api/studio/${campaignId}/ai?job=${encodeURIComponent(result.job)}`,
          { cache: "no-store" },
        );
        result = await r.json();
        if (!r.ok) throw new Error(result.error);
      }
      if (!result.src)
        throw new Error(
          "O serviço ainda está processando. Confira sua conta de IA antes de repetir.",
        );
      if (alive.current) editor?.addImage(result.src);
    } catch (e) {
      if (alive.current)
        onError(
          e instanceof Error ? e.message : "O serviço de IA não respondeu.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <aside className="studio-panel">
      <h2>{removeBackground ? "Remover fundo" : "Criar imagem com IA"}</h2>
      {!configured ? (
        <p className="studio-muted">
          Este recurso ainda não está configurado para este workspace.{" "}
          <Link href="/criacao/ia">Ver configuração de imagens e IA</Link>.
        </p>
      ) : (
        <>
          {removeBackground ? (
            <p className="studio-muted">
              Selecione uma foto. Uma cópia com transparência será adicionada à
              arte.
            </p>
          ) : (
            <label>
              Descreva a imagem
              <textarea
                rows={5}
                maxLength={1200}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
          )}
          <button
            className="studio-choice"
            disabled={
              !enabled ||
              busy ||
              (!removeBackground && prompt.trim().length < 5)
            }
            onClick={() => void run()}
          >
            {busy
              ? "Processando…"
              : removeBackground
                ? "Remover fundo da foto"
                : "Gerar imagem"}
          </button>
          <p className="studio-muted">
            Usa a integração Replicate configurada pela Encartiva. As solicitações
            consomem o saldo desse serviço.
          </p>
        </>
      )}
    </aside>
  );
}
