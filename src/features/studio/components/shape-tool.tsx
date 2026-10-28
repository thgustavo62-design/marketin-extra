// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import type { LucideIcon } from "lucide-react";

import { cn } from "@/features/studio/utils-css";

interface ShapeToolProps {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  iconClassName?: string;
}

export const ShapeTool = ({
  onClick,
  label,
  icon: Icon,
  iconClassName,
}: ShapeToolProps) => {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="aspect-square border rounded-md p-5"
    >
      <Icon className={cn("h-full w-full", iconClassName)} />
    </button>
  );
};
