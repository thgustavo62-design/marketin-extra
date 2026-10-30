const collections = [
  { name: 'Cuidado que aparece.', segment: 'FARMÁCIAS', className: 'care', headline: <>BEM<br />CUIDADO.<br /><i>BEM SEU.</i></>, detail: 'Campanhas de beleza, higiene e bem-estar com a personalidade da sua farmácia.' },
  { name: 'Presença na rotina.', segment: 'SUPERMERCADOS', className: 'market', headline: <>A SEMANA<br />COMEÇA<br /><i>AQUI.</i></>, detail: 'Ofertas da semana, hortifruti e datas comerciais com uma identidade consistente.' },
];

export function EditorialShowcase() {
  return <section className="p-collection p-section p-wrap" id="colecao" aria-labelledby="collection-title">
    <div className="p-collection-intro"><p className="p-eyebrow">A MESMA PLATAFORMA. OUTRAS PERSONALIDADES.</p><h2 id="collection-title">Parece com<br /><em>a sua marca.</em><br />Porque é para ser.</h2><p>Antes de automatizar, damos forma à sua comunicação. Cores, etiquetas e composições que fazem sentido para o seu negócio.</p></div>
    <div className="p-collection-grid">{collections.map((item, index) => <figure key={item.className} className={'p-collection-item p-collection-' + item.className}>
      <div className="p-editorial-poster"><header><span>ESTUDO VISUAL / 0{index + 1}</span><span>ENCARTIVA ↗</span></header><strong>{item.headline}</strong><div className="p-poster-object" aria-hidden="true">{index === 0 ? <><div className="p-bottle-cap" /><div className="p-bottle"><span>cuidado<br /><b>diário.</b></span></div><div className="p-soap">ESSENCIAL<br /><b>PARA VOCÊ.</b></div></> : <><div className="p-orange p-orange-one" /><div className="p-orange p-orange-two" /><div className="p-market-sticker">BONS<br /><b>ENCONTROS.</b><span>NA SUA CESTA.</span></div></>}</div><footer><span>{item.segment}</span><span>SUA MARCA TEM LUGAR AQUI.</span></footer></div>
      <figcaption><div><span>0{index + 1} / {item.segment}</span><h3>{item.name}</h3></div><span aria-hidden="true">↗</span><p>{item.detail}</p></figcaption>
    </figure>)}</div>
    <p className="p-caption">Estudos gráficos ilustrativos da Encartiva. A identidade de cada empresa é definida na implantação.</p>
  </section>;
}
