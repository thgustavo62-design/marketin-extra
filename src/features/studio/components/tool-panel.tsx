"use client";
import dynamic from "next/dynamic";
import type { ActiveTool, Editor } from "../types";

const loading = () => (
  <aside
    className="studio-panel"
    aria-label="Carregando ferramenta"
    aria-busy="true"
  >
    <p style={{ padding: 18 }} role="status">
      Abrindo ferramenta…
    </p>
  </aside>
);
const Shape = dynamic(
  () => import("./shape-sidebar").then((m) => m.ShapeSidebar),
  { loading },
);
const Fill = dynamic(
  () => import("./fill-color-sidebar").then((m) => m.FillColorSidebar),
  { loading },
);
const StrokeColor = dynamic(
  () => import("./stroke-color-sidebar").then((m) => m.StrokeColorSidebar),
  { loading },
);
const StrokeWidth = dynamic(
  () => import("./stroke-width-sidebar").then((m) => m.StrokeWidthSidebar),
  { loading },
);
const Opacity = dynamic(
  () => import("./opacity-sidebar").then((m) => m.OpacitySidebar),
  { loading },
);
const Text = dynamic(
  () => import("./text-sidebar").then((m) => m.TextSidebar),
  { loading },
);
const Font = dynamic(
  () => import("./font-sidebar").then((m) => m.FontSidebar),
  { loading },
);
const Filter = dynamic(
  () => import("./filter-sidebar").then((m) => m.FilterSidebar),
  { loading },
);
const Draw = dynamic(
  () => import("./draw-sidebar").then((m) => m.DrawSidebar),
  { loading },
);
const Settings = dynamic(
  () => import("./settings-sidebar").then((m) => m.SettingsSidebar),
  { loading },
);
const Styles = dynamic(
  () => import("./styles-sidebar").then((m) => m.StylesSidebar),
  { loading },
);

const Position = dynamic(
  () => import("./position-sidebar").then((m) => m.PositionSidebar),
  { loading },
);

export function ToolPanel(props: {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
  companyId?: string | null;
  companyName?: string | null;
  campaignId: string;
}) {
  const { activeTool, companyId, companyName, campaignId, ...rest } = props;
  const common = { ...rest, activeTool };
  switch (activeTool) {
    case "position":
      return (
        <Position
          editor={props.editor}
          onClose={() => props.onChangeActiveTool("select")}
        />
      );
    case "shapes":
      return <Shape {...common} />;
    case "fill":
      return <Fill {...common} />;
    case "stroke-color":
      return <StrokeColor {...common} />;
    case "stroke-width":
      return <StrokeWidth {...common} />;
    case "opacity":
      return <Opacity {...common} />;
    case "text":
      return <Text {...common} />;
    case "font":
      return <Font {...common} />;
    case "filter":
      return <Filter {...common} />;
    case "draw":
      return <Draw {...common} />;
    case "settings":
      return <Settings {...common} />;
    case "styles":
      return (
        <Styles
          editor={props.editor}
          companyId={companyId}
          companyName={companyName}
          campaignId={campaignId}
          onClose={() => props.onChangeActiveTool("select")}
        />
      );
    default:
      return null;
  }
}
