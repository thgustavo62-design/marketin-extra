import { ModuleTabs } from "@/components/module-tabs";
export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ModuleTabs
        label="Cadastros"
        tabs={[
          { href: "/gestao/base", label: "Base de informações", exact: true },
          { href: "/gestao/unidades", label: "Unidades", exact: true },
        ]}
      />
      {children}
    </>
  );
}
