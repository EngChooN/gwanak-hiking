// 쌍안경·휴대폰 카메라 화면(DOM 오버레이). 상태는 main.js가 보내는 'hiking:state'(gadget, view, phone{zoom,selfie}, binoculars{zoom})만 읽고,
// 조작은 'hiking:command'(phone-zoom, selfie, shutter, gadget-off)로 되돌린다. 사진 저장·셔터음·흰 번쩍임은 main.js 몫이다.
export const PHONE_STOPS=Object.freeze([.5,1,2,5]);
export const GADGET_UI_KEYS=Object.freeze({orient:'gwanak-phone-orient',grid:'gwanak-phone-grid'});
// 화면 모드 판정(순수 함수). 쌍안경 테두리는 1인칭에서만, 휴대폰 테두리도 1인칭에서만 그린다. 3인칭 휴대폰은 작은 조작줄만 둔다.
export function gadgetMode(detail={}){
 const gadget=detail.gadget??'none',first=detail.view==='first';
 if(gadget==='binoculars')return {mode:first?'binoculars-first':'binoculars-third',hideHud:first,mirror:false};
 if(gadget==='phone')return {mode:first?'phone-first':'phone-third',hideHud:first,mirror:first&&!!detail.phone?.selfie};
 return {mode:'none',hideHud:false,mirror:false};
}
// 현재 배율에 가장 가까운 줌 단추(±5% 이내면 정확히 그 단추, 아니면 null).
export function activeStop(zoom,stops=PHONE_STOPS){return stops.find(s=>Math.abs(zoom-s)/s<=.05)??null;}
export const formatZoom=zoom=>`${Number.isInteger(Math.round(zoom*10)/10)?Math.round(zoom*10)/10:(Math.round(zoom*10)/10).toFixed(1)}x`;
export const clockText=(date=new Date())=>`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
// 쌍안경 바깥 윤곽: 두 원(반지름 1, 가운데 ±0.6)의 합집합 테두리를 한 path로 그려 겹친 안쪽 호가 보이지 않는다. 단위는 렌즈 반지름 r.
export const BINO_OVERLAP=.6;
export function binoOutlinePath(d=BINO_OVERLAP){const h=Math.sqrt(1-d*d).toFixed(4);return `M0 -${h}A1 1 0 1 0 0 ${h}A1 1 0 1 0 0 -${h}Z`;}
const BINO_RING=`<svg class="bino-ring" viewBox="-1.6 -1 3.2 2" aria-hidden="true"><path class="fr" d="${binoOutlinePath()}"/><path class="fb" d="${binoOutlinePath()}"/><path class="edge" d="${binoOutlinePath()}"/></svg>`;
const html=`
<div class="bino" aria-hidden="true"><div class="bino-mask"></div>${BINO_RING}<div class="bino-zoom"><b data-bino-zoom>8x</b></div></div>
<div class="phone" aria-label="휴대폰 카메라">
 <div class="phone-device">
  <div class="phone-screen">
   <i class="phone-hole"></i>
   <div class="phone-top"><span class="phone-time" data-phone-time>12:00</span><span class="phone-top-btns"><button type="button" data-act="grid" aria-pressed="false" title="격자 켜기/끄기">▦ 격자</button><button type="button" data-act="orient" title="가로/세로 전환">⟳ <span data-orient-label>가로</span></button><button type="button" data-act="close" title="휴대폰 내리기 (P)">✕</button></span><span class="phone-battery" aria-label="배터리"><i></i><em data-phone-battery>84%</em></span></div>
   <div class="phone-grid" aria-hidden="true"></div>
   <div class="phone-zoom-readout" data-phone-zoom-readout>1x</div>
   <div class="phone-bar">
    <button type="button" class="phone-thumb" data-act="thumb" aria-label="최근 사진"><canvas width="72" height="72"></canvas></button>
    <div class="phone-zooms" role="group" aria-label="줌">${PHONE_STOPS.map(s=>`<button type="button" data-zoom="${s}">${s}x</button>`).join('')}</div>
    <button type="button" class="phone-shutter" data-act="shutter" aria-label="촬영 (Space)"><i></i></button>
    <button type="button" class="phone-flip" data-act="selfie" aria-label="셀카 전환 (Y)" aria-pressed="false">⟲<small>셀카</small></button>
   </div>
  </div>
 </div>
