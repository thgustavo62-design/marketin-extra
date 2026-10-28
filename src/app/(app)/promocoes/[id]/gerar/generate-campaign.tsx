"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StudioSource } from "@/lib/studio/store";
import { PROMO_FORMAT_KEYS, PROMO_FORMATS } from "@/lib/domain/promo";
import { promotionPageCount } from "@/features/studio/page-count";

export function GenerateCampaign({source,hash,saved}:{source:StudioSource;hash:string;saved:string[]}) {
  const router=useRouter(),started=useRef(false),running=useRef(false),done=useRef(new Set(saved));
  const [progress,setProgress]=useState("Preparando Feed, Stories e A4…"),[error,setError]=useState("");
  const total=PROMO_FORMAT_KEYS.reduce((n,f)=>n+promotionPageCount(source,f),0);
  async function generate(){
    if(running.current)return;
    running.current=true;setError("");
    try{
      const [{promotionScene},{persistSceneImages}]=await Promise.all([import("@/features/studio/promotion-scene"),import("@/features/studio/image-assets")]);
      let completed=0;
      for(const format of PROMO_FORMAT_KEYS)for(let page=0;page<promotionPageCount(source,format);page++){
        const key=`${format}:${page}`;
        if(!done.current.has(key)){
          setProgress(`Gerando ${PROMO_FORMATS[format].label} · página ${page+1} · ${completed} de ${total} prontas`);
          const scene=await persistSceneImages(await promotionScene(source,format,page),source.campaign.id,true);
          const response=await fetch(`/api/studio/${source.campaign.id}/document`,{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),body:JSON.stringify({format,page,scene,expectedRevision:0,expectedSourceHash:hash,documentSourceHash:hash})});
          const result=await response.json();
          if(!response.ok||!result.ok)throw Error(result.error||"Não foi possível salvar uma página.");
          done.current.add(key);
        }
        completed++;
      }
      setProgress("Feed, Stories e A4 prontos e salvos. Abrindo o Studio…");
      router.replace(`/studio/${source.campaign.id}?formato=feed`);
    }catch(e){setError(e instanceof Error?e.message:"A geração foi interrompida. As páginas concluídas foram preservadas.");}
    finally{running.current=false;}
  }
  useEffect(()=>{if(!started.current){started.current=true;void generate();}},[]);
  return <section className="card stack-form" aria-label="Geração automática dos três formatos">
    <h1>Montando sua campanha automaticamente</h1><p>{source.campaign.name} · {total} páginas nos três formatos.</p>
    <p role="status">{progress}</p><p>Produtos, fotos e preços vêm da sua planilha e do catálogo da empresa. Confira as artes antes de divulgar.</p>
    {error&&<><p role="alert">{error}</p><button className="btn primary-link" onClick={()=>void generate()}>Continuar geração</button><button className="btn" onClick={()=>location.reload()}>Conferir páginas salvas e retomar</button></>}
    <Link href={`/studio/${source.campaign.id}?formato=feed`}>Abrir páginas já disponíveis no Studio</Link>
  </section>;
}
