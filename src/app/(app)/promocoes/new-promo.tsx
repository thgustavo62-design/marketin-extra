"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  ImageOff,
  Upload,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PROMO_LAYOUTS } from "@/lib/domain/promo-layouts";
import { CampaignModelPicker } from "@/components/campaign-model-picker";
import type { ImportReport } from "@/lib/promo/store";
type Preview = {
  report: ImportReport;
  rows: { ean: string; name: string; price: number; photo_id: string | null }[];
  missingPhotos: number;
  missingCatalog: number;
  skipped: number;
  pages: Record<string, number>;
};
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function NewPromo({
  themes,
  company,
  brandColors,
}: {
  themes: { id: string; name: string }[];
  company: { id: string; name: string } | null;
  brandColors: string[];
}) {
  const router = useRouter(),
    fileRef = useRef<HTMLInputElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(""),
    [layout, setLayout] = useState("theme"),
    [format, setFormat] = useState("story"),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [onlyMissing, setOnlyMissing] = useState(false);
  const send = async (analyze: boolean) => {
    if (!formRef.current || !file) {
      setMsg("Escolha a planilha (.xlsx).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMsg("A planilha precisa ter até 4 MB.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData(formRef.current);
      fd.set("file", file);
      fd.set("preview", analyze ? "1" : "0");
      fd.set("layout", layout);
      if (!fd.get("group")) fd.set("group", "0");
      const res = await fetch("/api/promocoes/importar", {
          method: "POST",
          body: fd,
        }),
        data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Não foi possível ler a planilha.");
        return;
      }
      if (analyze) setPreview(data.preview);
      else if (data.id) router.push(`/studio/${data.id}?formato=${format}`);
    } catch {
      setMsg("Não foi possível alcançar o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const rows = preview?.rows.filter((r) => !onlyMissing || !r.photo_id) ?? [];
  return (
    <section className="promo-builder card" aria-label="Nova promoção">
      <div className="promo-builder-heading">
        <span>
          <FileSpreadsheet size={24} />
        </span>
        <div>
          <span className="design-kicker">DA PLANILHA À CAMPANHA</span>
          <h2>Monte sua próxima promoção.</h2>
          <p>
            Confira produtos, preços e fotos antes de abrir as artes editáveis.
          </p>
        </div>
      </div>
      <form
        ref={formRef}
        className="promo-builder-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(true);
        }}
        onChange={() => {
          setPreview(null);
          setOnlyMissing(false);
        }}
      >
        <input type="hidden" name="brand_id" value={company?.id ?? ""} />
        {!company && (
          <p className="notice info">
            Selecione a empresa no cabeçalho para criar uma promoção.
          </p>
        )}
        {company && (
          <p className="muted">
            Campanha de <b>{company.name}</b>
          </p>
        )}
        <fieldset disabled={busy || !company}>
          <div className="promo-setup-grid">
            <section>
              <h3>
                <span>1</span> Traga os produtos
              </h3>
              <label htmlFor="np-name">Nome da promoção</label>
              <input
                id="np-name"
                name="name"
                type="text"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Ofertas de novembro"
              />
              <label className="promo-file-card" htmlFor="np-file">
                <Upload size={22} />
                <b>{file ? file.name : "Escolher planilha Excel"}</b>
                <small>
                  Código de barras, descrição e valor aproximado · até 4 MB
                </small>
                <input
                  id="np-file"
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  aria-label="Planilha da promoção"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !name)
                      setName(f.name.replace(/\.[^.]+$/, "").slice(0, 120));
                  }}
                />
              </label>
              <a className="design-text-link" href="/api/promocoes/modelo">
                Baixar planilha de exemplo
              </a>
              <label className="check">
                <input type="checkbox" name="group" value="1" defaultChecked />
                Agrupar variações com o mesmo preço
              </label>
              <p className="muted">
                Fragrâncias e tamanhos compatíveis podem compartilhar uma
                oferta. Preços diferentes ficam separados.
              </p>
              <div className="grid-2">
                <div>
                  <label htmlFor="np-title">Título nas artes</label>
                  <input
                    id="np-title"
                    name="title"
                    type="text"
                    maxLength={60}
                    placeholder="Ex.: OFERTAS ESPECIAIS"
                  />
                </div>
                <div>
                  <label htmlFor="np-val">Validade</label>
                  <input
                    id="np-val"
                    name="validity"
                    type="text"
                    maxLength={80}
                    placeholder="Ex.: Válido de 01 a 07/11"
                  />
                </div>
              </div>
            </section>
            <section>
              <h3>
                <span>2</span> Escolha a apresentação
              </h3>
              <label htmlFor="np-theme">Identidade da campanha</label>
              <select id="np-theme" name="theme_id" defaultValue="">
                <option value="">Arte padrão Encartiva</option>
                {themes.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <CampaignModelPicker
                brandColors={brandColors}
                onChange={() => setPreview(null)}
              />
              <label>Produtos por página</label>
              <div
                className="promo-layout-choices"
                role="group"
                aria-label="Layout dos produtos"
              >
                {PROMO_LAYOUTS.map((l) => (
                  <button
                    type="button"
                    key={l.id}
                    aria-pressed={layout === l.id}
                    onClick={() => {
                      setLayout(l.id);
                      setPreview(null);
                    }}
                  >
                    <span
                      className={`promo-layout-mini count-${l.count}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: l.count || 6 }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                    <b>{l.name}</b>
                    <small>{l.hint}</small>
                  </button>
                ))}
              </div>
              <label htmlFor="np-format">Abrir primeiro em</label>
              <select
                id="np-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="story">Story / Status · 1080 × 1920</option>
                <option value="feed">Feed · 1080 × 1350</option>
                <option value="a4">Cartaz A4</option>
              </select>
              <p className="muted">
                Story, feed e A4 continuam disponíveis no editor. O layout vale
                apenas para esta campanha.
              </p>
            </section>
          </div>
          <div className="promo-analyze-row">
            <p>O valor aproximado da planilha é o preço usado na arte.</p>
            <button
              type="submit"
              className="btn primary-link"
              disabled={!file || busy}
            >
              {busy
                ? "Processando…"
                : preview
                  ? "Analisar novamente"
                  : "Analisar planilha"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
        {msg && (
          <p className="form-error" role="alert">
            {msg}
          </p>
        )}
      </form>
      {preview && (
        <section className="promo-preview" aria-label="Conferência da promoção">
          <h3>
            <span>3</span> Confira antes de criar
          </h3>
          <div className="photo-import-stats">
            <span>
              <b>{preview.report.lines}</b> linhas válidas
            </span>
            <span>
              <b>{preview.report.encartes}</b> ofertas
            </span>
            <span>
              <b>{preview.pages.story}</b> páginas de story
            </span>
            <span>
              <b>{preview.pages.feed}</b> páginas de feed
            </span>
            <span>
              <b>{preview.pages.a4}</b> páginas A4
            </span>
          </div>
          {preview.missingPhotos > 0 ? (
            <div className="notice">
              <AlertTriangle size={18} />
              <span>
                {preview.missingPhotos} oferta(s) ainda sem foto.{" "}
                <Link href="/produtos/importar#fotos">
                  Importar fotos do computador
                </Link>{" "}
                ou revise os produtos após criar a campanha.
              </span>
            </div>
          ) : (
            <p className="form-ok">
              <CheckCircle2 size={16} /> Todas as ofertas desta leitura possuem
              foto no catálogo.
            </p>
          )}
          {preview.missingCatalog > 0 && (
            <p className="muted">
              {preview.missingCatalog} produto(s) fora do catálogo usam a
              descrição da planilha. Importe o cadastro e as fotos para
              completar.
            </p>
          )}
          {preview.skipped > 0 && (
            <p className="form-error">
              {preview.skipped} linha(s) sem descrição não serão incluídas.
            </p>
          )}
          {preview.report.rowErrors.length > 0 && (
            <details className="promo-sheet-warnings">
              <summary>
                {preview.report.rowErrors.length} aviso(s) da planilha
              </summary>
              <ul>
                {preview.report.rowErrors.map((e, i) => (
                  <li key={i}>
                    {e.line ? `Linha ${e.line}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            Mostrar somente ofertas sem foto nesta prévia
          </label>
          <div className="table-wrap promo-preview-table">
            <table>
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Produto / código</th>
                  <th>Preço da arte</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ean}:${i}`}>
                    <td>
                      {r.photo_id ? (
                        <img
                          src={`/api/produtos/imagem/${r.photo_id}?mini=1`}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <ImageOff size={20} aria-label="Sem foto" />
                      )}
                    </td>
                    <td>
                      <b>{r.name}</b>
                      <small>{r.ean}</small>
                    </td>
                    <td>{money(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Prévia de até 100 ofertas. O resumo considera toda a planilha.
            Revise os preços e a validade antes de divulgar.
          </p>
          <div className="form-actions">
            <button
              className="btn primary-link"
              type="button"
              disabled={busy}
              onClick={() => void send(false)}
            >
              {busy ? "Criando campanha…" : "Criar campanha e abrir editor"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
