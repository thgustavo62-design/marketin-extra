'use client';
import { useEffect, useRef, useState } from 'react';
import { drawModelPreview } from '@/lib/promo/model-preview';
const models = [['farma-essencial','Ofertas da semana'],['beleza-natural','Beleza & autocuidado'],['black-friday','Black Friday']];
export function PresentationModelPreview() {
  return <div className="p-live-models" aria-label="Prévia dos modelos genéricos de encartes">{models.map(([key,title])=><Model key={key} modelKey={key} title={title} />)}<p>Modelos de demonstração · ilustrações e preços fictícios</p></div>;
}
function Model({modelKey,title}:{modelKey:string;title:string}) {
  const ref=useRef<HTMLCanvasElement>(null);const[failed,setFailed]=useState(false);
  useEffect(() => {
    let active = true;
    const node = ref.current;
    if (!node) return;
    const draw = () => { void drawModelPreview(node, { modelKey, format: 'feed' }, () => active).catch(() => { if (active) setFailed(true); }); };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); draw(); }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, [modelKey]);
  return <figure><canvas ref={ref} width="1080" height="1350" role="img" aria-label={'Modelo genérico de '+title} /><figcaption>{failed?'Prévia temporariamente indisponível':title}</figcaption></figure>;
}
