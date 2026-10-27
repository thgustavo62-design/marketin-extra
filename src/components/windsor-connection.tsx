import { pool } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { windsorConfigStatus } from "@/lib/windsor-config";
import { WindsorConnectionForm } from "./windsor-connection-form";
export async function WindsorConnection() {
  const user = await requireUser();
  const status = await windsorConfigStatus();
  const canConfigure = (
    await pool.query(
      "select nova7_private.manage_company(nova7_private.active_company()) as allowed",
    )
  ).rows[0].allowed;
  return (
    <section
      className="card"
      aria-label="Conexão Windsor.ai"
      style={{ marginBottom: 20 }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <h2>Insights e Resultados</h2>
          <p className="muted">Instagram e Meta Ads pela Windsor.ai</p>
        </div>
        <span className={`pill ${status.configured ? "on" : "soft"}`}>
          {status.configured ? "Chave configurada" : "Conexão pendente"}
        </span>
      </div>
      {canConfigure ? (
        <details style={{ marginTop: 12 }}>
          <summary>Configurar Windsor.ai</summary>
          <WindsorConnectionForm
            configured={status.configured}
            protectedStorage={status.protectedStorage}
          />
        </details>
      ) : (
        <p className="muted">
          O administrador gerencia a conexão e o vínculo das contas às empresas.
        </p>
      )}
    </section>
  );
}
