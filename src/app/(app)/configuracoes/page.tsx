import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'

export default async function Settings() {
  await requireUser()
  redirect('/configuracoes/empresas')
}
