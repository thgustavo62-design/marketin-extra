import { KeyRound, UserCheck, UserX } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { getBrands, listUsers } from '@/lib/data'
import { ROLES, roleLabel, type Role } from '@/lib/perms'
import { resetPasswordAction, setActiveAction } from './actions'
import { RoleSelect } from './role-select'
import { UserDialog } from './user-dialog'
import Link from 'next/link'
import { pool } from '@/lib/db'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca'

export default async function Usuarios() {
  const me = await requireAdmin()
  const [users, brands, scopes] = await Promise.all([listUsers(), getBrands(), pool.query(`
    select m.user_id,c.id as company_id,c.name as company_name,b.name as branch_name,m.role
    from employee_memberships m join companies c on c.id=m.company_id left join branches b on b.id=m.branch_id where m.active
    union all
    select l.user_id,c.id,c.name,null,'owner' from owner_user_links l join companies c on c.owner_id=l.owner_id where l.active
  `)])
  const access = new Map<string, { company_id: string; company_name: string; branch_name: string | null; role: string }[]>()
  for (const scope of scopes.rows) access.set(scope.user_id, [...(access.get(scope.user_id) ?? []), scope])

  return (
    <>
      <section className="dcard panel-card" aria-labelledby="conta">
        <h2 id="conta">Conta do Usuário</h2>
        <p className="sub">Informações da conta logada</p>
        <div className="account-row">
          <div className="avatar lg" aria-hidden>{me.displayName.charAt(0).toUpperCase()}</div>
          <div className="account-info">
            <b>{me.displayName}</b>
            <small>{me.email ?? `@${me.username}`}</small>
          </div>
          <span className="role-badge">{roleLabel(me.role)}</span>
        </div>
      </section>

      <section className="dcard panel-card" aria-labelledby="lista">
        <div className="card-head">
          <div>
            <h2 id="lista">Logins e senhas</h2>
            <p className="sub">Cada pessoa entra com a própria conta — a trilha de auditoria registra quem fez o quê.</p>
          </div>
          <div className="row-actions"><Link className="cyan-btn" href="/configuracoes/empresas">Criar funcionário ou gerente</Link><UserDialog brands={brands} /></div>
        </div>

        <div className="role-legend">
          {(Object.keys(ROLES) as Role[]).map((r) => <span key={r}><b>{ROLES[r].label}:</b> {ROLES[r].desc}</span>)}
        </div>

        <div className="dark-table users-table">
          <table>
            <thead>
              <tr><th>Nome e login</th><th>E-mail</th><th>Papel</th><th>Empresas e filiais autorizadas</th><th>Situação</th><th>Último acesso</th><th className="right">Ações</th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={u.id}>
                    <td><b>{u.display_name}</b><br /><small className="muted">@{u.username}{self && ' · você'}</small></td>
                    <td>{u.email ?? '—'}</td>
                    <td>{u.role === 'admin' ? <RoleSelect id={u.id} role={u.role} disabled={self} /> : roleLabel(u.role)}</td>
                    <td>{u.role === 'admin' ? 'Administração da plataforma' : (access.get(u.id) ?? []).map((scope, index) => <div key={`${scope.company_id}-${index}`}><Link href={`/configuracoes/empresas/${scope.company_id}`}>{scope.company_name}</Link> · {scope.branch_name || 'Todas as filiais da empresa'} · {roleLabel(scope.role)}</div>)}{u.role !== 'admin' && !access.has(u.id) && 'Sem vínculo ativo'}</td>
                    <td>
                      {u.active ? <span className="st on">Ativo</span> : <span className="st off">Inativo</span>}
                      {u.must_change_password && <span className="st warn">Senha provisória</span>}
                    </td>
                    <td>{fmt(u.last_login)}</td>
                    <td className="right">
                      <div className="row-actions end">
                        <UserDialog brands={brands} user={u} />
                        {!self && (
                          <>
                            <ActionForm action={resetPasswordAction} submit={<><KeyRound size={13} /> Redefinir senha</>} pending="…" className="row-form">
                              <input type="hidden" name="id" value={u.id} />
                            </ActionForm>
                            <ActionForm action={setActiveAction} submit={u.active ? <><UserX size={13} /> Desativar</> : <><UserCheck size={13} /> Ativar</>} pending="…" className="row-form">
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                            </ActionForm>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>O sistema não deixa desativar nem rebaixar o último administrador ativo.</p>
      </section>
    </>
  )
}
