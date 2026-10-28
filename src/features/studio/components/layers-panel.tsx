"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Group, Ungroup, X } from "lucide-react";
import type { Editor } from "../types";
import { layerDisplayName } from "@/lib/domain/design-layout";
import {
  canvasEditable,
  currentSelection,
  editableLayer,
  groupSelection,
  ungroupSelection,
  selectLayer,
  toggleLayer,
  renameLayer,
  type LayerObject,
} from "../layout-operations";
import "./layout-tools.css";

export function LayersPanel({
  editor,
  canEdit,
  onClose,
}: {
  editor: Editor | undefined;
  canEdit: boolean;
  onClose: () => void;
}) {
  const canvas = editor?.canvas,
    objects = (canvas?.getObjects().filter((o) => o.name !== "clip") ??
      []) as LayerObject[],
    selected = canvas ? currentSelection(canvas) : [],
    single = selected.length === 1 ? (selected[0] as LayerObject) : null;
  const selectedSet = new Set(selected),
    ready = !!canvas && canvasEditable(canvas);
  const [name, setName] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setName(single ? layerDisplayName(single) : "");
  }, [single, single?.layerName]);
  return (
    <aside className="studio-layers" aria-label="Camadas da arte">
      <header className="layout-heading">
        <h2>Camadas</h2>
        <button aria-label="Fechar camadas" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {canEdit && (
        <>
          <p className="layout-help">
            Use as caixas para selecionar vários elementos. Shift + clique
            também adiciona à seleção.
          </p>
          <div className="layout-buttons">
            <button
              aria-label="Agrupar seleção"
              disabled={selected.length < 2 || !selected.every(editableLayer)}
              onClick={() => canvas && groupSelection(canvas)}
            >
              <Group size={15} />
              Agrupar
            </button>
            <button
              aria-label="Desagrupar seleção"
              disabled={single?.type !== "group"}
              onClick={() => canvas && ungroupSelection(canvas)}
            >
              <Ungroup size={15} />
              Separar
            </button>
          </div>
        </>
      )}
      {single && canEdit && (
        <form
          className="layer-rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (canvas)
              setMessage(
                renameLayer(canvas, single, name)
                  ? "Nome da camada salvo."
                  : "Use um nome de 1 a 80 caracteres.",
              );
          }}
        >
          <label>
            Nome da camada
            <input
              aria-label="Nome da camada"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!name.trim()}>
            Renomear camada
          </button>
        </form>
      )}
      <p className="layout-help" role="status">
        {message ||
          `${selected.length} selecionado(s) · ${objects.length} camadas`}
      </p>
      {[...objects].reverse().map((o, i) => {
        const label = layerDisplayName(o),
          active = selectedSet.has(o);
        return (
          <div
            className="studio-layer"
            data-object-type={o.type}
            key={objects.length - i}
            data-active={active}
          >
            <button
              title={label}
              disabled={!canEdit || !ready || !editableLayer(o)}
              onClick={(e) => canvas && selectLayer(canvas, o, e.shiftKey)}
            >
              {label}
            </button>
            {canEdit && (
              <>
                <input
                  type="checkbox"
                  aria-label={`Selecionar camada ${label}`}
                  checked={active}
                  disabled={!editableLayer(o)}
                  onChange={() => canvas && selectLayer(canvas, o, true)}
                />
                <button
                  aria-label={
                    o.visible === false ? "Mostrar camada" : "Ocultar camada"
                  }
                  onClick={() => canvas && toggleLayer(canvas, o, "visible")}
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
                  onClick={() => canvas && toggleLayer(canvas, o, "selectable")}
                >
                  {o.selectable ? <Unlock size={13} /> : <Lock size={13} />}
                </button>
              </>
            )}
          </div>
        );
      })}
    </aside>
  );
}
