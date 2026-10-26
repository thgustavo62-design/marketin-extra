// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
interface ToolSidebarHeaderProps {
  title: string;
  description?: string;
}

export const ToolSidebarHeader = ({
  title,
  description,
}: ToolSidebarHeaderProps) => {
  return (
    <div className="p-4 border-b space-y-1 h-[68px]">
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
};
