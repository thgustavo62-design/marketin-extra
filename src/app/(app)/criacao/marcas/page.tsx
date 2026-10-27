import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBrands } from "@/lib/data";
import { brandAllowed, canWrite } from "@/lib/perms";
import { BrandKitManager } from "./kit-manager";

export default async function Marcas() {
  const user = await requireUser();
  const brands = (await getBrands()).filter((b) => brandAllowed(user, b.id));
  return (
    <>
      <header className="page-head">
        <h1>Kit de marca</h1>
        <p>
          <Link href="/criacao">← Criar design</Link> · Logos, cores, fontes e
          textos oficiais de cada filial. Organize aqui a identidade de cada
          marca e use seus arquivos e padrões ao criar as artes.
        </p>
      </header>
      {brands.length === 0 ? (
        <p className="empty">Você não tem acesso a nenhuma filial.</p>
      ) : (
        <BrandKitManager
          brands={brands.map((b) => ({ id: b.id, name: b.name }))}
          canEdit={canWrite(user.role)}
        />
      )}
    </>
  );
}
