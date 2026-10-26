// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import {
  Triangle as IoTriangle,
  Diamond as FaDiamond,
  Circle as FaCircle,
  RectangleHorizontal as FaSquare,
  Square as FaSquareFull,
} from "lucide-react";

import { ActiveTool, Editor } from "@/features/studio/types";
import { ShapeTool } from "@/features/studio/components/shape-tool";
import { ToolSidebarClose } from "@/features/studio/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/studio/components/tool-sidebar-header";

import { cn } from "@/features/studio/utils-css";
import { ScrollArea } from "@/features/studio/ui/scroll-area";

interface ShapeSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const ShapeSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: ShapeSidebarProps) => {
  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "shapes" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Elementos"
        description="Add shapes to your canvas"
      />
      <ScrollArea>
        <div className="grid grid-cols-3 gap-4 p-4">
          <ShapeTool onClick={() => editor?.addCircle()} icon={FaCircle} />
          <ShapeTool
            onClick={() => editor?.addSoftRectangle()}
            icon={FaSquare}
          />
          <ShapeTool
            onClick={() => editor?.addRectangle()}
            icon={FaSquareFull}
          />
          <ShapeTool onClick={() => editor?.addTriangle()} icon={IoTriangle} />
          <ShapeTool
            onClick={() => editor?.addInverseTriangle()}
            icon={IoTriangle}
            iconClassName="rotate-180"
          />
          <ShapeTool onClick={() => editor?.addDiamond()} icon={FaDiamond} />
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
