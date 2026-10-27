"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function ModuleTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; exact?: boolean }[];
}) {
  const path = usePathname();
  return (
    <nav className="module-tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link
          href={t.href}
          key={t.href}
          className={
            path === t.href || (!t.exact && path.startsWith(t.href + "/"))
              ? "active"
              : ""
          }
          aria-current={path === t.href ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
