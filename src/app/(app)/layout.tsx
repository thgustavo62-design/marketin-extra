import { AppShell } from '@/components/app-shell'
import { AlertBell } from '@/components/alert-bell'
import { ScopeBar } from '@/components/scope-bar'
import { getSession } from '@/lib/session'
import { canWrite, roleLabel } from '@/lib/perms'
import { getScope } from '@/lib/scope'
import { redirect } from 'next/navigation'
import { logoutAction } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Aqui só exige sessão; a troca obrigatória de senha é imposta por requireUser() em cada página.
  const user = await getSession()
  if (!user) redirect('/login')
  const scope = await getScope()
  return (
    <AppShell
      user={{ displayName: user.displayName, username: user.username, role: user.role, roleLabel: roleLabel(user.role) }}
      logout={logoutAction}
      readOnly={!canWrite(user.role)}
      topbar={
        user.mustChange ? null : (
          <>
            <ScopeBar brands={scope.brands} branches={scope.branches} brandSlug={scope.brand?.slug ?? ''} branchId={scope.branch?.id ?? ''} restricted={scope.restricted} />
            <AlertBell user={user} />
          </>
        )
      }
    >
      {children}
    </AppShell>
  )
}
