"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  MAX_KIT_COLORS,
  MAX_KIT_FONTS,
  MAX_KIT_TEXTS,
  type KitColor,
  type KitText,
} from "@/lib/domain/promo-brand";
import {
  FONT_CATEGORY_LABEL,
  PROMO_FONTS,
  fontStack,
} from "@/lib/domain/promo-fonts";
import { loadFonts, loadPromoFonts } from "@/lib/promo/fonts-loader";
import { deleteLogoAction, getKitAction, saveKitAction } from "./actions";

type Logo = { id: string; name: string; width: number; height: number };

export function BrandKitManager({
  brands,
  canEdit,
}: {
  brands: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [brandId, setBrandId] = useState(brands[0].id);
  const [colors, setColors] = useState<KitColor[]>([]);
  const [fonts, setFonts] = useState<string[]>([]);
  const [texts, setTexts] = useState<KitText[]>([]);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (id: string) => {
    setLoaded(false);
    const k = await getKitAction(id);
    if (k) {
      setColors(k.colors);
      setFonts(k.fonts);
      setTexts(k.texts);
      setLogos(k.logos);
    }
    setLoaded(true);
  }, []);
  // só os logos (enviar/excluir logo não pode apagar o que a pessoa já digitou em cores, fontes e textos)
  const reloadLogos = useCallback(async (id: string) => {
    const k = await getKitAction(id);
    if (k) setLogos(k.logos);
  }, []);
  useEffect(() => {
    void load(brandId);
  }, [brandId, load]);
  useEffect(() => {
    if (fonts.includes("display") || fonts.includes("text"))
      void loadPromoFonts();
    void loadFonts(fonts);
  }, [fonts]);

  async function upload(files: File[]) {
    setUploading(true);
    setMsg(null);
    let ok = 0;
    const erros: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("brand_id", brandId);
      const r = await fetch("/api/promocoes/biblioteca", {
        method: "POST",
        body: fd,
      }).catch(() => null);
      if (r?.ok) ok++;
      else
        erros.push(
          `${f.name}: ${(await r?.json().catch(() => ({})))?.error ?? "falhou"}`,
        );
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    setMsg({
      ok: erros.length === 0,
      text: `${ok} logo(s) enviado(s)${erros.length ? ` · ${erros.join("; ")}` : ""}.`,
    });
    await reloadLogos(brandId);
  }
  const save = () =>
    start(async () => {
      const r = await saveKitAction(brandId, { colors, fonts, texts });
      setMsg(
        r.ok
          ? { ok: true, text: "Kit de marca salvo." }
          : { ok: false, text: r.error ?? "Não foi possível salvar." },
      );
      if (r.ok) await load(brandId);
    });
  const dis = !canEdit || busy;

  return (
    <div className="kit">
      <label htmlFor="kit-brand">Empresa</label>
      <select
        id="kit-brand"
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {!loaded ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <section className="card" aria-label="Logos">
            <h3>Logos</h3>
            {canEdit && (
              <p>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                  aria-label="Enviar logos"
                  onChange={(e) => void upload([...(e.target.files ?? [])])}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} />{" "}
                  {uploading ? "Enviando…" : "Enviar logos"}
                </button>{" "}
                <span className="muted">
                  PNG com fundo transparente fica melhor; SVG também.
                </span>
              </p>
            )}
            {logos.length === 0 ? (
              <p className="muted">Nenhum logo desta empresa ainda.</p>
            ) : (
              <div className="lib-grid">
                {logos.map((l) => (
                  <div key={l.id} className="lib-card" data-logo={l.id}>
                    <div className="lib-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/promocoes/biblioteca/${l.id}?mini=1`}
                        alt={l.name}
                      />
                    </div>
                    <div className="lib-info">
                      <strong title={l.name}>{l.name}</strong>
                      <small className="muted">
                        {l.width}×{l.height}
                      </small>
                      {canEdit && (
                        <span className="lib-actions">
                          <button
                            type="button"
                            className="mini-btn danger"
                            aria-label={`Excluir logo ${l.name}`}
                            onClick={() => {
                              if (confirm(`Excluir o logo "${l.name}"?`))
                                start(async () => {
                                  await deleteLogoAction(brandId, l.id);
                                  await reloadLogos(brandId);
                                });
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-label="Cores">
            <h3>Cores oficiais</h3>
            {colors.map((c, i) => (
              <div key={i} className="kit-row" data-color={c.hex}>
                <input
                  type="color"
                  aria-label={`Cor ${i + 1}`}
                  value={c.hex}
                  disabled={dis}
                  onChange={(e) =>
                    setColors(
                      colors.map((x, k) =>
                        k === i ? { ...x, hex: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="text"
                  aria-label={`Nome da cor ${i + 1}`}
                  value={c.name}
                  maxLength={24}
                  disabled={dis}
                  onChange={(e) =>
                    setColors(
                      colors.map((x, k) =>
                        k === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                {canEdit && (
                  <button
                    type="button"
                    className="mini-btn"
                    aria-label={`Remover a cor ${i + 1}`}
                    onClick={() => setColors(colors.filter((_, k) => k !== i))}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && colors.length < MAX_KIT_COLORS && (
              <button
                type="button"
                className="mini-btn"
                onClick={() =>
                  setColors([...colors, { name: "Nova cor", hex: "#1d5fe0" }])
                }
              >
                <Plus size={12} /> Adicionar cor
              </button>
            )}
          </section>

          <section className="card" aria-label="Fontes">
            <h3>
              Fontes aprovadas{" "}
              <small className="muted">(até {MAX_KIT_FONTS})</small>
            </h3>
            <div className="kit-fonts">
              {PROMO_FONTS.map((f) => (
                <label
                  key={f.id}
                  className={`kit-font${fonts.includes(f.id) ? " on" : ""}`}
                  style={{ fontFamily: fontStack(f.id) }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Fonte ${f.label}`}
                    checked={fonts.includes(f.id)}
                    disabled={
                      dis ||
                      (!fonts.includes(f.id) && fonts.length >= MAX_KIT_FONTS)
                    }
                    onChange={(e) =>
                      setFonts(
                        e.target.checked
                          ? [...fonts, f.id]
                          : fonts.filter((x) => x !== f.id),
                      )
                    }
                  />
                  {f.label}{" "}
                  <small className="muted">
                    {FONT_CATEGORY_LABEL[f.category]}
                  </small>
                </label>
              ))}
            </div>
          </section>

          <section className="card" aria-label="Textos prontos">
            <h3>
              Textos prontos{" "}
              <small className="muted">
                (Instagram, telefone, chamada, aviso…)
              </small>
            </h3>
            {texts.map((t, i) => (
              <div key={i} className="kit-row" data-text={t.label}>
                <input
                  type="text"
                  aria-label={`Rótulo do texto ${i + 1}`}
                  value={t.label}
                  maxLength={30}
                  disabled={dis}
                  onChange={(e) =>
                    setTexts(
                      texts.map((x, k) =>
                        k === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  style={{ maxWidth: 160 }}
                />
                <input
                  type="text"
                  aria-label={`Texto ${i + 1}`}
                  value={t.text}
                  maxLength={200}
                  disabled={dis}
                  onChange={(e) =>
                    setTexts(
                      texts.map((x, k) =>
                        k === i ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                />
                {canEdit && (
                  <button
                    type="button"
                    className="mini-btn"
                    aria-label={`Remover o texto ${i + 1}`}
                    onClick={() => setTexts(texts.filter((_, k) => k !== i))}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && texts.length < MAX_KIT_TEXTS && (
              <button
                type="button"
                className="mini-btn"
                onClick={() => setTexts([...texts, { label: "", text: "" }])}
              >
                <Plus size={12} /> Adicionar texto
              </button>
            )}
          </section>

          {canEdit && (
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                style={{ width: "auto" }}
                disabled={busy}
                onClick={save}
              >
                {busy ? "Salvando…" : "Salvar kit de marca"}
              </button>
            </div>
          )}
          {msg && (
            <p
              className={msg.ok ? "form-ok" : "form-error"}
              role={msg.ok ? "status" : "alert"}
            >
              {msg.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
