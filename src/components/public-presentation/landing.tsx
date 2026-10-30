'use client';

import dynamic from 'next/dynamic';
import { useState, type CSSProperties } from 'react';
import { PUBLIC_PLANS, whatsappLink, type PublicPresentation } from '@/lib/domain/public-presentation';
import { presentationScreens, screensReady } from './screens';
import './presentation.css';
import { EditorialShowcase } from './editorial-showcase';
import { CampaignSeal } from './campaign-seal';

const PresentationModelPreview = dynamic(() => import('./model-preview').then(m => m.PresentationModelPreview), { ssr: false, loading: () => <p className="p-preview-loading">Carregando exemplos de encartes…</p> });

const sampleProducts = [
  ['Shampoo', '14,90'], ['Sabonete', '3,99'], ['Creme dental', '6,90'],
  ['Café', '18,90'], ['Biscoito', '5,49'], ['Detergente', '2,99'],
];
function ProductDrawing({ index }: { index: number }) {
  return <svg viewBox="0 0 100 104" aria-hidden="true" focusable="false">
    {index < 3 ? <><rect x="37" y="9" width="26" height="12" rx="3" fill="#111214" /><rect x="29" y="19" width="42" height="76" rx="12" fill={index === 1 ? '#fff' : '#DCCEFF'} stroke="#6B5DFF" strokeWidth="2" /><rect x="29" y="44" width="42" height="29" fill="#6B5DFF" /><path d="M40 52h20M43 59h14M40 66h20" stroke="white" strokeWidth="2" /></> :
    <><path d="M25 13h50l5 82H20z" fill={index === 4 ? '#DCCEFF' : '#F8F5EA'} stroke="#111214" strokeWidth="2" /><path d="M25 14h50M22 91h56" stroke="#6B5DFF" strokeWidth="6" /><circle cx="50" cy="51" r="18" fill="#6B5DFF" /><path d="M39 51h22M43 58h14" stroke="white" strokeWidth="3" /></>}
  </svg>;
}
function OfferSheet({ plain = false, compact = false }: { plain?: boolean; compact?: boolean }) {
  return <div className={'p-offer-sheet' + (plain ? ' p-offer-plain' : '') + (compact ? ' p-offer-compact' : '')} aria-label="Exemplo ilustrativo de encarte com seis ofertas">
    <div className="p-offer-heading"><small>{plain ? 'MERCADO' : 'SUA MARCA'}</small>{plain ? <strong>OFERTAS</strong> : <CampaignSeal kind="week" />}<span>{plain ? 'Produtos em promoção' : 'Uma identidade que é sua.'}</span></div>
    <div className="p-product-grid">{sampleProducts.map(([name, price], index) => <div key={name} className="p-product">
      <ProductDrawing index={index} /><span>{name}</span><b><small>R$</small> {price}</b>
    </div>)}</div>
    <div className="p-offer-footer">EXEMPLO ILUSTRATIVO · PRODUTOS E PREÇOS FICTÍCIOS</div>
  </div>;
}
const flowSteps = [
  ['Identidade', 'Começa com a sua marca.', 'Analisamos sua comunicação e definimos os modelos, as etiquetas e os elementos promocionais.'],
  ['Planilha', 'Entram os seus produtos.', 'Importe sua planilha com os nomes, as apresentações e os preços das ofertas.'],
  ['Revisão', 'Você confere cada detalhe.', 'Revise fotografias, preços, descrições e agrupamentos antes de seguir.'],
  ['Modelo', 'A campanha ganha identidade.', 'Escolha os modelos preparados para a sua empresa e personalize a composição.'],
  ['Exportação', 'Pronta para os seus canais.', 'Finalize e exporte em Feed, Stories e cartaz A4, respeitando a composição de cada formato.'],
];

