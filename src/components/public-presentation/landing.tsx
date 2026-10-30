'use client';

import { useState } from 'react';
import { PUBLIC_PLANS, whatsappLink, type PublicPresentation } from '@/lib/domain/public-presentation';
import { ProcessVisual } from './process-visual';
import './presentation.css';

const flowSteps = [
  ['Identidade', 'Primeiro, a sua marca.', 'Definimos a linguagem da sua empresa: cores, tipografia e modelos para as próximas campanhas. A automação começa com essa base.'],
  ['Planilha', 'Os dados entram. O trabalho anda.', 'Importe os nomes, as apresentações e os preços dos produtos. A planilha vira o ponto de partida para organizar a criação.'],
  ['Revisão', 'Você confere cada detalhe.', 'Confira fotografias, descrições, agrupamentos e preços. Corrija o que precisar antes de seguir para a finalização.'],
  ['Criação', 'O ajuste fino é com você.', 'Escolha um modelo da sua empresa e ajuste textos, cores, imagens e composição no editor visual.'],
  ['Exportação', 'Da criação aos seus canais.', 'Finalize em Feed, Stories e cartaz A4. Revise a composição de cada formato antes de exportar os arquivos.'],
];
const features = [
  ['Criação automática', 'A planilha dá a partida.', 'Organize os produtos importados, selecione um modelo e prepare os formatos para a revisão.'],
  ['Produtos', 'Seu catálogo, organizado.', 'Reúna as fotografias e descrições dos produtos da empresa para encontrar o que precisa nas próximas criações.'],
  ['Editor visual', 'A sua decisão aparece.', 'Ajuste textos, cores, imagens e composição. A automação prepara o trabalho; você confere o resultado.'],
  ['Campanhas', 'Cada ação no seu lugar.', 'Organize as campanhas da empresa e mantenha o trabalho de comunicação em contexto.'],
  ['Resultados', 'Depois de criar, acompanhe.', 'Consulte os resultados das contas conectadas. As integrações dependem da configuração de cada empresa.'],
  ['Biblioteca', 'Os arquivos ficam por perto.', 'Reúna os materiais da empresa e encontre os arquivos que fazem parte da sua comunicação.'],
];

