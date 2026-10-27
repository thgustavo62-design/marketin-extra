'use server'
import { revalidatePath } from 'next/cache'
import { adminOrError, audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { str, type FormState } from '@/lib/form'
import { sealSecret, validWindsorKey } from '@/lib/windsor-secret'
import { getWindsorKey } from '@/lib/windsor-config'
import { windsorQuery } from '@/lib/windsor'

export async function configureWindsor(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await adminOrError()
  if (!guard.ok) return { error: guard.error }
  const op = str(fd, 'operation')
  if (!['save', 'test', 'disconnect'].includes(op)) return { error: 'Operação inválida.' }
  const recent = await pool.query("select count(*)::int as total from audit_events where user_id=$1 and action='windsor_config_attempt' and created_at > now() - interval '15 minutes'", [guard.user.id])
  if (recent.rows[0].total >= 10) return { error: 'Limite de tentativas atingido. Aguarde 15 minutos.' }
  await audit('windsor_config_attempt', { userId: guard.user.id, meta: { operation: op } })
  try {
    if (op === 'save') {
      const key = str(fd, 'api_key')
      if (!validWindsorKey(key)) return { error: 'Informe somente a chave da Windsor.ai, sem espaços ou URL (8 a 512 caracteres).' }
      const encrypted = sealSecret(key)
      await pool.query("insert into integration_credentials(provider, encrypted_secret, enabled, updated_by) values('windsor',$1,true,$2) on conflict(provider) do update set encrypted_secret=excluded.encrypted_secret, enabled=true, updated_by=excluded.updated_by, updated_at=now()", [encrypted, guard.user.id])
    } else if (op === 'disconnect') {
      await pool.query("insert into integration_credentials(provider, enabled, updated_by) values('windsor',false,$1) on conflict(provider) do update set encrypted_secret=null, enabled=false, updated_by=excluded.updated_by, updated_at=now()", [guard.user.id])
    } else {
      const key = await getWindsorKey()
      if (!key) return { error: 'Salve uma chave antes de testar.' }
      const results = await Promise.all(['instagram', 'facebook'].map(c => windsorQuery<{ account_name?: string }>(c as 'instagram' | 'facebook', ['account_name'], 'last_7d', { fresh: true, apiKey: key })))
      const failure = results.find(r => r.status === 'error' || r.status === 'paused')
      if (failure) return { error: failure.status === 'paused' ? 'O Windsor pausou a leitura. Confira o plano e as contas conectadas na Windsor.ai.' : 'O teste não concluiu a leitura. Confira a chave, as permissões e as fontes conectadas na Windsor.ai.' }
      const accounts = new Set(results.flatMap(r => r.status === 'ok' ? r.rows.map(x => x.account_name).filter(Boolean) : []))
      return { ok: accounts.size ? `Conexão confirmada: ${accounts.size} conta(s) encontrada(s). Associe cada conta à empresa em Integrações.` : 'Chave aceita. Nenhuma conta encontrada neste período; conecte suas fontes na Windsor.ai.' }
    }
    await audit('windsor_config_updated', { userId: guard.user.id, meta: { operation: op } })
    revalidatePath('/resultados', 'layout')
    revalidatePath('/configuracoes/integracoes')
    return { ok: op === 'disconnect' ? 'Windsor desconectado neste workspace.' : 'Chave salva com proteção. Use Testar conexão para conferir as contas.' }
  } catch { return { error: 'Não foi possível concluir a configuração. Confira a proteção de credenciais e a migração do banco com o administrador.' } }
}
