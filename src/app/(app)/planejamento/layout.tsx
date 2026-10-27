import { requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/module-tabs";
export default async function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <ModuleTabs
        label="Planejamento"
        tabs={[
          {
            href: "/planejamento/calendario",
            label: "Calendário",
            exact: true,
          },
          { href: "/planejamento/conteudos", label: "Conteúdos", exact: true },
          ...(user.role === "viewer"
            ? []
            : [
                {
                  href: "/planejamento/importar-plano",
                  label: "Importar plano (PDF)",
                  exact: true,
                },
              ]),
        ]}
      />
      {children}
    </>
  );
}
