"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { saveStudioAction } from "@/app/studio/[id]/actions";
export function useStudioPersistence(o: {
  id: string;
  format: string;
  page: number;
  revision: number;
  sourceHash: string;
  documentSourceHash: RefObject<string>;
  canEdit: boolean;
}) {
  const [status, setStatus] = useState("Salvo"),
    [error, setError] = useState(""),
    pending = useRef<string | null>(null),
    lastSaved = useRef(""),
    rev = useRef(o.revision),
    conflict = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    running = useRef<Promise<boolean> | null>(null),
    active = useRef(true);
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current)
      return running.current.then((ok) => (ok ? flush() : false));
    if (conflict.current) return Promise.resolve(false);
    const json = pending.current;
    if (!json || !o.canEdit) return Promise.resolve(true);
    pending.current = null;
    const job = (async () => {
      if (active.current) setStatus("Salvando…");
      try {
        const r = await saveStudioAction({
          id: o.id,
          format: o.format,
          page: o.page,
          scene: JSON.parse(json),
          expectedRevision: rev.current,
          expectedSourceHash: o.sourceHash,
          documentSourceHash: o.documentSourceHash.current,
        });
        if (!r.ok) {
          if (!pending.current) pending.current = json;
          if ("conflict" in r && r.conflict) conflict.current = true;
          if (active.current) {
            setStatus("Não salvo");
            setError(r.error ?? "Não foi possível salvar.");
          }
          return false;
        }
        if ("revision" in r && typeof r.revision === "number")
          rev.current = r.revision;
        lastSaved.current = json;
        if (active.current) {
          setError("");
          setStatus(pending.current ? "Alterações pendentes" : "Salvo");
        }
        return true;
      } catch {
        if (!pending.current) pending.current = json;
        if (active.current) {
          setStatus("Não salvo");
          setError(
            "Sem conexão. Sua edição continua aberta. Tente salvar novamente.",
          );
        }
        return false;
      }
    })();
    running.current = job;
    void job.finally(() => {
      running.current = null;
    });
    return job.then((ok) => (ok && pending.current ? flush() : ok));
  }, [o.id, o.format, o.page, o.sourceHash, o.documentSourceHash, o.canEdit]);
  const schedule = useCallback(
    ({ json }: { json: string }) => {
      if (!o.canEdit || conflict.current) return;
      if (json === lastSaved.current && !running.current) {
        pending.current = null;
        if (timer.current) clearTimeout(timer.current);
        setStatus("Salvo");
        return;
      }
      pending.current = json;
      setStatus("Alterações pendentes");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 900);
    },
    [flush, o.canEdit],
  );
  useEffect(() => {
    active.current = true;
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current || running.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      active.current = false;
      window.removeEventListener("beforeunload", before);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return { status, error, schedule, flush };
}
