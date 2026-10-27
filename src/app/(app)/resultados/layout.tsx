import { ModuleTabs } from "@/components/module-tabs";
import { WindsorConnection } from "@/components/windsor-connection";
export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <WindsorConnection />
      <ModuleTabs
        label="Resultados"
        tabs={[
          { href: "/inteligencia", label: "Inteligência", exact: true },
          { href: "/resultados", label: "Visão geral", exact: true },
          { href: "/resultados/instagram", label: "Instagram", exact: true },
          { href: "/resultados/meta-ads", label: "Meta Ads", exact: true },
          { href: "/resultados/vinculos", label: "Publicações", exact: true },
          { href: "/resultados/metas", label: "Metas", exact: true },
          { href: "/resultados/relatorios", label: "Relatórios", exact: true },
          {
            href: "/resultados/apresentacoes",
            label: "Apresentações",
            exact: true,
          },
        ]}
      />
      {children}
    </>
  );
}
