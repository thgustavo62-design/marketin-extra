'use client';
import { useState } from 'react';
export function CopyPresentationLink({ url }: { url: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado.'); }
    catch { setMessage('Selecione o endereço abaixo e copie com o comando do seu navegador.'); }
  }
  return <div className="stack-form" style={{ maxWidth: 900 }}>
    <label htmlFor="presentation-link">Link público<input id="presentation-link" value={url} readOnly onFocus={(event) => event.target.select()} /></label>
    <button className="primary" type="button" onClick={copy}>Copiar link</button>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
