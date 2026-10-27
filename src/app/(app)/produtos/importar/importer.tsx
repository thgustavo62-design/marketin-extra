"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PhotoImporter } from "./photo-importer";

export function Importer({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const erpRef = useRef<HTMLInputElement>(null);
  const [erpMsg, setErpMsg] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [erpBusy, setErpBusy] = useState(false);

  async function sendErp() {
    const f = erpRef.current?.files?.[0];
    if (!f) {
      setErpMsg({ kind: "error", text: "Escolha a planilha do ERP." });
      return;
    }
    setErpBusy(true);
    setErpMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.set("company_id", companyId);
      const res = await fetch("/api/produtos/importar-erp", {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErpMsg({
          kind: "error",
          text: j.error ?? "Não foi possível importar.",
        });
        return;
      }
      setErpMsg({
        kind: "ok",
        text: `${j.unique.toLocaleString("pt-BR")} produtos únicos (${j.created.toLocaleString("pt-BR")} novos, ${j.updated.toLocaleString("pt-BR")} atualizados) a partir de ${j.rows.toLocaleString("pt-BR")} linhas. ${j.enriched.toLocaleString("pt-BR")} enriquecidos com a lista da CMED; ${j.withoutEan.toLocaleString("pt-BR")} sem código de barras. ${j.outOfStock.toLocaleString("pt-BR")} sem estoque e ${j.medicines.toLocaleString("pt-BR")} medicamentos deixados de fora (o banco de imagens não inclui medicamentos).`,
      });
      if (erpRef.current) erpRef.current.value = "";
      router.refresh();
    } catch {
      setErpMsg({
        kind: "error",
        text: "Não foi possível alcançar o servidor. Tente novamente.",
      });
    } finally {
      setErpBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <h3>
          <FileSpreadsheet size={16} style={{ verticalAlign: -3 }} /> 1.
          Cadastro de produtos (planilha do ERP)
        </h3>
        <p className="muted">
          Exporte do ERP em Excel (.xlsx) com as colunas{" "}
          <strong>Descrição</strong> e <strong>Barras</strong> (ou Código);
          Grupo, Princípio Ativo e Registro MS são aproveitados quando
          existirem. Entram só produtos com estoque maior que zero. Medicamentos
          de prescrição são ignorados; OTC elegíveis são preservados.
          O cadastro é exclusivo da empresa selecionada. Reenviar atualiza sem duplicar nessa empresa.
          Limite de 4 MB por planilha.
        </p>
        <div className="form-actions">
          <input
            ref={erpRef}
            type="file"
            accept=".xlsx"
            aria-label="Planilha do ERP"
          />
          <button
            type="button"
            className="primary"
            onClick={sendErp}
            disabled={erpBusy}
          >
            {erpBusy ? "Importando…" : "Importar produtos"}
          </button>
        </div>
        {erpMsg && (
          <p
            className={erpMsg.kind === "ok" ? "form-ok" : "form-error"}
            role={erpMsg.kind === "error" ? "alert" : "status"}
          >
            {erpMsg.text}
          </p>
        )}
      </section>

      <PhotoImporter companyId={companyId} companyName={companyName} />
    </>
  );
}
