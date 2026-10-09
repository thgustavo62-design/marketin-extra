import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { WindsorResult } from '@/lib/windsor'

// Mostra o motivo de não haver números. Retorna null quando a consulta deu certo.
export function WindsorNotice({ result }: { result: WindsorResult<never> | { status: 'ok' } }) {
  if (result.status === 'ok') return null
  let text: React.ReactNode
  switch (result.status) {
    case 'not_configured':
      text = 'A chave do Windsor não está configurada no servidor (WINDSOR_API_KEY).'
      break
    case 'no_accounts':
      text = 'Nenhuma conta deste tipo está conectada ao Windsor ainda.'
      break
    case 'paused':
      text = <>O Windsor pausou as leituras e devolveu um aviso no lugar dos dados: <i>{result.message}</i>. Por isso nenhum número é exibido.</>
      break
    default:
      text = <>Não foi possível consultar o Windsor agora{result.status === 'error' && result.message ? ` (${result.message})` : ''}. Tente de novo em instantes.</>
  }
  return (
    <div className="notice" role="alert">
      <AlertTriangle size={18} />
      <span>{text} <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Ver integrações</Link></span>
    </div>
  )
}
