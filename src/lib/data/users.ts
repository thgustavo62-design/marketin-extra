import { pool } from '../db'

export type UserRow = {
  id: string; username: string; display_name: string; email: string | null; role: string; active: boolean
  must_change_password: boolean; brand_ids: string[] | null; created_at: string; last_login: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  return (await pool.query(
    `select u.id, u.username, coalesce(u.display_name, u.username) as display_name, u.email, u.role, u.active, u.must_change_password,
            u.brand_ids, u.created_at::text as created_at,
            (select max(s.created_at)::text from sessions s where s.user_id = u.id) as last_login
       from users u order by u.active desc, u.created_at`,
  )).rows
}
