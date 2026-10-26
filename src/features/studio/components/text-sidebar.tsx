// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { ActiveTool, Editor } from "@/features/studio/types";
import { ToolSidebarClose } from "@/features/studio/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/studio/components/tool-sidebar-header";

import { cn } from "@/features/studio/utils-css";
import { ScrollArea } from "@/features/studio/ui/scroll-area";
import { Button } from "@/features/studio/ui/button";

interface TextSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const TextSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: TextSidebarProps) => {
  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "text" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Texto"
        description="Adicione texto à sua arte"
      />
      <ScrollArea>
        <div className="p-4 space-y-4 border-b">
          <Button className="w-full" onClick={() => editor?.addText("Texto")}>
            Adicionar caixa de texto
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() =>
              editor?.addText("Título", {
                fontSize: 80,
                fontWeight: 700,
              })
            }
          >
            <span className="text-3xl font-bold">Adicionar título</span>
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() =>
              editor?.addText("Subtítulo", {
                fontSize: 44,
                fontWeight: 600,
              })
            }
          >
            <span className="text-xl font-semibold">Adicionar subtítulo</span>
          </Button>
          <Button
            className="w-full h-16"
            variant="secondary"
            size="lg"
            onClick={() =>
              editor?.addText("Parágrafo", {
                fontSize: 32,
              })
            }
          >
            Parágrafo
          </Button>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
