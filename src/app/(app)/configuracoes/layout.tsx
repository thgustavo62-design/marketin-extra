import { SettingsTabs } from '@/components/settings-tabs'
import { requireUser } from '@/lib/auth'

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowMustChange: true })
  const tabs = [
    { href: '/configuracoes/empresas', label: 'Empresas e acessos' },
    ...(user.isPlatformAdmin
      ? [
          { href: '/configuracoes/proprietarios', label: 'Proprietários' },
          { href: '/configuracoes/usuarios', label: 'Logins e senhas' },
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
