// Adapted from the canva-clone sidebar shell (Apache-2.0); Encartiva photo controls.
import { ActiveTool, Editor } from "@/features/studio/types";
import "./photo-controls.css";
import { ToolSidebarHeader } from "./tool-sidebar-header";
import { PhotoControls } from "./photo-controls";
import { fabric } from "fabric";
export function FilterSidebar({ editor, activeTool, onChangeActiveTool }: { editor: Editor | undefined; activeTool: ActiveTool; onChangeActiveTool: (tool: ActiveTool) => void }) {
  if (activeTool !== "filter") return null;
  const object = editor?.canvas.getActiveObject();
  const image = object?.type === "image" ? object as fabric.Image : null;
  return <aside className="studio-photo-panel" aria-label="Ajustar foto">
    <ToolSidebarHeader title="Ajustar foto" description="Luz, cores, enquadramento e efeitos" />
    <div className="studio-photo-scroll">{image && editor ? <PhotoControls image={image} canvas={editor.canvas} /> : <p className="studio-muted">Selecione uma fotografia na arte para ajustar.</p>}</div>
    <button type="button" className="photo-close" onClick={() => onChangeActiveTool("select")}>Concluir ajustes</button>
  </aside>;
}
