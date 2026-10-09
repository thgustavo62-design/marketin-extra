// Aparece na hora enquanto a página carrega (sensação de velocidade e nada de tela em branco).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="skeleton-line" style={{ width: 220, height: 28, marginBottom: 10 }} />
      <div className="skeleton-line" style={{ width: 420, maxWidth: '100%', height: 14, marginBottom: 28 }} />
      <div className="mgrid">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="mcard skeleton" />)}
      </div>
    </div>
  )
}
