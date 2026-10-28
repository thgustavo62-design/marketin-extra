"use client";
import { useEffect, useState } from "react";
import { X, Move, Link2 } from "lucide-react";
import type { Editor } from "../types";
import {
  alignSelection,
  canTransformSelection,
  containsPhoto,
  currentSelection,
  distributeSelection,
  orderSelection,
  transformSelection,
} from "../layout-operations";
import {
  validObjectTransform,
  type LayoutAlignment,
} from "@/lib/domain/design-layout";
import "./layout-tools.css";

export function PositionSidebar({
  editor,
  onClose,
}: {
  editor: Editor | undefined;
  onClose: () => void;
}) {
  const canvas = editor?.canvas,
    selected = canvas ? currentSelection(canvas) : [],
    object = selected.length === 1 ? selected[0] : null,
    page = editor?.getWorkspace(),
    box = object?.getBoundingRect(true, true),
    pageBox = page?.getBoundingRect(true, true);
  const x = box && pageBox ? box.left - pageBox.left : 0,
    y = box && pageBox ? box.top - pageBox.top : 0,
    w = (object?.width ?? 0) * (object?.scaleX ?? 1),
    h = (object?.height ?? 0) * (object?.scaleY ?? 1),
    angle = object?.angle ?? 0;
  const [fields, setFields] = useState({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      angle: 0,
    }),
    [linked, setLinked] = useState(true),
    [reference, setReference] = useState<"page" | "selection">("page"),
    [message, setMessage] = useState("");
  useEffect(() => {
    setFields({ x, y, width: w, height: h, angle });
  }, [object, x, y, w, h, angle]);
  const canEdit = !!canvas && canTransformSelection(canvas),
    forceLinked = !!object && containsPhoto(object),
    ratio = w > 0 && h > 0 ? w / h : 1;
  const change = (key: keyof typeof fields, value: number) =>
    setFields((previous) => {
      const next = { ...previous, [key]: value };
      if (linked || forceLinked) {
        if (key === "width") next.height = value / ratio;
        if (key === "height") next.width = value * ratio;
      }
      return next;
    });
  const labels: [LayoutAlignment, string][] = [
    ["left", "Esquerda"],
    ["center", "Centro horizontal"],
    ["right", "Direita"],
    ["top", "Topo"],
    ["middle", "Centro vertical"],
    ["bottom", "Base"],
  ];
  return (
    <aside className="studio-layout-panel" aria-label="Posição e tamanho">
      <header className="layout-heading">
        <div>
          <h2>
            <Move size={16} />
            Posição
          </h2>
          <p>
            {selected.length
              ? `${selected.length} elemento(s) selecionado(s)`
              : "Selecione um elemento ou use Camadas"}
          </p>
        </div>
        <button aria-label="Fechar posição" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="layout-scroll">
        <section>
          <h3>Alinhar elementos</h3>
          <label className="layout-field">
            Referência
            <select
              aria-label="Referência de alinhamento"
              value={reference}
              onChange={(e) => setReference(e.target.value as typeof reference)}
            >
              <option value="page">Página · mover a seleção em conjunto</option>
              <option value="selection">Seleção · alinhar entre si</option>
            </select>
          </label>
          <div className="layout-buttons">
            {labels.map(([kind, label]) => (
              <button
                key={kind}
                disabled={
                  !canEdit || (reference === "selection" && selected.length < 2)
                }
                onClick={() => {
                  if (canvas && alignSelection(canvas, kind, reference))
                    setMessage("Alinhamento aplicado. Você pode desfazer.");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Distribuir espaços</h3>
          <p>
            Mantenha as extremidades e iguale a distância entre três ou mais
            elementos.
          </p>
          <div className="layout-buttons">
            {(["horizontal", "vertical"] as const).map((axis) => (
              <button
                key={axis}
                disabled={!canEdit || selected.length < 3}
                onClick={() => {
                  if (canvas)
                    setMessage(
                      distributeSelection(canvas, axis)
                        ? "Espaços distribuídos."
                        : "Não há espaço suficiente para distribuir sem sobrepor os elementos.",
                    );
                }}
              >
                {axis === "horizontal"
                  ? "Espaçar horizontalmente"
                  : "Espaçar verticalmente"}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Medidas exatas</h3>
          {object ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canvas)
                  setMessage(
                    transformSelection(canvas, fields)
                      ? "Posição e medidas aplicadas."
                      : "Confira as medidas e preserve a proporção das fotografias.",
                  );
              }}
            >
              <p>
                X e Y indicam o canto visível em relação à página. Largura e
                altura são medidas sem rotação, em pixels.
              </p>
              <div className="layout-grid">
                {(
                  [
                    ["x", "Posição X"],
                    ["y", "Posição Y"],
                    ["width", "Largura do elemento"],
                    ["height", "Altura do elemento"],
                    ["angle", "Rotação do elemento"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={label}
                      type="number"
                      step="any"
                      required
                      min={
                        key === "width" || key === "height"
                          ? 1
                          : key === "angle"
                            ? -360
                            : -16384
                      }
                      max={
                        key === "width" || key === "height"
                          ? 8192
                          : key === "angle"
                            ? 360
                            : 16384
                      }
                      value={
                        Number.isFinite(fields[key])
                          ? Number(fields[key].toFixed(3))
                          : ""
                      }
                      onChange={(e) =>
                        change(
                          key,
                          e.target.value === "" ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="layout-check">
                <input
                  type="checkbox"
                  aria-label="Manter proporção"
                  checked={linked || forceLinked}
                  disabled={forceLinked}
                  onChange={(e) => setLinked(e.target.checked)}
                />
                <Link2 size={14} />
                Manter proporção
              </label>
              {forceLinked && (
                <p>Fotografias e grupos com fotografias mantêm a proporção.</p>
              )}
              <button
                className="layout-primary"
                type="submit"
                disabled={!canEdit || !validObjectTransform(fields)}
              >
                Aplicar medidas
              </button>
            </form>
          ) : (
            <p>
              Selecione um único elemento para ajustar medidas. Agrupe elementos
              para redimensionar o conjunto.
            </p>
          )}
        </section>
        <section>
          <h3>Ordem das camadas</h3>
          <div className="layout-buttons">
            {(
              [
                ["front", "Trazer ao topo"],
                ["forward", "Avançar camada"],
                ["backward", "Recuar camada"],
                ["back", "Enviar ao fundo"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                disabled={!canEdit}
                onClick={() => {
                  if (canvas && orderSelection(canvas, mode))
                    setMessage("Ordem atualizada.");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
      <p className="layout-status" role="status">
        {message ||
          "Use as setas para mover 1 px. Shift + seta move 10 px. As alterações são salvas na arte."}
      </p>
    </aside>
  );
}
