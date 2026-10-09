'use server'

import { cookies } from 'next/headers'
import { pool } from '@/lib/db'
import { isUuid } from '@/lib/form'
import { brandAllowed } from '@/lib/perms'
import { getSession } from '@/lib/session'
import { SCOPE_COOKIE } from '@/lib/scope'

// Guarda a rede/filial escolhidas. Só aceita rede e filial que existem (nada vindo do cliente é confiado).
export async function setScopeAction(brandSlug: string, branchId: string): Promise<void> {
  const user = await getSession()
  if (!user) return
  const jar = await cookies()
  const brand = brandSlug ? (await pool.query(`select id, slug from brands where slug = $1`, [brandSlug])).rows[0] : null
  let value = ''
  // Quem tem acesso restrito só pode escolher as filiais permitidas.
  if (brand && brandAllowed(user, brand.id)) {
    value = brand.slug
    if (isUuid(branchId)) {
      const ok = await pool.query(`select 1 from branches where id = $1 and brand_id = $2 and active`, [branchId, brand.id])
      if (ok.rowCount) value += `|${branchId}`
    }
  }
  if (value) jar.set(SCOPE_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 90 })
  else jar.delete(SCOPE_COOKIE)
}
