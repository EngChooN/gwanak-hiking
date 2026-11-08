// 첫 모금 연출(기획서 v2 A3). 불 붙인 뒤 첫 내뿜기(lounge:smoke first:true)에서 1.5초 동안:
// 카메라가 살짝 다가가고 · 주변 소리가 작아지고 · 화면 가장자리가 따뜻하게 물든다(「야생의 숨결」 노란 빛, 불투명도 0.25 이하).
// 멘솔은 가장자리에 시원한 파랑이 살짝 섞이고, 기침(cough)은 어느 모금이든 화면이 아주 작게 흔들린다.
// 카메라는 window.lounge.setCam({dist,yaw,pitch})만 쓴다(원본 파일·main.js의 카메라 계산은 고치지 않는다). 사용자가 돌린 값은 그대로 두려고 변화량만 더하고 끝나면 되돌린다.

export const MOMENT_SECONDS=1.5;
export const MAX_ALPHA=.25;                 // 가장자리 색 불투명도 상한
const WARM=[255,180,92],COOL=[120,196,255];  // 야생의 숨결 해질녘 호박빛 / 멘솔 파랑

// lounge:smoke detail → 연출 계획(없으면 null). 내 담배(playerId)가 내뿜기 시작할 때만.
export function momentPlan(d,playerId='me'){
 if(!d||d.id!==playerId||d.state!=='exhale')return null;
 const cough=d.quality==='cough',first=!!d.first&&!cough;
 if(!first&&!cough)return null;
 const menthol=first&&d.kind==='menthol';
 return {secs:MOMENT_SECONDS,
  warm:first?(menthol?.12:.22):0,cool:menthol?.12:0,   // 합쳐도 MAX_ALPHA 이하
  zoom:first?.35:0,duck:first?.35:1,shake:cough?1:0};
}
// 0→1→0 부드러운 언덕(x: 0~1 진행)
export const envelope=x=>x<=0||x>=1?0:Math.sin(Math.PI*x)**1.5;

const edge=(rgb,a)=>`radial-gradient(ellipse at center,rgba(${rgb},0) 52%,rgba(${rgb},${a.toFixed(3)}) 100%)`;
export function overlayBackground(warm,cool){
 const layers=[];if(cool>0)layers.push(edge(COOL.join(','),cool));if(warm>0)layers.push(edge(WARM.join(','),warm));
 return layers.join(',')||'none';
}

// 카메라 쪽으로 내뿜으면 화면이 잠깐 뿌옇게(기획서 v2 A2). 연기(smoke.js #eceef2)와 같은 회백색을 화면 가운데에 옅게 깐다.
// 첫 모금 가장자리 색과 같은 모금에 겹치면 둘을 합쳐 MAX_ALPHA를 넘지 않게 줄인다.
// heading·camYaw는 main.js 기준(카메라는 플레이어 뒤 sin/cos(yaw) 쪽, 플레이어 앞은 -sin/-cos(heading)). 마주 볼수록(facing→1) 진하다.
export const HAZE_SECONDS=2.4,HAZE_MAX=.3;
const HAZE=[236,238,242];
export function hazePlan(d,heading,camYaw,playerId='me'){
 if(!d||d.id!==playerId||d.state!=='exhale'||d.quality==='cough')return null;
 const facing=-Math.cos(heading-camYaw);if(!(facing>.5))return null;          // 카메라에서 60° 안쪽을 볼 때만
 const amt=Math.min(1.6,Math.max(.4,d.amount||1));
 return {secs:HAZE_SECONDS,alpha:Math.min(HAZE_MAX,.16*amt*(facing-.5)/.5+.04)};
}
export const hazeBackground=a=>`radial-gradient(ellipse at 50% 55%,rgba(${HAZE.join(',')},${a.toFixed(3)}) 0%,rgba(${HAZE.join(',')},${(a*.55).toFixed(3)}) 60%,rgba(${HAZE.join(',')},0) 100%)`;

