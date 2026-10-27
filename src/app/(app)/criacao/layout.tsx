import { ModuleTabs } from "@/components/module-tabs";
export default function DesignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="design-space">
      <div className="design-space-brand">
        <span className="design-space-icon">N7</span>
        <div>
          <b>Design</b>
          <small>Crie. Personalize. Publique.</small>
        </div>
      </div>
      <ModuleTabs
        label="Design"
        tabs={[
          { href: "/criacao", label: "Criar design", exact: true },
          { href: "/criacao/projetos", label: "Meus designs" },
          { href: "/criacao/modelos", label: "Modelos" },
          { href: "/criacao/marcas", label: "Kit de marca" },
          { href: "/criacao/ia", label: "Imagens e IA" },
        ]}
      />
      {children}
    </div>
  );
}
