import { pool } from "../db";
export async function catalogImportContext(expectedCompanyId = "") {
  const row = (await pool.query<{ company_id: string | null; branch_id: string | null }>(
    "select nova7_private.active_company() as company_id,nova7_private.active_branch() as branch_id",
  )).rows[0];
  if (!row?.company_id) return { error: "Selecione uma empresa antes de importar produtos ou imagens.", status: 400 as const };
  if (expectedCompanyId && expectedCompanyId !== row.company_id)
    return { error: "A empresa ativa mudou. Volte à página de importação e confira o destino antes de continuar.", status: 409 as const };
  return { companyId: row.company_id, branchId: row.branch_id };
}
