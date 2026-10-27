import { cloneElement, isValidElement, type ReactNode } from "react";
export function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
  side?: string;
  sideOffset?: number;
}) {
  return isValidElement<Record<string, unknown>>(children) ? (
    cloneElement(children, {
      "aria-label": children.props["aria-label"] ?? label,
      title: label,
    })
  ) : (
    <span title={label}>{children}</span>
  );
}
