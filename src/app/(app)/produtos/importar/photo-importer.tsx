"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Images,
  Pause,
  Play,
  Download,
  Upload,
  CheckCircle2,
} from "lucide-react";
type Result = {
  index: number;
  file: string;
  status: string;
  method?: string;
  description?: string;
  error?: string;
};
const supported = (f: File) => /\.(png|jpe?g|webp|gif)$/i.test(f.name);
const path = (f: File) => f.webkitRelativePath || f.name;
const human = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
async function compact(file: File) {
  if (file.size <= 3_300_000) return file;
  if (file.size > 35_000_000)
    throw Error("Arquivo acima de 35 MB. Reduza o tamanho antes de enviar.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)),
      c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) =>
      c.toBlob(r, "image/webp", 0.94),
    );
    if (!blob || blob.size > 3_300_000)
      throw Error("Não foi possível reduzir a imagem para o limite de envio.");
    return new File([blob], file.name, { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}
export function PhotoImporter() {
  const router = useRouter(),
    folder = useRef<HTMLInputElement>(null),
    images = useRef<HTMLInputElement>(null),
    paused = useRef(false),
    alive = useRef(true),
    runningRef = useRef(false),
    cursor = useRef(0),
    records = useRef<Result[]>([]);
  const [files, setFiles] = useState<File[]>([]),
    [ignored, setIgnored] = useState(0),
    [results, setResults] = useState<Result[]>([]),
    [running, setRunning] = useState(false),
    [done, setDone] = useState(0),
    [error, setError] = useState(""),
    [preserve, setPreserve] = useState(true),
    [drag, setDrag] = useState(false);
  useEffect(() => {
    alive.current = true;
    folder.current?.setAttribute("webkitdirectory", "");
    folder.current?.setAttribute("directory", "");
    const unload = (e: BeforeUnloadEvent) => {
      if (runningRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      alive.current = false;
      paused.current = true;
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  const select = (list: File[]) => {
    if (runningRef.current) return;
    const seen = new Set<string>(),
      accepted = list.filter((f) => {
        if (!supported(f)) return false;
        const key = `${path(f)}:${f.size}:${f.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    setFiles(accepted);
    setIgnored(list.length - accepted.length);
    setResults([]);
    records.current = [];
    cursor.current = 0;
    setDone(0);
    setError("");
    paused.current = false;
  };
  const publish = (row: Result) => {
    records.current.push(row);
    if (alive.current) {
      setResults([...records.current]);
      setDone(records.current.length);
    }
  };
  const send = async () => {
    if (runningRef.current || !files.length) return;
    runningRef.current = true;
    paused.current = false;
    setRunning(true);
    setError("");
    try {
      while (
        cursor.current < files.length &&
        !paused.current &&
        alive.current
      ) {
        const batch: { index: number; file: File }[] = [];
        let bytes = 0;
        while (cursor.current < files.length && batch.length < 6) {
          const index = cursor.current;
          let file: File;
          try {
            file = await compact(files[index]);
          } catch (e) {
            if (batch.length) break;
            publish({
              index,
              file: path(files[index]),
              status: "invalida",
              error:
                e instanceof Error ? e.message : "Falha ao preparar imagem.",
            });
            cursor.current++;
            continue;
          }
          if (batch.length && bytes + file.size > 3_300_000) break;
          batch.push({ index, file });
          bytes += file.size;
          cursor.current++;
        }
        if (!batch.length) continue;
        const fd = new FormData();
        fd.set("preserve_cutout", preserve ? "1" : "0");
        batch.forEach((x) => fd.append("file", x.file));
        try {
          const res = await fetch("/api/produtos/imagens", {
              method: "POST",
              body: fd,
            }),
            data = await res.json().catch(() => ({}));
          if (res.status === 401 || res.status === 403) {
            cursor.current = batch[0].index;
            paused.current = true;
            setError(data.error ?? "Entre novamente para continuar.");
            break;
          }
          if (
            !res.ok ||
            !Array.isArray(data.results) ||
            data.results.length !== batch.length
          )
            throw Error(
              data.error ??
                "O servidor não confirmou o lote. Você pode reenviar as falhas.",
            );
          for (let i = 0; i < batch.length; i++)
            publish({
              ...data.results[i],
              index: batch[i].index,
              file: path(files[batch[i].index]),
            });
        } catch (e) {
          for (const x of batch)
            publish({
              index: x.index,
              file: path(files[x.index]),
              status: "falha",
              error: e instanceof Error ? e.message : "Falha de conexão.",
            });
        }
      }
    } finally {
      runningRef.current = false;
      if (alive.current) {
        setRunning(false);
        router.refresh();
      }
    }
  };
  const retry = () => {
    const failed = records.current
      .filter((r) => r.status === "falha")
      .map((r) => files[r.index]);
    select(failed);
  };
  const report = () => {
    const quote = (s: string) =>
        `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`,
      csv =
        "\uFEFF" +
        [
          ["Arquivo", "Resultado", "Produto", "Detalhe"],
          ...records.current.map((r) => [
            r.file,
            r.status,
            r.description ?? "",
            r.error ?? r.method ?? "",
          ]),
        ]
          .map((r) => r.map(quote).join(";"))
          .join("\r\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "encartiva-importacao-fotos.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const linked = results.filter((r) => r.status === "ligada").length,
    pending = results.filter(
      (r) => r.status === "pendente" || r.method === "similar",
    ).length,
    duplicates = results.filter((r) => r.status === "duplicada").length,
    failures = results.filter(
      (r) => r.status === "falha" || r.status === "invalida",
    ).length;
  return (
    <section className="card photo-import" id="fotos">
      <div className="photo-import-heading">
        <span>
          <Images size={23} />
        </span>
        <div>
          <h2>Seu acervo de produtos, no mesmo lugar.</h2>
          <p>
            Salve as fotos recortadas no banco de produtos. As promoções
            automáticas usam a foto principal de cada produto vinculado pelo EAN.
            Selecione a pasta do computador; as subpastas também são incluídas.
          </p>
        </div>
      </div>
      <div
        className={`photo-drop${drag ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!running) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!running) select(Array.from(e.dataTransfer.files));
        }}
      >
        <FolderOpen size={30} />
        <b>Importar uma pasta de fotos</b>
        <p>
          Escolha a pasta no seu computador ou arraste arquivos de imagem para
          cá.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="btn primary-link"
            disabled={running}
            onClick={() => folder.current?.click()}
          >
            <FolderOpen size={16} /> Selecionar pasta
          </button>
          <button
            type="button"
            className="btn"
            disabled={running}
            onClick={() => images.current?.click()}
          >
            Selecionar imagens
          </button>
        </div>
        <input
          ref={folder}
          type="file"
          multiple
          hidden
          aria-label="Pasta de fotos de produtos"
          onChange={(e) => select(Array.from(e.target.files ?? []))}
        />
        <input
          ref={images}
          type="file"
          multiple
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Arquivos de fotos de produtos"
          onChange={(e) => select(Array.from(e.target.files ?? []))}
        />
        <small>
          PNG, JPG, WebP e GIF. O envio ocorre em lotes pequenos; imagens
          grandes são otimizadas antes de enviar.
        </small>
      </div>
      <p className="muted photo-match-note">
        O código de barras no nome do arquivo é a melhor associação. Nomes
        compatíveis com o catálogo também são reconhecidos; casos duvidosos
        ficam em <Link href="/produtos/conferir">Conferir imagens</Link>. Nenhum
        produto ou preço é criado a partir de suposições.
      </p>
      {!files.length && ignored > 0 && (
        <p className="notice">
          Nenhuma imagem compatível encontrada. {ignored} arquivo(s) foram
          ignorados.
        </p>
      )}
      {files.length > 0 && (
        <>
          <div className="photo-import-stats">
            <span>
              <b>{files.length}</b> imagens selecionadas
            </span>
            <span>
              <b>{human(files.reduce((n, f) => n + f.size, 0))}</b> no
              computador
            </span>
            {ignored > 0 && <span>{ignored} arquivos ignorados</span>}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={preserve}
              disabled={running || done > 0}
              onChange={(e) => setPreserve(e.target.checked)}
            />
            Preservar os recortes e a transparência originais
          </label>
          <div className="photo-preview-list">
            {files.slice(0, 5).map((f, i) => (
              <span key={`${path(f)}:${i}`}>{path(f)}</span>
            ))}
            {files.length > 5 && (
              <small>e mais {files.length - 5} imagens</small>
            )}
          </div>
          <div className="form-actions">
            {done < files.length && (
              <button
                type="button"
                className="btn primary-link"
                disabled={running}
                onClick={() => void send()}
              >
                {done > 0 ? <Play size={15} /> : <Upload size={15} />}{" "}
                {done > 0
                  ? "Continuar importação"
                  : `Importar ${files.length} imagens`}
              </button>
            )}
            {running && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  paused.current = true;
                }}
              >
                <Pause size={15} /> Pausar
              </button>
            )}
            {results.length > 0 && (
              <button className="btn" type="button" onClick={report}>
                <Download size={15} /> Baixar relatório
              </button>
            )}
            {!running && results.some((r) => r.status === "falha") && (
              <button type="button" className="btn" onClick={retry}>
                Selecionar falhas para reenviar
              </button>
            )}
          </div>
          <div className="photo-import-progress" role="status">
            <progress max={files.length} value={done} />
            <span>
              {done} de {files.length} processadas
              {running
                ? " · enviando…"
                : done === files.length
                  ? " · concluído"
                  : done > 0
                    ? " · pausada"
                    : ""}
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {results.length > 0 && (
            <div className="photo-import-results">
              <div className="photo-import-stats">
                <span>
                  <b>{linked}</b> associadas
                </span>
                <span>
                  <b>{pending}</b> para conferir
                </span>
                <span>
                  <b>{duplicates}</b> repetidas
                </span>
                <span>
                  <b>{failures}</b> com problema
                </span>
              </div>
              {done === files.length && (
                <p className="form-ok">
                  <CheckCircle2 size={16} /> Processamento concluído. As imagens
                  aceitas já estão salvas no banco.
                </p>
              )}
              <ul className="photo-result-list">
                {results.slice(-12).map((r) => (
                  <li key={r.index}>
                    <span>{r.file}</span>
                    <b>
                      {r.status === "ligada"
                        ? "Associada"
                        : r.status === "pendente"
                          ? "Conferir"
                          : r.status === "duplicada"
                            ? "Já existente"
                            : r.status === "falha"
                              ? "Reenviar"
                              : "Recusada"}
                    </b>
                    {(r.description || r.error) && (
                      <small>{r.description || r.error}</small>
                    )}
                  </li>
                ))}
              </ul>
              {pending > 0 && (
                <Link href="/produtos/conferir" className="btn">
                  Conferir associações
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
