"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Save, ArrowUpRight } from "lucide-react";
import { parsePrice, type ThemeConfig } from "@/lib/domain/promo";
import { offerEditVersion } from "@/lib/domain/offer-editing";
import type { Campaign, PromoItem } from "@/lib/promo/store";
import { OfferPreview } from "@/components/offer-preview";

type Props = {
  campaign: Campaign;
  theme: ThemeConfig;
  items: PromoItem[];
  canEdit: boolean;
};
export function OfferEditor({
  campaign,
  theme,
  items: initial,
  canEdit,
}: Props) {
  const [items, setItems] = useState(initial),
    [selected, setSelected] = useState(initial[0]?.id ?? ""),
    [query, setQuery] = useState(""),
    [dirty, setDirty] = useState(false);
  const item = items.find((i) => i.id === selected);
  const shown = items
    .filter((i) =>
      `${i.name} ${i.ean ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .slice(0, 100);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const leave = () =>
    !dirty ||
    confirm(
      "Há alterações não salvas nesta oferta. Sair e descartar essas alterações?",
    );
  return (
    <>
      <header className="page-head">
        <Link
          href="/promocoes"
          onClick={(e) => {
            if (!leave()) e.preventDefault();
          }}
        >
          ← Promoções
        </Link>
        <h1>Editar ofertas</h1>
        <p>
          {campaign.name}
          {campaign.brand_name ? ` · ${campaign.brand_name}` : ""} ·{" "}
          {items.length} ofertas
        </p>
      </header>
      <p className="notice info">
        Altere os dados e confira a prévia antes de salvar. Se a arte já tiver
        sido editada no Studio, use “Regenerar página” para aplicar os novos
        dados à composição.
      </p>
      <div className="quick-offer-layout">
        <aside className="quick-offer-list" aria-label="Ofertas da campanha">
          <label className="design-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Buscar oferta"
              value={query}
              placeholder="Produto ou código de barras"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div>
            {shown.map((i) => (
              <button
                type="button"
                key={i.id}
                aria-pressed={selected === i.id}
                onClick={() => {
                  if (i.id !== selected && leave()) {
                    setDirty(false);
                    setSelected(i.id);
                  }
                }}
              >
                {i.photo_id ? (
                  <img
                    src={`/api/produtos/imagem/${i.photo_id}`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="quick-photo-empty">Sem foto</span>
                )}
                <span>
                  <b>{i.name}</b>
                  <small>
                    {i.price.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {!shown.length && <p className="empty">Nenhuma oferta encontrada.</p>}
          {shown.length === 100 && (
            <small>
              Exibindo até 100 ofertas. Use a busca para encontrar as demais.
            </small>
          )}
        </aside>
        {item ? (
          <OfferForm
            key={item.id}
            campaign={campaign}
            item={item}
            theme={theme}
            canEdit={canEdit}
            onDirty={setDirty}
            onSaved={(next) =>
              setItems((all) => all.map((i) => (i.id === next.id ? next : i)))
            }
          />
        ) : (
          <p className="empty">Esta campanha não tem ofertas.</p>
        )}
      </div>
    </>
  );
}
function OfferForm({
  campaign,
  item,
  theme,
  canEdit,
  onDirty,
  onSaved,
}: {
  campaign: Campaign;
  item: PromoItem;
  theme: ThemeConfig;
  canEdit: boolean;
  onDirty: (value: boolean) => void;
  onSaved: (item: PromoItem) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(item.name),
    [note, setNote] = useState(item.note ?? ""),
    [price, setPrice] = useState(item.price.toFixed(2).replace(".", ",")),
    [photoId, setPhotoId] = useState(item.photo_image_id ?? ""),
    [version, setVersion] = useState(offerEditVersion(item)),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const parsed = parsePrice(price);
  const dirty =
    name !== item.name ||
    note !== (item.note ?? "") ||
    parsed !== item.price ||
    photoId !== (item.photo_image_id ?? "");
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const photoChanged = photoId !== (item.photo_image_id ?? "");
  const preview = {
    ...item,
    name,
    note,
    price: parsed ?? item.price,
    photo_id: photoId || item.photos[0] || null,
    photo_image_ids: photoChanged ? [] : item.photo_image_ids,
  };
  async function save(open: boolean) {
    if (!dirty) {
      if (open) router.push(`/studio/${campaign.id}`);
      return;
    }
    if (parsed === null || !name.trim()) {
      setMessage("Confira o nome e o preço antes de salvar.");
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/promocoes/${campaign.id}/ofertas/${item.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            name,
            note,
            price,
            version,
            ...(photoChanged ? { photoId: photoId || null } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.error || "Não foi possível salvar.");
      const saved = JSON.parse(result.version) as [
        string,
        number,
        string | null,
        string | null,
        string[],
      ];
      const next = {
        ...preview,
        name: saved[0],
        price: saved[1],
        note: saved[2],
        photo_image_id: saved[3],
        photo_image_ids: saved[4],
      };
      onSaved(next);
      onDirty(false);
      setVersion(result.version);
      setName(next.name);
      setNote(next.note ?? "");
      setPrice(next.price.toFixed(2).replace(".", ","));
      setPhotoId(next.photo_image_id ?? "");
      setMessage("Oferta salva.");
      if (open) router.push(`/studio/${campaign.id}`);
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "O servidor demorou para responder. Sua edição foi mantida; tente salvar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="quick-offer-workspace"
      aria-label="Edição da oferta selecionada"
    >
      <form
        className="card stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="design-kicker">
          OFERTA {item.position} · {item.ean ?? "SEM CÓDIGO"}
        </div>
        <h2>Produto, preço e apresentação</h2>
        <fieldset disabled={!canEdit || busy}>
          <label htmlFor="offer-name">Descrição do produto</label>
          <textarea
            id="offer-name"
            rows={3}
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label htmlFor="offer-note">Informações complementares</label>
          <input
            id="offer-note"
            maxLength={100}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Volume, quantidade ou apresentação"
          />
          <label htmlFor="offer-price">Preço da oferta (R$)</label>
          <input
            id="offer-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            aria-invalid={parsed === null}
          />
          {parsed === null && (
            <small className="form-error">
              Informe um preço válido, como 29,99.
            </small>
          )}
          <label htmlFor="offer-photo">Fotografia principal</label>
          <select
            id="offer-photo"
            value={photoId}
            onChange={(e) => setPhotoId(e.target.value)}
          >
            <option value="">Foto principal do cadastro</option>
            {item.photos.map((id, i) => (
              <option key={id} value={id}>
                Fotografia {i + 1}
              </option>
            ))}
          </select>
          {!!item.photo_image_ids?.length && (
            <small className="muted">
              A seleção atual de fotos é preservada até você trocar a fotografia
              principal.
            </small>
          )}
          {!item.photos.length && (
            <p className="muted">
              Este produto precisa de uma fotografia no catálogo.
            </p>
          )}
        </fieldset>
        <div className="quick-offer-actions">
          <button
            type="submit"
            className="btn primary-link"
            disabled={!canEdit || busy || !dirty}
          >
            <Save size={16} />
            {busy ? "Salvando…" : "Salvar oferta"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || (dirty && !canEdit)}
            onClick={() => void save(true)}
          >
            {dirty ? "Salvar e abrir Studio" : "Abrir Studio"}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "form-error" : "muted"}
        >
          {message ||
            (dirty
              ? "Alterações ainda não salvas."
              : "Dados conferidos. Nenhuma alteração pendente.")}
        </p>
      </form>
      <OfferPreview
        item={preview}
        theme={theme}
        title={campaign.title}
        validity={campaign.validity}
      />
    </section>
  );
}
