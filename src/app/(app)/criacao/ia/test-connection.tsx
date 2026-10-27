"use client";
import { useState, useTransition } from "react";
import { testImageConnection } from "./actions";
export function TestImageConnection({ configured }: { configured: boolean }) {
  const [busy, start] = useTransition(),
    [result, setResult] = useState<{ ok: boolean; message: string } | null>(
      null,
    );
  return (
    <div>
      <button
        type="button"
        className="btn"
        disabled={busy || !configured}
        onClick={() =>
          start(async () => setResult(await testImageConnection()))
        }
      >
        {busy ? "Testando conexão…" : "Testar conexão"}
      </button>
      {result && (
        <p className={result.ok ? "form-ok" : "form-error"} role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}
