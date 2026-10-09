import { requireAdmin } from '@/lib/auth'
import { pool } from '@/lib/db'

const LABELS: Record<string, string> = {
  login_ok: 'Login', login_falhou: 'Login falhou', login_bloqueado: 'Login bloqueado (muitas tentativas)', logout: 'Saiu',
  troca_senha_ok: 'Trocou a senha', troca_senha_falhou: 'Troca de senha recusada',
  usuario_criado: 'Criou usuário', usuario_perfil: 'Mudou perfil', usuario_desativado: 'Desativou usuário', usuario_reativado: 'Reativou usuário',
  usuario_senha_redefinida: 'Redefiniu senha de usuário', conteudo_criado: 'Criou conteúdo', conteudo_editado: 'Editou conteúdo',
  conteudo_excluido: 'Excluiu conteúdo', campanha_criada: 'Criou campanha', campanha_editada: 'Editou campanha', campanha_excluida: 'Excluiu campanha',
  base_criada: 'Criou informação', base_editada: 'Editou informação', base_confirmada: 'Confirmou informação', base_excluida: 'Excluiu informação',
  unidade_criada: 'Criou unidade', unidade_editada: 'Editou unidade', unidade_ativacao: 'Ativou/desativou unidade', semana_gerada: 'Gerou semana',
  metricas_registradas: 'Registrou métricas', integracao_mapeada: 'Associou conta a filial', integracao_removida: 'Removeu associação de conta',
}

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const q = sp.q?.trim()
  const { rows } = await pool.query(
    `select e.id, e.action, e.target, e.ip, e.created_at::text as created_at, u.username
       from audit_events e left join users u on u.id = e.user_id
      ${q ? `where e.action ilike $1 or e.target ilike $1 or u.username ilike $1` : ''}
      order by e.created_at desc limit 200`,
    q ? [`%${q.replace(/[%_\\]/g, '\\$&')}%`] : [],
  )
  return (
    <>
      <header className="page-head">
        <h1>Auditoria</h1>
        <p>Os últimos 200 eventos. Senhas e tokens nunca são registrados.</p>
      </header>
      <form className="filters" method="get">
        <input type="search" name="q" placeholder="Filtrar por ação, usuário ou alvo" defaultValue={sp.q ?? ''} aria-label="Filtrar" />
        <button type="submit" className="secondary">Filtrar</button>
      </form>
      {rows.length === 0 ? <p className="empty">Nenhum evento.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Alvo</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' })}</td>
                  <td>{r.username ?? '—'}</td>
                  <td>{LABELS[r.action] ?? r.action}</td>
                  <td className="muted">{r.target ?? ''}</td>
                  <td className="muted">{r.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
