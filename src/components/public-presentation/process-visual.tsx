const names = ['Identidade', 'Planilha', 'Revisão', 'Criação', 'Exportação'];

/** Diagramas do processo, sem artes de clientes nem acesso ao workspace. */
export function ProcessVisual({ step }: { step: number }) {
  return <div className={'p-process-visual p-process-' + step} aria-label={'Ilustração da etapa ' + names[step]} role="img">
    <div className="p-process-top"><span>ENCARTIVA / PROCESSO</span><b>0{step + 1}</b></div>
    {step === 0 ? <div className="p-brand-study"><span>SUA IDENTIDADE</span><strong>SUA<br />MARCA<span>®</span></strong><div className="p-color-study"><i /><i /><i /><i /></div><p>Cores. Tipografia. Personalidade.</p></div> : null}
    {step === 1 ? <div className="p-sheet-study"><div><span>PRODUTO</span><span>PREÇO</span><span>FOTO</span></div>{[0, 1, 2, 3].map(i => <div key={i}><i /><i /><b>↗</b></div>)}<p>Informações organizadas para começar.</p></div> : null}
    {step === 2 ? <div className="p-review-study"><strong>O CONTROLE<br />É SEU.</strong>{['Fotografias', 'Descrições', 'Preços e condições'].map(text => <div key={text}><span>{text}</span><b>✓</b></div>)}<p>Você confere antes de finalizar.</p></div> : null}
    {step === 3 ? <div className="p-type-study"><span>O AJUSTE FINO</span><strong>DO SEU<br /><em>JEITO.</em></strong><div><span>Texto</span><span>Cor</span><span>Composição</span></div><p>Personalize a criação antes de exportar.</p></div> : null}
    {step === 4 ? <div className="p-format-study"><div><span>4:5</span><b>FEED</b></div><div><span>9:16</span><b>STORIES</b></div><div><span>A4</span><b>CARTAZ</b></div><p>Uma comunicação. Diferentes formatos.</p></div> : null}
    <div className="p-process-bottom"><span>ILUSTRAÇÃO DO FLUXO</span><div>{names.map((name, index) => <i key={name} data-active={index === step} />)}</div></div>
  </div>;
}
