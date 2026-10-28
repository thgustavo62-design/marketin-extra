// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { ActiveTool, Editor, fonts } from "@/features/studio/types";
import { ToolSidebarClose } from "@/features/studio/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/studio/components/tool-sidebar-header";

import { cn } from "@/features/studio/utils-css";
import { ScrollArea } from "@/features/studio/ui/scroll-area";
import { Button } from "@/features/studio/ui/button";
import { useState } from "react";
import { PROMO_FONTS } from "@/lib/domain/promo-fonts";

interface FontSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const FontSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: FontSidebarProps) => {
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const value = editor?.getActiveFontFamily();
  const query = search.trim().toLocaleLowerCase("pt-BR");

  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "font" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader title="Fonte" description="Escolha a fonte do texto" />
      <ScrollArea>
        <div className="p-4 space-y-1 border-b">
          <input
            aria-label="Buscar fonte"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fonte…"
            className="w-full mb-3"
          />
          <p className="studio-muted">Fontes do catálogo</p>
          {PROMO_FONTS.filter((f) =>
            f.label.toLocaleLowerCase("pt-BR").includes(query),
          ).map((f) => (
            <Button
              key={f.id}
              variant="secondary"
              className="w-full justify-start"
              disabled={!!busy}
              onClick={async () => {
                if (!editor) return;
                const selected = editor.canvas.getActiveObject();
                setBusy(f.id);
                setError("");
                try {
                  const { loadFonts, loadPromoFonts } = await import(
                    "@/lib/promo/fonts-loader"
                  );
                  if (f.id === "display" || f.id === "text")
                    await loadPromoFonts();
                  else await loadFonts([f.id]);
                  if (selected && editor.canvas.getActiveObject() === selected)
                    editor.changeFontFamily(
                      f.family ?? (f.id === "mono" ? "Courier New" : "Georgia"),
                    );
                } catch {
                  setError("Não foi possível carregar a fonte.");
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === f.id ? "Carregando…" : f.label}
            </Button>
          ))}
          {error && <p role="status">{error}</p>}
          <p className="studio-muted">Fontes do sistema</p>
          {fonts
            .filter((font) => font.toLowerCase().includes(query))
            .map((font) => (
              <Button
                key={font}
                variant="secondary"
                size="lg"
                className={cn(
                  "w-full h-16 justify-start text-left",
                  value === font && "border-2 border-blue-500",
                )}
                style={{
                  fontFamily: font,
                  fontSize: "16px",
                  padding: "8px 16px",
                }}
                onClick={() => editor?.changeFontFamily(font)}
              >
                {font}
              </Button>
            ))}
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
