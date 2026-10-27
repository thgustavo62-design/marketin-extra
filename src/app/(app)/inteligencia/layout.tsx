import { ModuleTabs } from "@/components/module-tabs";
export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ModuleTabs
        label="Resultados"
        tabs={[
          { href: "/resultados", label: "Visão geral", exact: true },
          { href: "/inteligencia", label: "Inteligência" },
          { href: "/resultados/instagram", label: "Instagram" },
          { href: "/resultados/meta-ads", label: "Meta Ads" },
          { href: "/resultados/vinculos", label: "Publicações" },
          { href: "/resultados/metas", label: "Metas" },
          { href: "/resultados/relatorios", label: "Relatórios" },
          { href: "/resultados/apresentacoes", label: "Apresentações" },
        ]}
      />
      {children}
    </>
  );
}