export function createMoment({audio,playerId='me',win=globalThis.window,doc=globalThis.document,lounge=()=>globalThis.window?.lounge,reduced=false}={}){
 let el=null,hz=null;
 if(doc?.createElement){el=doc.createElement('div');el.className='lg-moment';el.setAttribute?.('aria-hidden','true');
  Object.assign(el.style,{position:'fixed',inset:'0',pointerEvents:'none',opacity:'0',zIndex:'4'});(doc.body??doc.documentElement)?.appendChild(el);
  hz=doc.createElement('div');hz.className='lg-haze';hz.setAttribute?.('aria-hidden','true');
  Object.assign(hz.style,{position:'fixed',inset:'0',pointerEvents:'none',opacity:'0',zIndex:'4'});(doc.body??doc.documentElement)?.appendChild(hz);}
 let cur=null,haze=null;const applied={dist:0,yaw:0,pitch:0};
 const nudge=(want)=>{const L=lounge(),c=L?.cam;if(!c||!L.setCam)return;
  const dd=want.dist-applied.dist,dy=want.yaw-applied.yaw,dp=want.pitch-applied.pitch;if(!dd&&!dy&&!dp)return;
  L.setCam({dist:c.dist+dd,yaw:c.yaw+dy,pitch:c.pitch+dp});Object.assign(applied,want);};
 function start(plan){
  // 이미 하는 중이면 더 센 쪽을 살리고 시간만 다시 시작한다
  cur={...plan,t:0};
  if(el){el.style.background=overlayBackground(plan.warm,plan.cool);}
  if(plan.duck<1)audio?.duck?.(plan.duck,plan.secs);
 }
 const on=e=>{const p=momentPlan(e.detail,playerId);if(p)start(p);
  const L=lounge(),h=L?.player?.heading,y=L?.cam?.yaw;
  if(Number.isFinite(h)&&Number.isFinite(y)){const hp=hazePlan(e.detail,h,y,playerId);
   if(hp&&cur&&cur.t===0)hp.alpha=Math.min(hp.alpha,Math.max(0,MAX_ALPHA-cur.warm-cur.cool)); // 방금 시작한 첫 모금 연출과 합쳐 0.25 이하
   if(hp&&hp.alpha>0){haze={...hp,t:0};if(hz)hz.style.background=hazeBackground(hp.alpha);}}};
 win?.addEventListener?.('lounge:smoke',on);
 return {
  start,
  get active(){return !!cur;},
  get hazeAlpha(){return haze?haze.alpha*envelope(haze.t/haze.secs):0;},
  // 매 프레임(main 루프). 끝나면 카메라를 처음 값으로 돌려 놓는다.
  update(dt){
   if(haze){haze.t+=dt;if(hz)hz.style.opacity=String(envelope(haze.t/haze.secs));if(haze.t>=haze.secs){haze=null;if(hz)hz.style.opacity='0';}}
   if(!cur){return;}
   cur.t+=dt;const x=cur.t/cur.secs,k=envelope(x);
   if(el)el.style.opacity=String(Math.min(1,k*(cur.warm||cur.cool?1:0)));
   const mv=reduced?0:1;
   nudge({dist:-cur.zoom*k*mv,yaw:cur.shake?Math.sin(cur.t*62)*.004*k*mv:0,pitch:cur.shake?Math.sin(cur.t*77+1)*.003*k*mv:0});
   if(x>=1){nudge({dist:0,yaw:0,pitch:0});if(el)el.style.opacity='0';cur=null;}
  },
  // 지금 화면 색 불투명도(테스트·진단용)
  get alpha(){return cur?(cur.warm+cur.cool)*envelope(cur.t/cur.secs):0;},
  dispose(){win?.removeEventListener?.('lounge:smoke',on);nudge({dist:0,yaw:0,pitch:0});el?.remove?.();hz?.remove?.();},
 };
}
