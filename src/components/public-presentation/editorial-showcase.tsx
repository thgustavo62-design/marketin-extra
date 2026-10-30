const pieces = [
  { image: 'minas-ofertas.webp', brand: 'MINAS FARMA', kind: 'Fotografia original', title: 'A oferta faz parte do lugar.', text: 'Produtos, etiquetas e comunicação no ponto de venda. Um registro do acervo, com a identidade presente na rotina da loja.', alt: 'Produtos e etiquetas promocionais fotografados dentro da Minas Farma', className: 'store', width: 1000, height: 1333 },
  { image: 'farma-club-peca.webp', brand: 'FARMA CLUB / FARMA E FARMA', kind: 'Peça do acervo', title: 'A marca também orienta.', text: 'Uma peça de comunicação do Farma Club sobre a confirmação de resgate. Identidade aplicada a uma mensagem concreta.', alt: 'Peça do acervo Farma Club com instruções de confirmação do resgate de produtos', className: 'campaign', width: 1000, height: 1319 },
];
export function EditorialShowcase() {
  return <section className="p-collection p-section p-wrap" id="colecao" aria-labelledby="collection-title">
    <div className="p-collection-intro"><p className="p-eyebrow">ACERVO SELECIONADO / FOTOGRAFIA + COMUNICAÇÃO</p><h2 id="collection-title">O varejo tem rosto.<br /><em>E tem identidade.</em></h2><p>Um negócio de verdade tem produtos, rotina e um jeito próprio de se comunicar. É desse contexto que a criação precisa partir.</p></div>
    <div className="p-real-grid">{pieces.map((piece, index) => <figure key={piece.image} className={'p-real-piece p-real-' + piece.className}>
      <div className="p-real-image"><img src={'/presentation/real/' + piece.image} width={piece.width} height={piece.height} alt={piece.alt} loading="lazy" /><span>{piece.kind}</span></div>
      <figcaption><div className="p-real-piece-index"><span>0{index + 1} / {piece.brand}</span><span aria-hidden="true">↗</span></div><h3>{piece.title}</h3><p>{piece.text}</p></figcaption>
    </figure>)}</div>
    <div className="p-real-detail"><img src="/presentation/real/minas-cuidados.webp" alt="Produtos de cuidados pessoais e etiquetas fotografados na loja Minas Farma" width="900" height="1200" loading="lazy" /><div><p className="p-eyebrow">A FOTOGRAFIA É REAL. O CONTEXTO TAMBÉM.</p><h3>O produto muda.<br />O seu jeito de<br /><em>apresentar fica.</em></h3><p>A Encartiva conecta a identidade da empresa aos modelos de campanha. Você organiza produtos, revisa as informações e prepara as próximas ofertas.</p><a href="#como-funciona">Conheça o processo <span aria-hidden="true">↗</span></a></div></div>
    <p className="p-caption">Fotografias originais e peça do acervo de comunicação, apresentadas como portfólio. Preços, produtos e condições retratados são registros históricos, sem validade comercial nesta apresentação.</p>
  </section>;
}