export function PresentationLanding({ contact, preview = false }: { contact: PublicPresentation; preview?: boolean }) {
  const [step, setStep] = useState(0);
  const [feature, setFeature] = useState(0);
  const [paused, setPaused] = useState(false);
  const href = whatsappLink(contact.whatsappPhone, contact.ctaMessage);
  return <div className="presentation p-motion" id="topo" data-motion={paused ? 'paused' : 'playing'}>
    <a className="p-skip" href="#conteudo">Pular para o conteúdo</a>
    {preview ? <div className="p-preview">Prévia privada · somente administradores <a href="/configuracoes/site-apresentacao">Voltar às configurações</a></div> : null}
    <header className="p-header">
      <a href="#topo" aria-label="Encartiva — início"><img className="p-logo" src="/brand/encartiva/branca.png" alt="Encartiva" width="190" height="48" /></a>
      <nav aria-label="Apresentação"><a href="#conceito">A ideia</a><a href="#como-funciona">Como funciona</a><a href="#plataforma">Plataforma</a><a href="#planos">Planos</a></nav>
      <a className="p-header-contact" href={href} target="_blank" rel="noopener noreferrer">Saiba mais <span aria-hidden="true">↗</span></a>
    </header>
    <main id="conteudo">
      <section className="p-hero" aria-labelledby="p-title">
        <div className="p-hero-top"><p className="p-eyebrow"><span className="p-status-dot" /> IDENTIDADE + AUTOMAÇÃO / ENCARTIVA</p><button className="p-motion-toggle" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar movimento' : 'Pausar movimento'} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span></button></div>
        <div className="p-hero-body">
          <div className="p-hero-copy"><h1 id="p-title" aria-label="Sua marca. Outro ritmo."><span>SUA MARCA.</span><span className="p-title-offset">OUTRO</span><em>RITMO<span className="p-title-dot">.</span></em></h1></div>
          <div className="p-hero-aside"><div className="p-kinetic" aria-hidden="true"><div className="p-kinetic-caption"><span>DO COMEÇO AO ARQUIVO FINAL.</span><span>↗</span></div><div className="p-word-viewport"><div className="p-word-reel"><span>CRIAR.</span><span>REVISAR.</span><span>AJUSTAR.</span><span>EXPORTAR.</span><span>CRIAR.</span></div></div><div className="p-kinetic-track"><i /><span>IDENTIDADE → PROCESSO → AUTONOMIA</span></div></div><p>Uma base para a sua marca.<br />Um processo para criar.<br /><strong>O controle continua com você.</strong></p><a className="p-arrow-link" href="#como-funciona">Entenda como funciona <span aria-hidden="true">↘</span></a></div>
        </div>
        <div className="p-hero-bottom"><p>PARA FARMÁCIAS, SUPERMERCADOS<br />E MARCAS COM MUITO PARA COMUNICAR.</p><span>ROLE PARA CONHECER <b aria-hidden="true">↓</b></span></div>
      </section>
      <section className="p-manifesto p-section" id="conceito" aria-labelledby="p-concept-title">
        <div className="p-wrap"><p className="p-eyebrow">01 / A IDEIA É MUDAR O RITMO.</p><h2 id="p-concept-title" className="p-scroll-reveal">SUA ROTINA<br />TEM REPETIÇÃO.<br /><em>SUA MARCA<br />TEM PERSONALIDADE.</em></h2><div className="p-manifesto-bottom"><span className="p-big-arrow" aria-hidden="true">↳</span><div><p>Produto, preço, texto, formato. Quando tudo precisa ser montado de novo, a criação vira uma sequência de tarefas.</p><p>A Encartiva organiza esse caminho: uma identidade definida, informações reunidas e espaço para você revisar e personalizar.</p><a className="p-arrow-link" href={href} target="_blank" rel="noopener noreferrer">Saiba mais <span aria-hidden="true">↗</span></a></div></div></div>
      </section>
      <section className="p-flow p-section" id="como-funciona" aria-labelledby="p-flow-title">
        <div className="p-wrap"><div className="p-section-heading"><p className="p-eyebrow">02 / DO PRIMEIRO PASSO AO ARQUIVO FINAL.</p><h2 id="p-flow-title">ENTENDA O<br /><em>CAMINHO.</em></h2><p>Sem mistério. Você prepara a base, coloca as informações, confere e finaliza.</p></div>
          <div className="p-flow-layout"><div className="p-flow-steps" role="group" aria-label="Etapas da criação">{flowSteps.map(([name, title, text], index) => <div className="p-flow-item" key={name}><button type="button" id={'p-step-' + index} aria-expanded={step === index} aria-controls={'p-step-panel-' + index} onClick={() => setStep(index)}><span>0{index + 1}</span><b>{name}</b><i aria-hidden="true">{step === index ? '−' : '+'}</i></button><div id={'p-step-panel-' + index} role="region" aria-labelledby={'p-step-' + index} hidden={step !== index}><h3>{title}</h3><p>{text}</p>{index < flowSteps.length - 1 ? <button className="p-next-step" type="button" onClick={() => setStep(value => (value + 1) % flowSteps.length)}>Ver próxima etapa <span aria-hidden="true">→</span></button> : <a className="p-next-step" href="#planos">Conhecer os planos <span aria-hidden="true">→</span></a>}</div></div>)}</div><div className="p-flow-stage" key={step}><ProcessVisual step={step} /></div></div>
        </div>
      </section>
      <div className="p-type-band" aria-hidden="true"><div><span>DA SUA MARCA.</span><b>↗</b><span>AOS SEUS CANAIS.</span><b>↗</b><span>DA SUA MARCA.</span><b>↗</b><span>AOS SEUS CANAIS.</span><b>↗</b></div></div>
      <section className="p-platform p-section" id="plataforma" aria-labelledby="p-platform-title"><div className="p-wrap"><div className="p-section-heading"><p className="p-eyebrow">03 / AS PARTES SE CONECTAM.</p><h2 id="p-platform-title">CRIAÇÃO COM<br /><em>CONTEXTO.</em></h2><p>Produtos, arquivos, editor e campanhas no mesmo ambiente de trabalho.</p></div><div className="p-platform-layout"><div className="p-module-tabs" role="group" aria-label="Recursos da plataforma">{features.map(([name], index) => <button key={name} type="button" aria-pressed={feature === index} onClick={() => setFeature(index)}><span>0{index + 1}</span>{name}<b aria-hidden="true">↗</b></button>)}</div><div className="p-feature-panel" key={feature} aria-live="polite" aria-atomic="true"><span className="p-feature-index" aria-hidden="true">0{feature + 1}</span><p className="p-eyebrow">{features[feature][0]}</p><h3>{features[feature][1]}</h3><p>{features[feature][2]}</p><span className="p-feature-footnote">SEU PROCESSO. NO MESMO LUGAR.</span></div></div><div className="p-access-note"><b>UMA OPERAÇÃO.<br />CADA MARCA NO SEU ESPAÇO.</b><p>O proprietário acompanha suas empresas e filiais. Gerentes e funcionários acessam os espaços e recursos autorizados.</p></div></div></section>
      <section className="p-plans p-section" id="planos" aria-labelledby="p-plans-title"><div className="p-wrap"><div className="p-section-heading"><p className="p-eyebrow">04 / ESCOLHA O TAMANHO DA SUA OPERAÇÃO.</p><h2 id="p-plans-title">SEU PRÓXIMO<br /><em>PASSO.</em></h2><p>Assinatura mensal conforme o número de empresas.</p></div><div className="p-plan-grid">{PUBLIC_PLANS.map((plan, index) => <article key={plan.name} className={index === 1 ? 'p-plan p-plan-featured' : 'p-plan'}><div className="p-plan-top"><p>{plan.name}</p><span>0{index + 1}</span></div><h3>{plan.companies}</h3><p className="p-plan-price"><small>R$</small>{plan.price}<span>/mês</span></p><p className="p-plan-detail">{plan.detail}</p><a className="p-button" href={whatsappLink(contact.whatsappPhone, contact.ctaMessage + ' Tenho interesse no plano ' + plan.name + '.')} target="_blank" rel="noopener noreferrer" aria-label={'Saiba mais sobre o plano ' + plan.name + ' no WhatsApp'}>Saiba mais <span aria-hidden="true">↗</span></a></article>)}</div><p className="p-plan-note">A personalização inicial é definida na implantação. Consulte o escopo e as condições da proposta. Contratação pelo atendimento, sem cobrança nesta página.</p></div></section>
      <section className="p-final p-section" aria-labelledby="p-final-title"><div className="p-wrap"><p className="p-eyebrow">O PRÓXIMO PASSO É UMA CONVERSA.</p><h2 id="p-final-title">MUDE<br />O <em>RITMO.</em><span aria-hidden="true">↗</span></h2><div className="p-final-bottom"><p>Vamos entender a sua operação<br />e apresentar a Encartiva.</p><a className="p-button" href={href} target="_blank" rel="noopener noreferrer">Saiba mais pelo WhatsApp <span aria-hidden="true">↗</span></a></div></div></section>
    </main>
    <footer className="p-footer p-wrap"><a href="#topo" aria-label="Encartiva — voltar ao início"><img src="/brand/encartiva/branca.png" alt="Encartiva" width="160" height="40" /></a><p>IDENTIDADE NO ENCARTE.<br />INTELIGÊNCIA NO PROCESSO.</p><a href="#topo">Voltar ao início ↑</a></footer>
  </div>;
}
