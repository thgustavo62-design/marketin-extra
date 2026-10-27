"use client";
import { blankDesignScene } from "@/lib/domain/design-presets";
import { fabric } from "fabric";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Layers,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Group,
  Ungroup,
  Save,
  X,
} from "lucide-react";
import { PROMO_FORMATS, PROMO_FORMAT_KEYS } from "@/lib/domain/promo";
import { validateStudioScene, type StudioScene } from "@/lib/domain/studio";
import {
  createTemplateAction,
  useLibraryImageAction,
} from "@/app/(app)/promocoes/actions";
import { addStudioPageAction } from "@/app/studio/[id]/actions";
import { Sidebar } from "./components/sidebar";
import { Toolbar } from "./components/toolbar";
import { Footer } from "./components/footer";
import { ShapeSidebar } from "./components/shape-sidebar";
import { FillColorSidebar } from "./components/fill-color-sidebar";
import { StrokeColorSidebar } from "./components/stroke-color-sidebar";
import { StrokeWidthSidebar } from "./components/stroke-width-sidebar";
import { OpacitySidebar } from "./components/opacity-sidebar";
import { TextSidebar } from "./components/text-sidebar";
import { FontSidebar } from "./components/font-sidebar";
import { FilterSidebar } from "./components/filter-sidebar";
import { DrawSidebar } from "./components/draw-sidebar";
import { SettingsSidebar } from "./components/settings-sidebar";
import { useEditor } from "./hooks/use-editor";
import { type ActiveTool } from "./types";
import { promotionPageCount, promotionScene } from "./promotion-scene";
import { useStudioPersistence } from "./use-persistence";
import {
  dataUrlBlob,
  persistSceneImages,
  uploadStudioImage,
} from "./image-assets";
import { studioCanvasJson } from "./scene-json";
import { AiPanel } from "./ai-panel";
import type { StudioLoaderProps } from "./studio-loader";
export function StudioEditor(
  props: StudioLoaderProps & { initialScene: StudioScene },
) {
  const { source, format, page, saved, sourceHash, needsMigration } = props,
    c = source.campaign,
    canEdit = props.canEdit && !needsMigration;
  const router = useRouter(),
    canvasRef = useRef<HTMLCanvasElement>(null),
    containerRef = useRef<HTMLDivElement>(null),
    canvasInstance = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select"),
    [showLayers, setShowLayers] = useState(false),
    [tick, setTick] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [templateName, setTemplateName] = useState(""),
    [documentSourceHash, setDocumentSourceHash] = useState(
      saved?.source_hash ?? sourceHash,
    );
  const docHashRef = useRef(documentSourceHash);
  docHashRef.current = documentSourceHash;
  const persistence = useStudioPersistence({
    id: c.id,
    format,
    page,
    revision: saved?.revision ?? 0,
    sourceHash,
    documentSourceHash: docHashRef,
    canEdit,
  });
  const clearSelection = useCallback(
    () =>
      setActiveTool((t) =>
        [
          "fill",
          "font",
          "filter",
          "opacity",
          "remove-bg",
          "stroke-color",
          "stroke-width",
        ].includes(t)
          ? "select"
          : t,
      ),
    [],
  );
  const { init, editor } = useEditor({
    defaultState: JSON.stringify(props.initialScene),
    defaultWidth: PROMO_FORMATS[format].w,
    defaultHeight: PROMO_FORMATS[format].h,
    readOnly: !canEdit,
    clearSelectionCallback: clearSelection,
    saveCallback: persistence.schedule,
  });
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      controlsAboveOverlay: true,
      preserveObjectStacking: true,
      selection: canEdit,
      skipTargetFind: !canEdit,
    });
    canvasInstance.current = canvas;
    init({ initialCanvas: canvas, initialContainer: containerRef.current });
    const update = () => setTick((t) => t + 1);
    for (const e of [
      "object:added",
      "object:removed",
      "object:modified",
      "selection:created",
      "selection:updated",
      "selection:cleared",
      "text:changed",
    ])
      canvas.on(e, update);
    const ready = setInterval(() => {
      if (
        (canvas as fabric.Canvas & { __studioRestoring?: boolean })
          .__studioRestoring
      )
        return;
      clearInterval(ready);
      if (!saved && canEdit)
        persistence.schedule({ json: studioCanvasJson(canvas) });
      setTick((t) => t + 1);
    }, 100);
    return () => {
      clearInterval(ready);
      canvasInstance.current = null;
      canvas.dispose();
    };
  }, [init]);
  const lastThumbnail = useRef("");
  useEffect(() => {
    if (!canEdit || page !== 0 || persistence.status !== "Salvo") return;
    const t = setTimeout(() => {
      const canvas = canvasInstance.current,
        clip = canvas?.getObjects().find((o) => o.name === "clip");
      if (!canvas || !clip) return;
      const view = canvas.viewportTransform?.slice();
      try {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        const data = canvas.toDataURL({
          format: "webp",
          quality: 0.75,
          left: clip.left,
          top: clip.top,
          width: clip.width,
          height: clip.height,
          multiplier: 360 / (clip.width || 1080),
        });
        if (data !== lastThumbnail.current) {
          lastThumbnail.current = data;
          void fetch(`/api/promocoes/miniatura/${c.id}`, {
            method: "POST",
            body: dataUrlBlob(data),
          });
        }
      } catch {
      } finally {
        if (view) canvas.setViewportTransform(view);
        canvas.requestRenderAll();
      }
    }, 800);
    return () => clearTimeout(t);
  }, [canEdit, c.id, page, persistence.status, tick]);
  const navigate = async (url: string) => {
    if (await persistence.flush()) router.push(url);
  };
  const tool = useCallback(
    (next: ActiveTool) => {
      if (!canEdit) return;
      if (activeTool === "draw") editor?.disableDrawingMode();
      if (next === "draw" && next !== activeTool) editor?.enableDrawingMode();
      setActiveTool(next === activeTool ? "select" : next);
    },
    [activeTool, editor, canEdit],
  );
  const refresh = () => {
    editor?.canvas.fire("object:modified");
    editor?.canvas.requestRenderAll();
    setTick((t) => t + 1);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };
  const loadScene = async (scene: StudioScene, copyLocal = false) => {
    const valid = validateStudioScene(scene);
    if (!valid.ok) throw new Error(valid.error);
    const normalized = await persistSceneImages(valid.scene, c.id, copyLocal),
      again = validateStudioScene(normalized);
    if (!again.ok) throw new Error(again.error);
    editor?.loadJson(JSON.stringify(again.scene));
    setActiveTool("select");
  };
  const regenerate = () => {
    if (
      !canEdit ||
      !confirm(
        c.kind === "design"
          ? "Recriar esta página em branco no tamanho atual? As edições desta página serão substituídas. Você pode desfazer enquanto o editor estiver aberto."
          : "Regenerar esta página a partir dos produtos e do tema? As edições desta página serão substituídas. Você pode desfazer enquanto o editor estiver aberto.",
      )
    )
      return;
    void run(async () => {
      const scene =
        c.kind === "design"
          ? blankDesignScene(
              editor?.getWorkspace()?.width ?? PROMO_FORMATS[format].w,
              editor?.getWorkspace()?.height ?? PROMO_FORMATS[format].h,
            )
          : await promotionScene(source, format, page);
      docHashRef.current = sourceHash;
      setDocumentSourceHash(sourceHash);
      await loadScene(scene, true);
    });
  };
  const pageCount = promotionPageCount(source, format),
    stale = c.kind === "promocao" && documentSourceHash !== sourceHash,
    selected = editor?.canvas.getActiveObject(),
    objects =
      editor?.canvas.getObjects().filter((o) => o.name !== "clip") ?? [],
    common = { editor, activeTool, onChangeActiveTool: tool };
  return (
    <div
      className="n7-studio"
      data-testid="nova7-studio"
      data-editor-ready={Boolean(editor)}
    >
      <header className="studio-header">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() =>
            void navigate(c.kind === "design" ? "/criacao" : "/promocoes")
          }
        >
          <ArrowLeft size={16} />
        </button>
        <img
          className="studio-wordmark"
          src="/brand/encartiva/branca.png"
          alt="Encartiva Studio"
        />
        <span className="studio-title">{c.name}</span>
        <button
          type="button"
          aria-label="Desfazer"
          disabled={!canEdit || !editor?.canUndo()}
          onClick={() => editor?.onUndo()}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          aria-label="Refazer"
          disabled={!canEdit || !editor?.canRedo()}
          onClick={() => editor?.onRedo()}
        >
          <Redo2 size={16} />
        </button>
        <select
          aria-label="Formato da arte"
          value={format}
          disabled={c.kind === "design"}
          onChange={(e) =>
            void navigate(`/studio/${c.id}?formato=${e.target.value}`)
          }
        >
          {PROMO_FORMAT_KEYS.map((f) => (
            <option key={f} value={f}>
              {c.kind === "design" && editor?.getWorkspace()
                ? `${editor.getWorkspace()?.width} × ${editor.getWorkspace()?.height} px`
                : PROMO_FORMATS[f].label}
            </option>
          ))}
        </select>
        {c.kind === "promocao" && (
          <button
            onClick={() => void navigate(`/promocoes/${c.id}?classico=1`)}
          >
            Produtos e planilha
          </button>
        )}
        <span className="studio-status" role="status">
          {canEdit
            ? persistence.status
            : needsMigration
              ? "Banco aguardando atualização"
              : "Somente leitura"}
        </span>
        {canEdit && (
          <button
            aria-label="Salvar arte"
            onClick={() => void persistence.flush()}
          >
            <Save size={16} />
          </button>
        )}
        <button aria-label="Camadas" onClick={() => setShowLayers((v) => !v)}>
          <Layers size={16} />
        </button>
        <details className="studio-download">
          <summary>Exportar</summary>
          <div>
            <button onClick={() => editor?.savePng()}>PNG</button>
            {format === "a4" && (
              <button
                onClick={() =>
                  void run(async () => {
                    await editor?.savePdf();
                  })
                }
              >
                PDF para impressão
              </button>
            )}
            <button onClick={() => editor?.saveJpg()}>JPG</button>
            <button onClick={() => editor?.saveSvg()}>SVG vetorial</button>
            <button onClick={() => editor?.saveJson()}>JSON editável</button>
          </div>
        </details>
      </header>
      {needsMigration && (
        <div className="studio-message" role="alert">
          O banco precisa receber a atualização do Studio para salvar as artes.
          A visualização e a exportação estão disponíveis.
        </div>
      )}
      {stale && (
        <div className="studio-message" role="alert">
          Os produtos ou o tema mudaram desde esta edição. Confira os preços
          antes de exportar.
          {canEdit && (
            <button onClick={regenerate} disabled={busy}>
              Regenerar página
            </button>
          )}
        </div>
      )}
      {(message || persistence.error) && (
        <div className="studio-message" role="alert">
          {message || persistence.error}
          <button aria-label="Fechar aviso" onClick={() => setMessage("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="studio-body">
        {canEdit && (
          <Sidebar activeTool={activeTool} onChangeActiveTool={tool} />
        )}
        {canEdit && (
          <>
            <ShapeSidebar {...common} />
            <FillColorSidebar {...common} />
            <StrokeColorSidebar {...common} />
            <StrokeWidthSidebar {...common} />
            <OpacitySidebar {...common} />
            <TextSidebar {...common} />
            <FontSidebar {...common} />
            <FilterSidebar {...common} />
            <DrawSidebar {...common} />
            <SettingsSidebar {...common} />
            {activeTool === "images" && (
              <aside className="studio-panel">
                <h2>Imagens e biblioteca</h2>
                <label>
                  Enviar imagem
                  <input
                    aria-label="Enviar imagem"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(async () => {
                          editor?.addImage(await uploadStudioImage(c.id, file));
                        });
                      e.target.value = "";
                    }}
                  />
                </label>
                <h3>Arquivos desta arte</h3>
                <div className="studio-gallery">
                  {c.assets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() =>
                        editor?.addImage(`/api/promocoes/asset/${a.id}`)
                      }
                    >
                      <img
                        src={`/api/promocoes/asset/${a.id}?mini=1`}
                        alt="Imagem da arte"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
                <h3>Biblioteca compartilhada</h3>
                <div className="studio-gallery">
                  {c.library.map((a) => (
                    <button
                      key={a.id}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await useLibraryImageAction(c.id, a.id);
                          if (!r.ok || !r.id) throw new Error(r.error);
                          editor?.addImage(`/api/promocoes/asset/${r.id}`);
                        })
                      }
                    >
                      <img
                        src={`/api/promocoes/biblioteca/${a.id}?mini=1`}
                        alt={a.name}
                        loading="lazy"
                      />
                      <small>{a.name}</small>
                    </button>
                  ))}
                </div>
                <button
                  className="studio-choice"
                  onClick={() => void navigate("/promocoes/biblioteca")}
                >
                  Gerenciar biblioteca
                </button>
              </aside>
            )}
            {activeTool === "templates" && (
              <aside className="studio-panel">
                <h2>Modelos e arquivos</h2>
                <p className="studio-muted">
                  Modelos da sua biblioteca, com os arquivos e o login da Encartiva.
                </p>
                <label>
                  Importar JSON do editor
                  <input
                    type="file"
                    accept=".json,application/json"
                    aria-label="Importar JSON"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && confirm("Substituir esta página pelo arquivo?"))
                        void run(async () => {
                          if (f.size > 900000)
                            throw new Error("Use um JSON de até 900 KB.");
                          await loadScene(JSON.parse(await f.text()), true);
                        });
                      e.target.value = "";
                    }}
                  />
                </label>
                {c.kind === "design" && (
                  <>
                    <h3>Salvar esta arte como modelo</h3>
                    <label>
                      Nome do modelo
                      <input
                        type="text"
                        maxLength={120}
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Ex.: Campanha institucional"
                      />
                    </label>
                    <button
                      className="studio-choice"
                      disabled={busy || templateName.trim().length < 2}
                      onClick={() =>
                        void run(async () => {
                          if (!(await persistence.flush())) return;
                          const r = await createTemplateAction(
                            c.id,
                            templateName,
                            "promocao",
                          );
                          if (!r.ok) throw new Error(r.error);
                          setMessage("Modelo salvo na biblioteca.");
                          router.refresh();
                        })
                      }
                    >
                      Salvar como modelo
                    </button>
                  </>
                )}
                <h3>Seus modelos</h3>
                {props.templates?.length === 0 && (
                  <p className="studio-muted">Nenhum modelo cadastrado.</p>
                )}
                <div className="studio-gallery">
                  {props.templates?.map((t) => (
                    <button
                      key={t.id}
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(`Aplicar o modelo “${t.name}” nesta página?`)
                        )
                          void run(async () => {
                            const r = await fetch(
                                `/api/studio/templates/${t.id}`,
                              ),
                              data = await r.json();
                            if (!r.ok) throw new Error(data.error);
                            await loadScene(
                              data.scene ??
                                (await promotionScene(
                                  data.source,
                                  t.format,
                                  0,
                                )),
                              true,
                            );
                          });
                      }}
                    >
                      {t.thumb_at && (
                        <img
                          src={`/api/promocoes/miniatura/${t.id}?v=${encodeURIComponent(t.thumb_at)}`}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <small>{t.name}</small>
                    </button>
                  ))}
                </div>
                <h3>Montagem automática</h3>
                <button
                  className="studio-choice"
                  disabled={busy}
                  onClick={regenerate}
                >
                  {c.kind === "promocao"
                    ? "Regenerar com os dados da planilha"
                    : "Recriar página em branco"}
                </button>
                <button
                  className="studio-choice"
                  onClick={() =>
                    void navigate(
                      `${c.kind === "design" ? "/criacao" : "/promocoes"}/${c.id}?classico=1`,
                    )
                  }
                >
                  Dados e geração automática
                </button>
              </aside>
            )}
            {(activeTool === "ai" || activeTool === "remove-bg") && (
              <AiPanel
                campaignId={c.id}
                editor={editor}
                removeBackground={activeTool === "remove-bg"}
                configured={
                  activeTool === "remove-bg"
                    ? props.aiConfigured.removeBg
                    : props.aiConfigured.generate
                }
                onError={setMessage}
              />
            )}
          </>
        )}
        <main className="studio-work">
          {canEdit && (
            <Toolbar
              {...common}
              key={`${tick}:${editor?.selectedObjects.map((o) => objects.indexOf(o)).join(":")}:${selected?.type}:${activeTool}`}
            />
          )}
          <div className="studio-stage" ref={containerRef}>
            <canvas ref={canvasRef} aria-label="Área de edição do design" />
          </div>
          <div className="studio-footer">
            {canEdit && c.kind === "design" && (
              <button
                onClick={() =>
                  void run(async () => {
                    if (!(await persistence.flush())) return;
                    const r = await addStudioPageAction(c.id);
                    if (!r.ok || typeof r.page !== "number")
                      throw new Error(r.error);
                    router.push(
                      `/studio/${c.id}?formato=${format}&pagina=${r.page}`,
                    );
                  })
                }
              >
                + Página
              </button>
            )}
            <span>
              Página {page + 1} de {pageCount}
            </span>
            {Array.from({ length: pageCount }, (_, p) => (
              <button
                key={p}
                aria-current={p === page ? "page" : undefined}
                disabled={p === page}
                onClick={() =>
                  void navigate(`/studio/${c.id}?formato=${format}&pagina=${p}`)
                }
              >
                {p + 1}
              </button>
            ))}
            <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              {editor?.getWorkspace()?.width ?? PROMO_FORMATS[format].w} ×{" "}
              {editor?.getWorkspace()?.height ?? PROMO_FORMATS[format].h} px
            </span>
          </div>
          <Footer editor={editor} />
        </main>
        {showLayers && (
          <aside className="studio-layers">
            <h2>Camadas</h2>
            {canEdit && (
              <div className="flex gap-2">
                <button
                  aria-label="Agrupar seleção"
                  onClick={() => {
                    const o = editor?.canvas.getActiveObject();
                    if (o?.type === "activeSelection") {
                      (o as fabric.ActiveSelection).toGroup();
                      refresh();
                    }
                  }}
                >
                  <Group size={18} />
                </button>
                <button
                  aria-label="Desagrupar seleção"
                  onClick={() => {
                    const o = editor?.canvas.getActiveObject();
                    if (o?.type === "group") {
                      (o as fabric.Group).toActiveSelection();
                      refresh();
                    }
                  }}
                >
                  <Ungroup size={18} />
                </button>
              </div>
            )}
            {[...objects].reverse().map((o, i) => (
              <div
                className="studio-layer"
                key={objects.length - i}
                data-active={selected === o}
              >
                <button
                  disabled={!canEdit}
                  onClick={() => {
                    editor?.canvas.setActiveObject(o);
                    editor?.canvas.requestRenderAll();
                    setTick((t) => t + 1);
                  }}
                >
                  {(o as fabric.Text).text?.slice(0, 35) || o.name || o.type}
                </button>
                {canEdit && (
                  <>
                    <button
                      aria-label={
                        o.visible === false
                          ? "Mostrar camada"
                          : "Ocultar camada"
                      }
                      onClick={() => {
                        o.set({ visible: o.visible === false });
                        refresh();
                      }}
                    >
                      {o.visible === false ? (
                        <EyeOff size={13} />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                    <button
                      aria-label={
                        o.selectable ? "Bloquear camada" : "Desbloquear camada"
                      }
                      onClick={() => {
                        o.set({
                          selectable: !o.selectable,
                          evented: !o.selectable,
                        });
                        editor?.canvas.discardActiveObject();
                        refresh();
                      }}
                    >
                      {o.selectable ? <Unlock size={13} /> : <Lock size={13} />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