export function PresentationLanding({ contact, preview = false }: { contact: PublicPresentation; preview?: boolean }) {
  const [comparison, setComparison] = useState(58);
  const [step, setStep] = useState(0);
  const [screen, setScreen] = useState(0);
  const href = whatsappLink(contact.whatsappPhone, contact.ctaMessage);
  const module = presentationScreens[screen];
  return <div className="presentation p-documentary" id="topo">
    <a className="p-skip" href="#conteudo">Pular para o conteúdo</a>
    {preview && <div className="p-preview">Prévia privada · somente administradores <a href="/configuracoes/site-apresentacao">Voltar às configurações</a></div>}
    <header className="p-header">
      <a href="#topo" aria-label="Encartiva — início"><img className="p-logo" src="/brand/encartiva/grafite.png" alt="Encartiva" width="190" height="48" /></a>
      <nav aria-label="Apresentação"><a href="#colecao">Na prática</a><a href="#como-funciona">Como funciona</a><a href="#plataforma">Plataforma</a><a href="#planos">Planos</a></nav>
      <a className="p-header-contact" href={href} target="_blank" rel="noopener noreferrer">Saiba mais <span aria-hidden="true">↗</span></a>
    </header>
    <main id="conteudo">
      <section className="p-hero" aria-labelledby="p-title">
        <div className="p-hero-top"><p className="p-eyebrow">ENCARTIVA / IDENTIDADE + AUTOMAÇÃO</p><span>FEITO PARA O VAREJO.<br />PENSADO PARA A SUA MARCA.</span></div>
        <div className="p-hero-copy">
          <h1 id="p-title" aria-label="É a sua marca. Dá para ver."><span>É A SUA</span><span>MARCA.</span><em>Dá para ver.</em></h1>
          <div className="p-hero-bottom"><p className="p-lead">Do selo da campanha à etiqueta de preço.<br />A mesma personalidade, em cada ponto de contato.</p><a className="p-round-link" href="#colecao" aria-label="Explorar as possibilidades da Encartiva">Explore<br /><span aria-hidden="true">↓</span></a></div>
        </div>
        <div className="p-hero-seals"><CampaignSeal kind="sale" /><div className="p-hero-seal-small"><CampaignSeal kind="black" /></div><span>SELOS PRÓPRIOS. CAMPANHAS COM PRESENÇA.</span></div>
        <div className="p-hero-caption"><span>IDENTIDADE QUE SAI DA TELA.</span><a href={href} target="_blank" rel="noopener noreferrer">Saiba mais ↗</a></div>
      </section>
      <div className="p-ribbon" aria-label="O que a Encartiva conecta"><span>SUA MARCA.</span><b aria-hidden="true">↗</b><span>SEU RITMO.</span><b aria-hidden="true">↗</b><span>SUAS OFERTAS.</span></div>
      <EditorialShowcase />
      <section className="p-problem p-section" id="conceito">
        <div className="p-wrap p-split p-reveal"><div><p className="p-eyebrow">01 / A mudança começa aqui</p><h2>A oferta muda.<br />Sua marca <em>continua.</em></h2></div>
          <div className="p-problem-list">{[
            ['Repetir não é criar.', 'As mesmas tarefas, toda vez que a oferta muda.'],
            ['Sua marca precisa aparecer.', 'Cores, títulos e etiquetas que não conversam entre si enfraquecem a comunicação.'],
            ['Produto e preço têm seu lugar.', 'Reorganizar tudo manualmente toma espaço da revisão.'],
            ['Encarte também é identidade.', 'A oferta merece ser reconhecida como parte da sua marca.'],
          ].map(([title, text], index) => <article key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
        </div>
      </section>
      <section className="p-identity p-section p-wrap p-reveal" aria-labelledby="p-identity-title">
        <div className="p-section-heading"><p className="p-eyebrow">02 / Personalização antes de tudo</p><h2 id="p-identity-title">Reconhecida antes<br /><em>do primeiro preço.</em></h2><p>Entendemos sua comunicação. Criamos uma identidade promocional. E preparamos os modelos para as próximas campanhas.</p></div>
        <div className="p-comparison" style={{ '--comparison': comparison + '%' } as CSSProperties}>
          <div className="p-comparison-before"><OfferSheet plain /></div><div className="p-comparison-after"><OfferSheet /></div>
          <span className="p-comparison-label p-before">Genérico</span><span className="p-comparison-label p-after">Com identidade</span><div className="p-comparison-handle" aria-hidden="true">↔</div>
        </div>
        <div className="p-comparison-controls"><button type="button" onClick={() => setComparison(0)}>Ver antes</button><label>Comparar identidade<input type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} aria-label="Comparar encarte genérico e personalizado" /></label><button type="button" onClick={() => setComparison(100)}>Ver depois</button></div>
        <p className="p-caption">Comparação ilustrativa de composição. Não representa um trabalho realizado para um cliente.</p>
      </section>
      <section className="p-flow p-section" id="como-funciona">
        <div className="p-wrap p-reveal"><p className="p-eyebrow">03 / Da identidade à campanha</p><h2>Do seu jeito.<br /><em>Em cada etapa.</em></h2>
          <div className="p-flow-steps" role="group" aria-label="Etapas da criação">{flowSteps.map(([name], index) => <button key={name} type="button" aria-pressed={step === index} onClick={() => setStep(index)}><span>0{index + 1}</span>{name}<b aria-hidden="true">↗</b></button>)}</div>
          <div className="p-flow-stage" aria-live="polite"><div className="p-flow-number" aria-hidden="true">0{step + 1}</div><div key={step} className="p-flow-copy"><h3>{flowSteps[step][1]}</h3><p>{flowSteps[step][2]}</p><button className="p-text-link" type="button" onClick={() => setStep((step + 1) % flowSteps.length)}>Ver próxima etapa <span aria-hidden="true">→</span></button></div><div className="p-output-formats"><span>Feed <b>4:5</b></span><span>Stories <b>9:16</b></span><span>Cartaz <b>A4</b></span></div></div>
          <p className="p-caption">A revisão faz parte do processo. Confira fotos, descrições e preços antes de finalizar.</p>
        </div>
      </section>
      <section className="p-platform p-section p-wrap p-reveal" id="plataforma">
        <div className="p-section-heading"><p className="p-eyebrow">04 / Conheça a plataforma</p><h2>Bonita por fora.<br /><em>Organizada por dentro.</em></h2></div>
        <div className="p-module-tabs" role="group" aria-label="Módulos da plataforma">{presentationScreens.map((item, index) => <button key={item.key} type="button" aria-pressed={screen === index} onClick={() => setScreen(index)}>{item.name}</button>)}</div>
        <div className="p-module-stage"><div className="p-window-bar"><span /><span /><span /><p>ENCARTIVA / AMBIENTE DE DEMONSTRAÇÃO</p></div>
          {module.key === 'promotions' ? <PresentationModelPreview /> : screensReady ? <img key={module.key} src={'/presentation/' + module.key + '.webp'} alt={'Tela ilustrativa do módulo ' + module.name + ', com dados de exemplo'} width="1200" height="750" loading="lazy" /> : <div className="p-screen-example"><strong>{module.name}</strong><p>Identidade da sua empresa · arquivos e produtos organizados</p><div><OfferSheet compact /><div className="p-example-rows">{sampleProducts.map(([name, price]) => <p key={name}><span>{name}</span><b>R$ {price}</b></p>)}</div></div></div>}
        </div>
        <div className="p-module-caption" aria-live="polite"><h3>{module.title}</h3><p>{module.text}</p></div>
        <p className="p-caption">Demonstração ilustrativa com dados fictícios. Esta apresentação não acessa o workspace nem os dados de clientes.</p>
      </section>
      <section className="p-plans p-section" id="planos">
        <div className="p-wrap p-reveal"><div className="p-section-heading"><p className="p-eyebrow">05 / Escolha o tamanho da sua operação</p><h2>Sua operação cresce.<br /><em>A identidade acompanha.</em></h2><p>Assinatura mensal conforme o número de empresas. A identidade de cada marca continua sendo própria.</p></div>
          <div className="p-plan-grid">{PUBLIC_PLANS.map((plan, index) => <article key={plan.name} className={index === 1 ? 'p-plan p-plan-featured' : 'p-plan'}><p className="p-plan-name">{plan.name}</p><p className="p-plan-price"><small>R$</small>{plan.price}<span>/mês</span></p><h3>{plan.companies}</h3><p>{plan.detail}</p><a className="p-button" href={whatsappLink(contact.whatsappPhone, contact.ctaMessage + ' Tenho interesse no plano ' + plan.name + '.')} target="_blank" rel="noopener noreferrer" aria-label={'Saiba mais sobre o plano ' + plan.name + ' no WhatsApp'}>Saiba mais <span aria-hidden="true">↗</span></a></article>)}</div>
          <p className="p-plan-note">A personalização inicial é definida no processo de implantação. Consulte o escopo e as condições da proposta comercial. A contratação é feita pelo atendimento, sem cobrança nesta página.</p>
        </div>
      </section>
      <section className="p-final p-section"><div className="p-wrap p-reveal"><p className="p-eyebrow">O próximo passo é uma conversa.</p><h2>Sua próxima<br />campanha.<br /><em>Outro nível.</em></h2><div><p>Conheça uma forma mais inteligente de criar e organizar suas campanhas promocionais.</p><a className="p-button p-button-light" href={href} target="_blank" rel="noopener noreferrer">Saiba mais pelo WhatsApp <span aria-hidden="true">↗</span></a></div></div></section>
    </main>
    <footer className="p-footer p-wrap"><img src="/brand/encartiva/grafite.png" alt="Encartiva" width="160" height="40" /><p>Identidade no encarte.<br />Inteligência no processo.</p><a href="#topo">Voltar ao início ↑</a></footer>
  </div>;
}
