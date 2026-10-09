import { pool } from '../db'

export type IntegrationAccount = {
  id: string; kind: 'instagram' | 'ads'; account_name: string
  brand_id: string | null; brand_name: string | null; branch_id: string | null; branch_name: string | null
}

export async function getIntegrationAccounts(): Promise<IntegrationAccount[]> {
  return (await pool.query(
    `select a.id, a.kind, a.account_name, a.brand_id, b.name as brand_name, a.branch_id, br.name as branch_name
       from integration_accounts a
       left join brands b on b.id = a.brand_id
       left join branches br on br.id = a.branch_id
      order by a.kind, a.account_name`,
  )).rows
}
