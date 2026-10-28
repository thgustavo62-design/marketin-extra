"use client";
import { useEffect, useState } from "react";
import { X, Palette } from "lucide-react";
import {
  DESIGN_PALETTES,
  colorKey,
  designHex,
  documentColors,
  parseDesignColor,
} from "@/lib/domain/design-colors";
import { emptyKit, type BrandKit } from "@/lib/domain/promo-brand";
import { fontDef } from "@/lib/domain/promo-fonts";
import { getKitAction } from "@/app/(app)/criacao/marcas/actions";
import { useLibraryImageAction } from "@/app/(app)/promocoes/actions";
import {
  editableCanvas,
  replaceCanvasColor,
  setPagePaint,
} from "../design-paints";
import type { Editor } from "../types";
import { ColorPicker } from "./color-picker";
import "./design-styles.css";

type Kit = BrandKit & { logos: { id: string; name: string }[] };
export function StylesSidebar({
  editor,
  companyId,
  companyName,
  campaignId,
  onClose,
}: {
  editor: Editor | undefined;
  companyId?: string | null;
  companyName?: string | null;
  campaignId: string;
  onClose: () => void;
}) {
  const [kit, setKit] = useState<Kit>({ ...emptyKit(), logos: [] }),
    [kitStatus, setKitStatus] = useState(""),
    [replacement, setReplacement] = useState("#6754d8"),
    [from, setFrom] = useState(""),
    [scope, setScope] = useState("page"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [gradient, setGradient] = useState(false),
    [first, setFirst] = useState("#ffffff"),
    [second, setSecond] = useState("#dcceff"),
    [angle, setAngle] = useState(90);
  const canvas = editor?.canvas;
  useEffect(() => {
    let current = true;
    setKit({ ...emptyKit(), logos: [] });
    if (!companyId) {
      setKitStatus("Vincule esta arte a uma empresa para usar o kit de marca.");
      return;
    }
    setKitStatus("Carregando a identidade da empresa…");
    getKitAction(companyId)
      .then((result) => {
        if (!current) return;
        if (result) {
          setKit(result);
          setKitStatus("");
        } else setKitStatus("Kit indisponível para este acesso.");
      })
      .catch(() => {
        if (current)
          setKitStatus(
            "Não foi possível carregar o kit. Feche e abra Estilos para tentar novamente.",
          );
      });
    return () => {
      current = false;
    };
  }, [companyId]);
  const pageFill = canvas?.getObjects().find((o) => o.name === "clip")?.fill;
  useEffect(() => {
    const fill = pageFill;
    if (typeof fill === "string") {
      setGradient(false);
      const c = parseDesignColor(fill);
      if (c) setFirst(designHex(c));
    } else if (fill && "colorStops" in fill && Array.isArray(fill.colorStops)) {
      setGradient(true);
      const [a, b] = fill.colorStops;
      const ca = parseDesignColor(a?.color),
        cb = parseDesignColor(b?.color);
      if (ca) setFirst(designHex(ca));
      if (cb) setSecond(designHex(cb));
      const coords = fill.coords as {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      };
      if (coords)
        setAngle(
          Math.round(
            (Math.atan2(coords.y2 - coords.y1, coords.x2 - coords.x1) * 180) /
              Math.PI,
          ),
        );
    }
  }, [pageFill]);
  const entries = documentColors(
    canvas
      ? scope === "selection"
        ? canvas.getActiveObjects()
        : canvas.getObjects()
      : [],
  );
  const source = from || entries[0]?.color || "",
    selected = !!canvas?.getActiveObjects().length,
    canReplace =
      entries.some((e) => colorKey(e.color) === colorKey(source)) &&
      colorKey(source) !== colorKey(replacement);
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="studio-style-panel" aria-label="Estilos da arte">
      <header className="style-heading">
        <div>
          <h2>
            <Palette
              size={16}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 7,
              }}
            />
            Estilos
          </h2>
          <small>{companyName || "Personalize esta arte"}</small>
        </div>
        <button type="button" aria-label="Fechar estilos" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="style-scroll">
        <section className="style-section" aria-label="Identidade da empresa">
          <h3>Kit de marca</h3>
          {kitStatus && <p role="status">{kitStatus}</p>}
          {!kitStatus &&
            !kit.colors.length &&
            !kit.fonts.length &&
            !kit.logos.length && (
              <p>
                Cadastre cores, fontes e logos em Design → Kit de marca. Cada
                empresa tem sua própria identidade.
              </p>
            )}
          {!!kit.colors.length && (
            <div className="style-swatches" aria-label="Cores da empresa">
              {kit.colors.map((c) => (
                <button
                  type="button"
                  key={c.hex}
                  className="style-swatch"
                  style={{ background: c.hex }}
                  title={c.name}
                  aria-label={`Cor da empresa: ${c.name}`}
                  onClick={() => {
                    setReplacement(c.hex);
                    setNotice(
                      `${c.name} selecionada para substituir uma cor da arte.`,
                    );
                  }}
                />
              ))}
            </div>
          )}
          {kit.fonts.map((id) => (
            <button
              type="button"
              key={id}
              className="studio-choice style-font"
              disabled={
                busy ||
                !editor?.selectedObjects.some((o) =>
                  ["text", "i-text", "textbox"].includes(o.type || ""),
                )
              }
              onClick={() =>
                void run(async () => {
                  if (!editor || !editableCanvas(editor.canvas)) return;
                  const selected = editor.canvas.getActiveObject();
                  const { loadFonts, loadPromoFonts } = await import(
                    "@/lib/promo/fonts-loader"
                  );
                  if (id === "display" || id === "text") await loadPromoFonts();
                  else await loadFonts([id]);
                  if (!selected || editor.canvas.getActiveObject() !== selected)
                    return;
                  editor.changeFontFamily(
                    fontDef(id).family ??
                      (id === "mono" ? "Courier New" : "Georgia"),
                  );
                  setNotice(
                    `Fonte ${fontDef(id).label} aplicada ao texto selecionado.`,
                  );
                })
              }
            >
              Aa · {fontDef(id).label}
            </button>
          ))}
          {!!kit.fonts.length && (
            <p>Selecione um texto para aplicar uma fonte aprovada.</p>
          )}
          <div className="style-assets">
            {kit.logos.map((logo) => (
              <button
                type="button"
                key={logo.id}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await useLibraryImageAction(campaignId, logo.id);
                    if (!r.ok || !r.id)
                      throw new Error(
                        r.error || "Não foi possível inserir o logo.",
                      );
                    await editor?.addImage(`/api/promocoes/asset/${r.id}`);
                    setNotice("Logo inserido na arte.");
                  })
                }
              >
                <img
                  src={`/api/promocoes/biblioteca/${logo.id}?mini=1`}
                  alt=""
                  loading="lazy"
                />
                {logo.name}
              </button>
            ))}
          </div>
        </section>
        <section className="style-section" aria-label="Substituir cores">
          <h3>Cores desta arte</h3>
          <p>
            Troque uma cor em textos, formas e degradês. Fotografias e camadas
            bloqueadas são preservadas.
          </p>
          <div className="style-scope">
            <label>
              <input
                type="radio"
                name="style-scope"
                value="page"
                checked={scope === "page"}
                onChange={() => {
                  setScope("page");
                  setFrom("");
                }}
              />
              Página
            </label>
            <label>
              <input
                type="radio"
                name="style-scope"
                value="selection"
                checked={scope === "selection"}
                disabled={!selected}
                onChange={() => {
                  setScope("selection");
                  setFrom("");
                }}
              />
              Seleção
            </label>
          </div>
          <div className="style-swatches" aria-label="Cores encontradas">
            {entries.slice(0, 48).map((c) => (
              <button
                type="button"
                key={c.color}
                className="style-swatch"
                aria-label={`Substituir ${c.color}`}
                aria-pressed={colorKey(source) === colorKey(c.color)}
                title={`${c.color} · ${c.count} ocorrência(s)`}
                style={{ background: c.color }}
                onClick={() => setFrom(c.color)}
              />
            ))}
          </div>
          <label className="style-field">
            Cor a substituir
            <select
              aria-label="Cor a substituir"
              value={source}
              onChange={(e) => setFrom(e.target.value)}
            >
              {!entries.some((e) => e.color === source) && (
                <option value={source}>
                  {source || "Nenhuma cor editável"}
                </option>
              )}
              {entries.map((c) => (
                <option key={c.color} value={c.color}>
                  {c.color} · {c.count} ocorrência(s)
                </option>
              ))}
            </select>
          </label>
          <h3>Nova cor</h3>
          <ColorPicker
            value={replacement}
            onChange={setReplacement}
            label="Nova cor"
            swatches={
              kit.colors.length ? kit.colors.map((c) => c.hex) : undefined
            }
          />
          <button
            type="button"
            className="studio-choice style-primary"
            disabled={
              !canvas || !canReplace || (scope === "selection" && !selected)
            }
            onClick={() => {
              if (!canvas) return;
              const count = replaceCanvasColor(
                canvas,
                source,
                replacement,
                scope === "selection",
              );
              setFrom(replacement);
              setNotice(
                count
                  ? `${count} ocorrência(s) atualizada(s) ${scope === "selection" ? "na seleção" : "nesta página"}. Você pode desfazer.`
                  : "Nenhuma cor foi alterada.",
              );
            }}
          >
            {scope === "selection"
              ? "Substituir na seleção"
              : "Substituir nesta página"}
          </button>
        </section>
        <section className="style-section" aria-label="Paletas sugeridas">
          <h3>Explore combinações</h3>
          <p>Escolha uma cor da paleta para usar na substituição acima.</p>
          {DESIGN_PALETTES.map((p) => (
            <div className="style-palette" key={p.name}>
              <span>{p.name}</span>
              <div className="style-swatches">
                {p.colors.map((c) => (
                  <button
                    type="button"
                    className="style-swatch"
                    key={c}
                    style={{ background: c }}
                    aria-label={`${p.name}: ${c}`}
                    onClick={() => {
                      setReplacement(c);
                      setNotice(`Cor ${c} selecionada.`);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className="style-section" aria-label="Fundo da página">
          <h3>Fundo da página</h3>
          <label className="style-field">
            Tipo
            <select
              aria-label="Tipo de fundo"
              value={gradient ? "gradient" : "solid"}
              onChange={(e) => setGradient(e.target.value === "gradient")}
            >
              <option value="solid">Cor sólida</option>
              <option value="gradient">Degradê linear</option>
            </select>
          </label>
          <label className="style-field">
            Cor inicial{" "}
            <input
              aria-label="Cor inicial do fundo"
              type="color"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </label>
          {gradient && (
            <>
              <label className="style-field">
                Cor final{" "}
                <input
                  aria-label="Cor final do fundo"
                  type="color"
                  value={second}
                  onChange={(e) => setSecond(e.target.value)}
                />
              </label>
              <label className="style-field">
                Inclinação{" "}
                <input
                  aria-label="Inclinação do degradê"
                  type="number"
                  min={-180}
                  max={180}
                  value={angle}
                  onChange={(e) =>
                    setAngle(
                      Math.max(
                        -180,
                        Math.min(180, Number(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </label>
            </>
          )}
          <div
            style={{
              height: 55,
              borderRadius: 8,
              border: "1px solid #ddd",
              background: gradient
                ? `linear-gradient(${angle + 90}deg,${first},${second})`
                : first,
            }}
            aria-label="Prévia do fundo"
          />
          <button
            type="button"
            className="studio-choice style-primary"
            onClick={() => {
              if (
                canvas &&
                setPagePaint(
                  canvas,
                  first,
                  gradient ? second : undefined,
                  angle,
                )
              )
                setNotice(
                  "Fundo aplicado. Imagens de fundo existentes continuam como camadas independentes.",
                );
            }}
          >
            Aplicar fundo
          </button>
        </section>
      </div>
      <p className="style-notice" role="status">
        {notice ||
          "As alterações valem para esta página e são salvas com a arte. O modelo oficial da empresa permanece preservado."}
      </p>
    </aside>
  );
}
