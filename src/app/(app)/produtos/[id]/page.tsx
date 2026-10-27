import Link from "next/link";
import { CommercialForm } from "../commercial-form";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProduct } from "@/lib/catalog/store";
import { isUuid } from "@/lib/form";
import { canWrite } from "@/lib/perms";
import { ImageGallery } from "../image-gallery";
import { ProductForm } from "../product-form";

export default async function Produto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await getProduct(id);
  if (!data) notFound();
  const { product, images, posts } = data;
  const write = canWrite(user.role);
  return (
    <>
      <header className="page-head">
        <h1>{product.description}</h1>
        <p>
          <Link href="/produtos">← Catálogo</Link> ·{" "}
          {product.ean ?? "sem código de barras"}
          {product.tarja ? ` · ${product.tarja}` : ""}
          {product.registro_ms ? ` · Registro MS ${product.registro_ms}` : ""}
        </p>
      </header>
      <ImageGallery
        productId={product.id}
        hasEan={!!product.ean}
        images={images}
        canEdit={write}
      />
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Dados do produto</h3>
        <ProductForm product={product} canEdit={write} />
        {product.aliases.length > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Outras descrições deste produto (usadas para reconhecer imagens):{" "}
            {product.aliases.join(" · ")}
          </p>
        )}
      </section>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Atributos comerciais e variações</h3>
        <p className="muted">
          Dados confirmados do SKU. O importador preserva descrições originais e
          sinaliza diferenças para conferência.
        </p>
        <CommercialForm
          id={id}
          value={product.commercial_attributes ?? {}}
          canEdit={write}
        />
      </section>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Conteúdos que usam este produto</h3>
        {posts.length === 0 ? (
          <p className="muted">
            Nenhum conteúdo vinculado ainda. No editor do conteúdo, use
            &quot;Produtos&quot; para vincular.
          </p>
        ) : (
          <ul className="files">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/planejamento/conteudos/${p.id}`}>{p.title}</Link>
                <span className="muted">
                  {p.post_date.split("-").reverse().join("/")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
