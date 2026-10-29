'use client'

import { Pencil, UserPlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { createUserAction, updateUserAction } from './actions'

type Brand = { id: string; name: string }
type UserLite = { id: string; username: string; display_name: string; email: string | null; role: string; brand_ids: string[] | null }

// Janela de "Novo usuário" / "Editar" (mesmo formulário). Fica aberta após criar, para dar tempo de copiar a senha provisória.
export function UserDialog({ brands, user }: { brands: Brand[]; user?: UserLite }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [role, setRole] = useState<string>(user?.role ?? 'admin')
  const editing = Boolean(user)

  return (
    <>
      <button type="button" className={editing ? 'mini-btn' : 'cyan-btn'} onClick={() => ref.current?.showModal()}>
        {editing ? <><Pencil size={13} /> Editar</> : <><UserPlus size={15} /> Novo administrador</>}
      </button>
      <dialog ref={ref} className="modal" onClick={(e) => { if (e.target === ref.current) ref.current?.close() }}>
        <div className="modal-head">
          <h3>{editing ? `Editar ${user!.display_name}` : 'Novo administrador da plataforma'}</h3>
          <button type="button" className="ghost" aria-label="Fechar" onClick={() => ref.current?.close()}><X size={18} /></button>
        </div>
        <ActionForm action={editing ? updateUserAction : createUserAction} submit={editing ? 'Salvar alterações' : 'Criar usuário'} pending="Salvando…">
          {editing && <input type="hidden" name="id" value={user!.id} />}
          <div className="grid-2">
            <div><label htmlFor={`dn-${user?.id ?? 'new'}`}>Nome</label><input id={`dn-${user?.id ?? 'new'}`} name="display_name" type="text" maxLength={60} defaultValue={user?.display_name} required={editing} /></div>
            <div>
              <label htmlFor={`un-${user?.id ?? 'new'}`}>Usuário (para entrar)</label>
              <input id={`un-${user?.id ?? 'new'}`} name="username" type="text" autoCapitalize="none" spellCheck={false} defaultValue={user?.username} readOnly={editing} required={!editing} />
            </div>
          </div>
          <label htmlFor={`em-${user?.id ?? 'new'}`}>E-mail (opcional)</label>
          <input id={`em-${user?.id ?? 'new'}`} name="email" type="email" maxLength={120} defaultValue={user?.email ?? ''} />
          {!editing && (
            <>
              <label htmlFor="role-new">Papel</label>
              <select id="role-new" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Administrador da plataforma</option>
              </select>
            </>
          )}
          {editing && user!.role !== 'admin' && <p className="muted">As empresas, filiais e permissões são administradas em Empresas e acessos.</p>}
          {!editing && (
            <>
              <label htmlFor="pw-new">Senha provisória (deixe em branco para gerar uma)</label>
              <input id="pw-new" name="password" type="password" autoComplete="new-password" placeholder="mínimo 10 caracteres, com letras e números" />
            </>
          )}
        </ActionForm>
      </dialog>
    </>
  )
}
