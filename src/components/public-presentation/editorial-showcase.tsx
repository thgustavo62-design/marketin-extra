import { CampaignSeal, type SealKind } from './campaign-seal';
const seals: { kind: SealKind; title: string; text: string }[] = [
  { kind: 'week', title: 'Ofertas da semana', text: 'Letra forte, faixa de contraste e leitura direta.' },
  { kind: 'sale', title: 'Mega Saldão', text: 'Composição inclinada para campanhas de impacto.' },
  { kind: 'black', title: 'Black Friday', text: 'Preto e lima com o preço no centro da atenção.' },
  { kind: 'beauty', title: 'Beleza em oferta', text: 'Selo oval e tons de perfumaria e autocuidado.' },
  { kind: 'fresh', title: 'Hora do Horti', text: 'Verde, recortes orgânicos e acento de cor quente.' },
  { kind: 'baby', title: 'Mundo Bebê', text: 'Contornos suaves e uma assinatura de campanha própria.' },
];
export function EditorialShowcase() {
  return <section className="p-collection p-section p-wrap" id="colecao" aria-labelledby="collection-title">
    <div className="p-collection-intro"><p className="p-eyebrow">SELOS + ETIQUETAS + COMPOSIÇÃO</p><h2 id="collection-title">A campanha tem<br /><em>uma assinatura.</em></h2><p>O nome da campanha ganha forma. O preço ganha hierarquia. E cada oferta continua falando a linguagem da sua marca.</p></div>
    <div className="p-seal-gallery">{seals.map((seal, i) => <article className={'p-seal-card p-seal-card-' + seal.kind} key={seal.kind}><div><span className="p-seal-index">0{i + 1} / SELO DE CAMPANHA</span><CampaignSeal kind={seal.kind} /></div><h3>{seal.title}</h3><p>{seal.text}</p></article>)}</div>
    <div className="p-label-showcase"><div><p className="p-eyebrow">O PREÇO TAMBÉM TEM DESIGN.</p><h3>Uma oferta.<br /><em>Vários jeitos de destacar.</em></h3><p>Faixas, etiquetas inclinadas e selos com tipografia de preço bem definida. Valores sempre dinâmicos nos modelos de campanha.</p></div><div className="p-label-samples" aria-label="Exemplos ilustrativos de etiquetas de preço"><div className="p-price-sample p-price-red"><span>POR APENAS</span><b><small>R$</small>29<sup>,99</sup></b></div><div className="p-price-sample p-price-ticket"><span>OFERTA DA VEZ</span><b><small>R$</small>4<sup>,99</sup></b></div><div className="p-price-sample p-price-black"><span>BLACK FRIDAY</span><b><small>R$</small>199<sup>,99</sup></b></div></div></div>
    <p className="p-caption">Composições originais e genéricas da Encartiva. Valores ilustrativos. Identidade, produtos e condições são definidos por cada empresa.</p>
  </section>;
}
