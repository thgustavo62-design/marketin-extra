"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/promocoes", label: "Promoções" },
  { href: "/promocoes/importar", label: "Importar e revisar" },
  { href: "/promocoes/modelos", label: "Modelos prontos" },
  { href: "/promocoes/etiquetas", label: "Etiquetas" },
  { href: "/promocoes/regras", label: "Regras inteligentes" },
  { href: "/promocoes/temas", label: "Layouts e modelos" },
  { href: "/promocoes/biblioteca", label: "Elementos gráficos" },
];

/** Sub-abas da área de Promoções. "Promoções" fica ativa na lista e dentro de uma promoção; as outras, na própria página. */
export function PromoTabs() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/promocoes"
      ? ![
          "/promocoes/temas",
          "/promocoes/biblioteca",
          "/promocoes/importar",
          "/promocoes/regras",
          "/promocoes/modelos",
          "/promocoes/etiquetas",
        ].some((p) => path.startsWith(p))
      : path === href || path.startsWith(href + "/");
  return (
    <nav className="stabs" aria-label="Promoções">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`stab${active(t.href) ? " active" : ""}`}
          aria-current={active(t.href) ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
