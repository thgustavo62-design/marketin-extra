"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  StudioSaveQueue,
  type StudioSaveState,
  type StudioSaveResult,
} from "@/lib/domain/studio-save-queue";
import {
  readStudioDraft,
  writeStudioDraft,
  deleteStudioDraft,
  type StudioDraft,
} from "./local-drafts";
export function useStudioPersistence(o: {
  id: string;
  actorId: string;
  hasSaved: boolean;
  format: string;
  page: number;
  revision: number;
  sourceHash: string;
  documentSourceHash: RefObject<string>;
  canEdit: boolean;
}) {
  const options = useRef(o);
  options.current = o;
  const [tabId] = useState(() => {
    try {
      const existing = sessionStorage.getItem("encartiva-studio-tab");
      if (existing) return existing;
      const id = crypto.randomUUID();
      sessionStorage.setItem("encartiva-studio-tab", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const touched = useRef(false);
  const active = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null),
    attempts = useRef(0);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [state, setState] = useState<StudioSaveState>({
    status: o.hasSaved ? "Salvo" : "Alterações pendentes",
    error: "",
    conflict: false,
    retryable: false,
    revision: o.revision,
    pending: null,
  });
  const key = `${o.actorId}:${o.id}:${o.format}:${o.page}:${tabId}`;
  const queueRef = useRef<StudioSaveQueue | null>(null);
  if (!queueRef.current)
    queueRef.current = new StudioSaveQueue(
      o.revision,
      async (json, revision): Promise<StudioSaveResult> => {
        const p = options.current;
        const response = await fetch(`/api/studio/${p.id}/document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            format: p.format,
            page: p.page,
            scene: JSON.parse(json),
            expectedRevision: revision,
            expectedSourceHash: p.sourceHash,
            documentSourceHash: p.documentSourceHash.current,
          }),
        });
        let result: StudioSaveResult;
        try {
          result = await response.json();
        } catch {
          return {
            ok: false,
            retryable: response.status >= 500,
            error: "O servidor não confirmou o salvamento. Tente novamente.",
          };
        }
        if (!response.ok || !result.ok)
          return {
            ok: false,
            error:
              "error" in result ? result.error : "Não foi possível salvar.",
            conflict: response.status === 409,
            retryable: response.status >= 500 || response.status === 429,
          };
        if (!Number.isSafeInteger(result.revision))
          throw Error("Resposta de salvamento inválida.");
        return result;
      },
      (next) => {
        if (active.current) setState(next);
      },
    );
  const queue = queueRef.current;
  const persistDraft = useCallback(
    (snapshot: StudioSaveState) => {
      const p = options.current;
      const record = snapshot.pending
        ? {
            key,
            json: snapshot.pending,
            revision: snapshot.revision,
            sourceHash: p.sourceHash,
            documentSourceHash: p.documentSourceHash.current,
            updatedAt: Date.now(),
          }
        : null;
      const operation = () =>
        record
          ? writeStudioDraft(record)
          : snapshot.status === "Salvo"
            ? deleteStudioDraft(key)
            : Promise.resolve();
      // Serialize storage too: a late delete must never erase a newer edit.
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(async () => {
          await operation();
        })
        .catch(() => {
          if (active.current)
            setBackupError(
              "A cópia de recuperação neste dispositivo está indisponível. Mantenha a página aberta até salvar.",
            );
        });
    },
    [key],
  );
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (retry.current) clearTimeout(retry.current);
    timer.current = retry.current = null;
    if (!options.current.canEdit) return true;
    const ok = await queue.flush();
    if (ok) attempts.current = 0;
    return ok;
  }, [queue]);
  const schedule = useCallback(
    ({ json }: { json: string }) => {
      if (!options.current.canEdit) return;
      touched.current = true;
      queue.enqueue(json);
      persistDraft(queue.snapshot);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 900);
    },
    [queue, flush, persistDraft],
  );
  useEffect(() => {
    // Keep a failed request's latest document, and update its baseline after an in-flight save.
    if (touched.current && (state.pending || state.status === "Salvo"))
      persistDraft(state);
    if (
      state.status === "Não salvo" &&
      state.retryable &&
      attempts.current < 5
    ) {
      retry.current = setTimeout(
        () => {
          attempts.current++;
          void flush();
        },
        Math.min(30000, 2000 * 2 ** attempts.current),
      );
    }
    return () => {
      if (retry.current) clearTimeout(retry.current);
    };
  }, [state, flush, persistDraft]);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    void readStudioDraft(key)
      .then((v) => {
        if (
          !cancelled &&
          v &&
          v.updatedAt > Date.now() - 30 * 86400000 &&
          !queue.dirty
        )
          setDraft(v);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecoveryChecked(true);
      });
    const before = (e: BeforeUnloadEvent) => {
      if (queue.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const online = () => {
      attempts.current = 0;
      void flush();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden" && queue.dirty) void flush();
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active.current = false;
      cancelled = true;
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hidden);
      if (timer.current) clearTimeout(timer.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [key, queue, flush]);
  const discardDraft = useCallback(() => {
    setDraft(null);
    void deleteStudioDraft(key).catch(() => {});
  }, [key]);
  return {
    revision: state.revision,
    status: state.status,
    error: state.error,
    conflict: state.conflict,
    backupError,
    schedule,
    flush,
    draft,
    recoveryChecked,
    discardDraft,
  };
}
