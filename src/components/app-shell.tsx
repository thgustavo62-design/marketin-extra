"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Columns3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FolderOpen,
  PackageSearch,
  PenTool,
  Sparkles,
  LogOut,
  Megaphone,
  Menu,
  Radar,
  Settings,
  ChevronDown,
  X,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  admin?: boolean;
  /** só aparece para quem pode editar */ write?: boolean;
};
type Group = { title: string; collapsible?: boolean; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Seu espaço",
    items: [{ href: "/", label: "Início", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Criar e comunicar",
    items: [
      { href: "/criacao", label: "Design", icon: PenTool },
      { href: "/promocoes", label: "Promoções automáticas", icon: Sparkles },
      { href: "/produtos", label: "Produtos", icon: PackageSearch },
      { href: "/resultados", label: "Resultados", icon: BarChart3 },
    ],
  },
  {
    title: "Organizar",
    collapsible: true,
    items: [
      {
        href: "/planejamento/calendario",
        label: "Planejamento",
        icon: CalendarDays,
      },
      { href: "/campanhas", label: "Campanhas", icon: Megaphone },
      { href: "/producao", label: "Produção", icon: Columns3 },
      {
        href: "/producao/biblioteca",
        label: "Biblioteca de mídias",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Empresas e acesso",
    collapsible: true,
    items: [
      {
        href: "/configuracoes/proprietarios",
        label: "Proprietários",
        icon: BookOpen,
        admin: true,
      },
      { href: "/configuracoes/empresas", label: "Minhas Empresas", icon: BookOpen },
      { href: "/criacao/marcas", label: "Kit de marca", icon: PenTool },
      { href: "/gestao", label: "Cadastros", icon: BookOpen },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const STORE_KEY = "nova7_sidebar_collapsed";

export function AppShell({
  user,
  logout,
  topbar,
  readOnly,
  children,
}: {
  user: {
    displayName: string;
    username: string;
    role: string;
    roleLabel: string;
    isPlatformAdmin?: boolean;
  };
  logout: () => Promise<void>;
  topbar: React.ReactNode;
  readOnly: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORE_KEY) === "1");
    } catch {
      /* sem storage: segue expandido */
    }
  }, []);
  useEffect(() => setOpen(false), [path]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORE_KEY, c ? "0" : "1");
      } catch {
        /* ignora */
      }
      return !c;
    });
  };
  const isActive = (i: Item) => {
    if (i.href === "/criacao" && path.startsWith("/criacao/marcas"))
      return false;
    if (i.href === "/resultados" && path.startsWith("/inteligencia"))
      return true;
    if (i.href === "/planejamento/calendario")
      return path.startsWith("/planejamento");
    if (i.href === "/producao" && path.startsWith("/producao/biblioteca"))
      return false;
    return i.exact
      ? path === i.href
      : path === i.href || path.startsWith(i.href + "/");
  };

  return (
    <div
      className={`shell${collapsed ? " collapsed" : ""}${open ? " open" : ""}`}
    >
      <aside id="main-navigation" className="sidebar" aria-label="Menu lateral">
        <div className="side-head">
          {open && (
            <button
              type="button"
              className="side-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
          )}
          <div className="side-logo">
            <img src="/brand/encartiva/simbolo.png" alt="" />
          </div>
          <div className="side-title">
            <img
              className="side-wordmark"
              src="/brand/encartiva/branca.png"
              alt="Encartiva"
              width="154"
              height="51"
            />
            <small>Promoções inteligentes</small>
          </div>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {GROUPS.map((g) => {
            const items = g.items.filter(
              (i) =>
                (!i.admin || user.isPlatformAdmin) &&
                !(i.write && user.role === "viewer"),
            );
            if (!items.length) return null;
            const expanded =
              collapsed ||
              !g.collapsible ||
              (sections[g.title] ?? items.some(isActive));
            return (
              <div key={g.title}>
                {g.collapsible ? (
                  <button
                    type="button"
                    className="nav-group nav-group-toggle"
                    aria-expanded={expanded}
                    aria-controls={`nav-${g.title.replace(/\s/g, "-")}`}
                    onClick={() =>
                      setSections((s) => ({ ...s, [g.title]: !expanded }))
                    }
                  >
                    {g.title}
                    <ChevronDown
                      size={13}
                      style={{
                        transform: expanded ? "rotate(180deg)" : undefined,
                      }}
                    />
                  </button>
                ) : (
                  <div className="nav-group">{g.title}</div>
                )}
                <div
                  id={`nav-${g.title.replace(/\s/g, "-")}`}
                  hidden={!expanded}
                >
                  {items.map((i) => {
                    const Icon = i.icon;
                    const active = isActive(i);
                    return (
                      <Link
                        key={i.href}
                        href={
                          i.href === "/configuracoes"
                            ? user.role === "admin"
                              ? "/configuracoes/usuarios"
                              : "/configuracoes/conta"
                            : i.href === "/gestao"
                              ? "/gestao/base"
                              : i.href
                        }
                        className={`nav-item${active ? " active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        title={i.label}
                      >
                        <Icon size={18} aria-hidden />
                        <span>{i.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="user-card">
          <div className="avatar" aria-hidden>
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <b>{user.displayName}</b>
            <small>{user.roleLabel}</small>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="ghost"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>

        <button
          type="button"
          className="collapse-btn"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            type="button"
            className="btn menu-btn"
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen((o) => !o)}
            aria-label="Abrir menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="workspace-label">
            ENCARTIVA <span>Workspace</span>
          </span>
          <span className="spacer" />
          {topbar}
        </div>
        <main className="content" data-readonly={readOnly ? "true" : undefined}>
          {children}
        </main>
      </div>
    </div>
  );
}
