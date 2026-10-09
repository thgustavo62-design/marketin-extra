import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Página não encontrada</h1>
        <p className="muted" style={{ marginBottom: 16 }}>O endereço não existe ou o conteúdo foi removido.</p>
        <Link href="/" className="btn primary-link">Voltar ao Dashboard</Link>
      </div>
    </main>
  )
}