</div>
<div class="gadget-chip" data-gadget-chip><span data-chip-text></span><span class="gadget-chip-tools" data-chip-tools><span class="chip-zooms">${PHONE_STOPS.map(s=>`<button type="button" data-zoom="${s}">${s}x</button>`).join('')}</span><button type="button" data-act="selfie" aria-pressed="false">셀카</button><button type="button" data-act="shutter" class="chip-shutter">촬영</button></span><button type="button" data-act="close" class="chip-close"></button></div>`;
export function installGadgetUI(doc=document,win=window){
 const root=doc.createElement('div');root.id='gadget-ui';root.dataset.mode='none';root.innerHTML=html;doc.body.append(root);
 const app=doc.getElementById('app'),world=doc.getElementById('world'),$=s=>root.querySelector(s),all=s=>[...root.querySelectorAll(s)];
 const store={get:(k,d)=>{try{return localStorage.getItem(k)??d;}catch{return d;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
 let orient=store.get(GADGET_UI_KEYS.orient,'landscape')==='portrait'?'portrait':'landscape',grid=store.get(GADGET_UI_KEYS.grid,'false')==='true',last=gadgetMode(),detail={};
 const send=(id,value)=>win.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}}));
 function paint(){
  root.dataset.orient=orient;root.dataset.grid=String(grid);$('[data-orient-label]').textContent=orient==='landscape'?'가로':'세로';
  $('[data-act=grid]').setAttribute('aria-pressed',String(grid));
 }
 function render(d){
  detail=d;const m=gadgetMode(d);last=m;root.dataset.mode=m.mode;
  app?.classList.toggle('gadget-hud-hidden',m.hideHud);world?.classList.toggle('gadget-mirror',m.mirror);doc.body.classList.toggle('gadget-on',m.mode!=='none');
  const zoom=d.phone?.zoom??1,stop=activeStop(zoom),selfie=!!d.phone?.selfie;
  all('[data-zoom]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.zoom)===stop)));
  all('[data-act=selfie]').forEach(b=>b.setAttribute('aria-pressed',String(selfie)));
  $('[data-phone-zoom-readout]').textContent=formatZoom(zoom);$('[data-phone-zoom-readout]').dataset.exact=String(stop!==null);
  root.dataset.selfie=String(selfie);all('[data-zoom]').forEach(b=>{b.disabled=selfie;});
  $('[data-bino-zoom]').textContent=formatZoom(d.binoculars?.zoom??8);
  const chip=$('[data-chip-text]');
  if(m.mode==='binoculars-first'){chip.innerHTML='<kbd>B</kbd> 닫기 · 휠로 배율';}
  else if(m.mode==='binoculars-third')chip.innerHTML='쌍안경 모드 · <kbd>B</kbd> 닫기 <small>(1인칭에서 볼 수 있어요)</small>';
  else if(m.mode==='phone-third')chip.innerHTML='휴대폰 모드 · <kbd>P</kbd> 닫기';
  else chip.textContent='';
  $('[data-chip-tools]').hidden=m.mode!=='phone-third';
  root.querySelector('.chip-close').textContent=m.mode==='phone-third'?'✕':m.mode==='none'?'':'✕';
 }
 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.zoom){send('phone-zoom',Number(b.dataset.zoom));return;}
  switch(b.dataset.act){
   case'shutter':send('shutter');break;case'selfie':send('selfie');break;case'close':send('gadget-off');break;
   case'grid':grid=!grid;store.set(GADGET_UI_KEYS.grid,String(grid));paint();break;
   case'orient':orient=orient==='landscape'?'portrait':'landscape';store.set(GADGET_UI_KEYS.orient,orient);paint();break;
  }
 });
 // 닫기 안내(B 닫기 / P 닫기)를 눌러도 닫히게 한다.
 $('[data-chip-text]').addEventListener('click',()=>send('gadget-off'));
 win.addEventListener('hiking:state',e=>render(e.detail||{}));
 // 촬영 직후 썸네일 갱신: main.js가 같은 프레임에 이벤트를 보내므로 3D 캔버스가 아직 살아 있다. 저장 사진과 같이 반전하지 않은 모습.
 win.addEventListener('hiking:photo',()=>{
  const c=$('.phone-thumb canvas');if(!c||!world)return;
  try{const g=c.getContext('2d'),w=world.width,h=world.height,s=Math.min(w,h),sx=(w-s)/2,sy=(h-s)/2;g.drawImage(world,sx,sy,s,s,0,0,c.width,c.height);}catch{}
  const t=$('.phone-thumb');t.dataset.has='true';t.classList.remove('pop');void t.offsetWidth;t.classList.add('pop');
  const sh=$('.phone-shutter');sh.classList.remove('press');void sh.offsetWidth;sh.classList.add('press');
 });
 const tick=()=>{$('[data-phone-time]').textContent=clockText();};tick();setInterval(tick,15000);
 navigator.getBattery?.().then(b=>{const f=()=>{$('[data-phone-battery]').textContent=`${Math.round(b.level*100)}%`;};f();b.addEventListener('levelchange',f);}).catch(()=>{});
 paint();
 return {render,get mode(){return last.mode;},root};
}
