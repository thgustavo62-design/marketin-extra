'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

// Um erro numa tela não derruba o menu nem o resto do sistema: mostra o aviso e deixa tentar de novo.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card narrow" role="alert" style={{ marginTop: 24 }}>
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 17 }}><AlertTriangle size={18} /> Algo deu errado</h2>
      <p className="muted" style={{ margin: '8px 0 14px' }}>
        Não foi possível carregar esta tela. Seus dados estão salvos. Tente de novo; se continuar, avise com o código abaixo.
      </p>
      {error.digest && <p className="muted">Código: <code>{error.digest}</code></p>}
      <button type="button" className="btn" onClick={reset}><RefreshCw size={15} /> Tentar de novo</button>
    </div>
  )
}
