import { modelInk } from '../domain/pharmacy-models.ts';
import type { ThemeConfig } from '../domain/promo.ts';

function polygon(ctx: CanvasRenderingContext2D, points: number[][], fill: string) {
  ctx.beginPath(); points.forEach(([x,y],i)=> i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
/** Original campaign signatures, opt-in through a persisted visual version. */
export function drawCampaignSealHeader(ctx: CanvasRenderingContext2D, theme: ThemeConfig, w: number, h: number, title: string, validity: string | null) {
  const style=theme.visual!.style, c=theme.colors;
  const organic=['beauty','baby','fresh'].includes(style);
  ctx.save();ctx.scale(w/600,h/220);
  ctx.fillStyle=c.skyTop;ctx.fillRect(0,0,600,220);
  // A restrained print pattern instead of a generic circle in every campaign.
  ctx.globalAlpha=.1;ctx.fillStyle=modelInk(c.skyTop);
  for(let y=7;y<220;y+=12)for(let x=7;x<600;x+=12)ctx.fillRect(x,y,1,1);
  ctx.globalAlpha=1;
  const ink=modelInk(c.skyTop), accentInk=modelInk(c.badge);
  ctx.textAlign='center';ctx.textBaseline='middle';
  const fit=(text:string,y:number,size:number,color:string,max=495)=>{
    let n=size;ctx.font=`900 ${n}px "PromoText", Montserrat, sans-serif`;
    while(ctx.measureText(text).width>max&&n>9){n-=.5;ctx.font=`900 ${n}px "PromoText", Montserrat, sans-serif`;}
    ctx.fillStyle=color;ctx.fillText(text,300,y);
  };
  fit(theme.visual!.eyebrow,19,9,ink,510);
  const words=title.toLocaleUpperCase('pt-BR').replace(/\s+/g,' ').trim().split(' ');
  const mid=words.length===2?1:Math.ceil(words.length/2);
  const lines=words.length>1?[words.slice(0,mid).join(' '),words.slice(mid).join(' ')]:[words[0]||'OFERTAS'];
  if(organic){
    ctx.fillStyle=c.badge;ctx.beginPath();ctx.ellipse(300,111,259,80,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.skyTop;ctx.beginPath();ctx.ellipse(300,106,248,70,0,0,Math.PI*2);ctx.fill();
    if(style==='fresh')polygon(ctx,[[502,40],[542,21],[535,53]],c.badge);
  }else{
    polygon(ctx,[[44,51],[552,36],[563,170],[53,187]],ink);
    polygon(ctx,[[36,43],[544,28],[555,162],[45,179]],c.skyTop);
    ctx.strokeStyle=c.badge;ctx.lineWidth=2;ctx.stroke();
  }
  if(lines.length===1){ fit(lines[0],108,53,ink); }
  else{
    fit(lines[0],83,43,ink,480);
    polygon(ctx,[[50,114],[539,101],[544,161],[56,176]],c.badge);
    fit(lines[1],139,42,accentInk,470);
  }
  if(style==='black'||style==='energy'||style==='market'){
    polygon(ctx,[[46,31],[54,47],[73,43],[59,57],[67,73],[50,64],[34,77],[38,57],[22,48],[41,47]],c.badge);
    polygon(ctx,[[545,151],[550,163],[565,163],[554,172],[559,187],[545,179],[534,186],[537,172],[526,164],[540,164]],c.badge);
  }
  if(validity)fit(validity.toLocaleUpperCase('pt-BR'),204,9,ink,520);
  ctx.restore();
}
