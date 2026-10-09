'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { clientIp, destroySession, getSession } from '@/lib/session'

export async function logoutAction() {
  const user = await getSession()
  await destroySession()
  if (user) await audit('logout', { userId: user.id, ip: await clientIp() })
  redirect('/login')
}
