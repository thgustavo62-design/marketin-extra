import { SettingsTabs } from '@/components/settings-tabs'
import { requireUser } from '@/lib/auth'

// Configurações: um painel escuro com abas, como no sistema do Grupo Extra. Quem não é administrador só vê "Minha conta".
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowMustChange: true })
  const tabs = [
    ...(user.role === 'admin'
      ? [
          { href: '/configuracoes/usuarios', label: 'Usuários' },
          { href: '/configuracoes/fluxo', label: 'Fluxo de aprovação' },
          { href: '/configuracoes/integracoes', label: 'Integrações' },
          { href: '/configuracoes/auditoria', label: 'Auditoria' },
        ]
      : []),
    { href: '/configuracoes/conta', label: 'Minha conta' },
  ]
  return (
    <div className="dark-surface settings">
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  )
}
