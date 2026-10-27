import { ModuleTabs } from "@/components/module-tabs";
export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ModuleTabs
        label="Produção"
        tabs={[
          { href: "/producao", label: "Quadro de produção", exact: true },
          { href: "/producao/aprovacoes", label: "Aprovações", exact: true },
          {
            href: "/producao/biblioteca",
            label: "Biblioteca de mídias",
            exact: true,
          },
        ]}
      />
      {children}
    </>
  );
}
