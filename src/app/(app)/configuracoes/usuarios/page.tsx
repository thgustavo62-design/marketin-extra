import { ActionForm } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { listUsers } from '@/lib/data'
import { ROLES, roleLabel, type Role } from '@/lib/perms'
import { createUserAction, resetPasswordAction, setActiveAction, setRoleAction } from './actions'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca'

export default async function Usuarios() {
  const me = await requireAdmin()
  const users = await listUsers()
  return (
    <>
      <header className="page-head">
        <h1>Usuários</h1>
        <p>Quem acessa o sistema e com qual perfil. Senhas nunca são exibidas depois de criadas; a provisória aparece uma única vez.</p>
      </header>

      <section aria-labelledby="perfis">
        <h2 id="perfis" className="eyebrow">Perfis de acesso</h2>
        <div className="cards">
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <article key={r} className="card"><span className="pill soft">{ROLES[r].label}</span><p>{ROLES[r].desc}</p></article>
          ))}
        </div>
      </section>

      <section aria-labelledby="lista">
        <h2 id="lista" className="eyebrow">Usuários cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={u.id}>
                    <td><b>{u.display_name}</b><br /><small className="muted">@{u.username}{self && ' · você'}</small></td>
                    <td>
                      <ActionForm action={setRoleAction} submit="Salvar" pending="…" className="row-form">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="role" defaultValue={u.role} aria-label={`Perfil de ${u.username}`} disabled={self}>
                          {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                        </select>
                      </ActionForm>
                    </td>
                    <td>
                      {u.active ? <span className="pill on">Ativo</span> : <span className="pill off">Desativado</span>}
                      {u.must_change_password && <span className="pill warn">Senha provisória</span>}
                    </td>
                    <td>{fmt(u.last_login)}</td>
                    <td>
                      {self ? <small className="muted">Use “Minha conta”.</small> : (
                        <div className="row-actions">
                          <ActionForm action={setActiveAction} submit={u.active ? 'Desativar' : 'Reativar'} pending="…" className="row-form">
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                          </ActionForm>
                          <ActionForm action={resetPasswordAction} submit="Redefinir senha" pending="…" className="row-form">
                            <input type="hidden" name="id" value={u.id} />
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Perfil “{roleLabel('admin')}” precisa existir sempre: o sistema não deixa desativar ou rebaixar o último.</p>
      </section>

      <section id="form" aria-labelledby="novo" className="card narrow-lg">
        <h2 id="novo" className="eyebrow">Novo usuário</h2>
        <ActionForm action={createUserAction} submit="Criar usuário" pending="Criando…">
          <div className="grid-2">
            <div><label htmlFor="display_name">Nome de exibição</label><input id="display_name" name="display_name" type="text" maxLength={60} /></div>
            <div><label htmlFor="username">Usuário (para entrar)</label><input id="username" name="username" type="text" autoCapitalize="none" spellCheck={false} required /></div>
          </div>
          <label htmlFor="role">Perfil</label>
          <select id="role" name="role" defaultValue="editor">
            {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
          </select>
          <label htmlFor="password">Senha provisória (deixe em branco para gerar uma)</label>
          <input id="password" name="password" type="text" autoComplete="off" placeholder="mínimo 10 caracteres, com letras e números" />
        </ActionForm>
      </section>
    </>
  )
}
