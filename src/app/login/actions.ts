'use server'

import { redirect } from 'next/navigation'
import { checkCredentials } from '@/lib/auth'
import { clientIp, createSession } from '@/lib/session'

export type LoginState = { error?: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '') // preservada exatamente como digitada
  if (!username.trim() || !password) return { error: 'Usuário ou senha inválidos.' }

  const result = await checkCredentials(username, password, await clientIp())
  if (!result.ok) {
    return {
      error:
        result.reason === 'rate_limited'
          ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
          : 'Usuário ou senha inválidos.',
    }
  }
  await createSession(result.userId)
  redirect('/')
}
