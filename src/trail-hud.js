// 즐길거리 HUD(2026-11-06, 기획-2026-11-06-자동걷기-즐길거리.md): 진행 카드의 간식 줄(🍫 n/5 · 🍫 먹기 · ⚡ 빨라짐 0:28)과
// 화면 아래 '즐길거리 줄'(역기 연타 · 벤치에서 일어나기 · 발끝 당기기)과 대상 위 '상호작용 칩'(들르기 4초 · 기구·고양이 버튼, 2026-11-07 모바일 피드백).
// main.js·trail-world.js와는 window 이벤트로만 만난다.
//  읽기: 'hiking:state'(chocolates·chocoLeft·gadget), 'hiking:trail-view'(trail-world.js 요약), 'hiking:trail-chip'(칩 대상 위 점의 클립 좌표), 'hiking:trail' type 'exhaust'(⑥ 헥헥·쥐)
//  쓰기: 'hiking:command' chocolate · trail-play{act,id,manual} · trail-press · trail-stop · cramp-release
import './trail-hud.css';
import {CHOCO_MAX,chocoCount,chocoLeft,formatBoost,trailBarView} from './trail-rules.js';
import {chipScreen} from './trail-chip.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function installTrailHud(doc=document,win=window){
 const app=doc.getElementById('app');if(!app||doc.getElementById('trail-bar'))return null;
 const send=(id,value)=>win.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}}));
 // ── 간식 줄(진행 카드 스테미너 밑)
 const card=app.querySelector('.nb-card'),snack=doc.createElement('div');snack.className='nb-snack';
 snack.innerHTML=`<span id="choco-count" class="nb-snack-chip" aria-label="초콜릿 개수">🍫 ${CHOCO_MAX}/${CHOCO_MAX}</span><button id="choco" type="button" class="nb-snack-eat" title="초콜릿 먹기 · 30초 동안 빨라져요"><span>🍫 먹기</span></button><span id="choco-boost" class="nb-snack-chip boost" role="status" hidden>⚡ 빨라짐 0:30</span>`;
 (card?.querySelector('.nb-stam')??card)?.after(snack);
 const count=snack.querySelector('#choco-count'),eat=snack.querySelector('#choco'),boostChip=snack.querySelector('#choco-boost');
 eat.addEventListener('click',()=>{send('chocolate');eat.blur();});
 // ── 즐길거리 줄
 const bar=doc.createElement('div');bar.id='trail-bar';bar.className='hud-ui';bar.hidden=true;bar.setAttribute('aria-live','polite');app.append(bar);
 // ── 상호작용 칩: 대상 머리 위 작은 쪽지(아이콘+동사). 자리는 매 프레임 'hiking:trail-chip'으로 받는다.
 const chip=doc.createElement('div');chip.id='trail-chip';chip.className='hud-ui tc-off';chip.hidden=true;chip.setAttribute('aria-live','polite');app.append(chip);
 let tv={},st={},boostEnd=0,barSig='',ex=null,clip=null,chipBox=null;
 const busy=()=>!!tv.busy;
 function renderSnack(){
  const n=chocoCount(st),left=Math.max(0,(boostEnd-performance.now())/1000),on=left>0;
  const c=`🍫 ${n}/${CHOCO_MAX}`;if(count.textContent!==c)count.textContent=c;if(count.dataset.n!==String(n))count.dataset.n=n; // 0개면 trail-hud.css가 흐리게
  boostChip.hidden=!on;if(on){const t=`⚡ 빨라짐 ${formatBoost(left)}`;if(boostChip.textContent!==t)boostChip.textContent=t;}
  const dis=n<=0||on||busy();eat.disabled=dis;eat.classList.toggle('off',dis);eat.hidden=on; // 빨라진 동안은 ⚡ 칩이 먹기 버튼 자리에 선다(겹쳐 먹기 막힘)
  const l=n<=0?'🍫 다 먹음':on?'🍫 먹는 중':'🍫 먹기';if(eat.firstElementChild.textContent!==l)eat.firstElementChild.textContent=l;
 }
 function renderBar(){
  const v=trailBarView({act:tv.act,near:tv.near,offer:tv.offer&&{...tv.offer,until:Infinity},auto:!!tv.auto,busy:busy(),now:0,exhaust:ex});
  const sig=JSON.stringify(v);if(sig===barSig)return;barSig=sig;
  const onChip=v.mode==='offer'||v.mode==='near';
  bar.dataset.mode=onChip?'none':v.mode;bar.hidden=onChip||v.mode==='none';chip.dataset.mode=onChip?v.mode:'none';chip.hidden=!onChip;chipBox=null;
  if(v.mode==='offer'){const o=v.offer,[ic,...rest]=String(o.label).split(' ');chip.innerHTML=`<button type="button" class="tc-btn tc-offer" data-act="${esc(o.act)}" data-id="${esc(o.id)}" style="--sec:${o.seconds}s" aria-label="${esc(o.label)} · 들렀다가 자동 걷기를 이어 가요"><em aria-hidden="true">${esc(ic)}</em><b>${esc(rest.join(' '))}</b><i class="tc-time" aria-hidden="true"></i></button>`;}
  else if(v.mode==='near')chip.innerHTML=v.buttons.map(b=>`<button type="button" class="tc-btn" data-act="${esc(b.act)}" data-id="${esc(v.id)}" data-manual="1" aria-label="${esc(b.label)} · ${esc(b.sub)}" title="${esc(b.sub)}"><em aria-hidden="true">${b.ic}</em><b>${esc(b.label)}</b><small>${esc(b.sub)}</small></button>`).join('');
  if(onChip){chip.classList.remove('tc-pop');void chip.offsetWidth;chip.classList.add('tc-pop');bar.innerHTML='';placeChip();return;}
  if(v.mode==='lift')bar.innerHTML=`<button type="button" class="tb-btn tb-lift" data-press="1"><em aria-hidden="true">💪</em><b>들어 올리기 <span>${v.reps}/${v.of}</span></b><span class="tb-gauge" aria-hidden="true">${Array.from({length:v.of},(_,i)=>`<i class="${i<v.reps?'on':''}"></i>`).join('')}</span></button>`;
  else if(v.mode==='cramp')bar.innerHTML=`<button type="button" class="tb-btn tb-cramp" data-cramp="1"><em aria-hidden="true">🦶</em><b>발끝 당기기</b><small>누르면 1초 만에 풀려요</small></button>`;
  else if(v.mode==='stand-up')bar.innerHTML=`<button type="button" class="tb-btn" data-stop="1"><em aria-hidden="true">🧍</em><b>일어나기</b><small>벤치 쉬기 · 스테미너 1.5배</small></button>`;
  else bar.innerHTML='';
 }
 // 역기는 빠르게 연타하므로 pointerdown에서 바로 센다(click 지연·더블탭 확대 없이). 다른 버튼은 click.
 bar.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-press]');if(!b)return;e.preventDefault();send('trail-press');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit');});
 const onClick=e=>{const b=e.target.closest('button');if(!b)return;b.blur();
  if(b.dataset.press){if(e.detail===0)send('trail-press');return;} // 키보드(Enter·Space)로 누른 경우
  if(b.dataset.stop){send('trail-stop');return;}
  if(b.dataset.cramp){send('cramp-release');return;}
  if(b.dataset.act)send('trail-play',{act:b.dataset.act,id:b.dataset.id,manual:!!b.dataset.manual});};
 bar.addEventListener('click',onClick);chip.addEventListener('click',onClick);
 // 칩 자리: 대상 위 점을 화면에 놓고, 칩이 안전 영역·수첩 탭(아래)에 걸리지 않는 상자 안으로 당긴다.
 // 카메라 뒤면 숨긴다. 단 들르기(4초 안에 눌러야 함)는 화면 아래 가운데에 고정한다.
 const px=v=>parseFloat(v)||0;
 function measureBox(){const W=win.innerWidth,H=win.innerHeight,cs=win.getComputedStyle(doc.documentElement),m=8,cw=chip.offsetWidth||140,ch=chip.offsetHeight||44;
  const tabs=app.querySelector('.nb-tabs'),tb=tabs&&tabs.offsetParent?tabs.getBoundingClientRect().top:H-px(cs.getPropertyValue('--sb'));
  return {W,H,box:{left:px(cs.getPropertyValue('--sl'))+m+cw/2,right:W-px(cs.getPropertyValue('--sr'))-m-cw/2,top:px(cs.getPropertyValue('--st'))+m+ch+8,bottom:Math.min(H,tb)-m}};}
 // 상자는 1초마다 다시 잰다(안전 영역 값·칩 폭은 회전·주소창·문구에 따라 resize 없이도 바뀐다)
 function placeChip(){if(chip.hidden)return;const t=performance.now();if(!chipBox||t-chipBox.at>1000)chipBox={...measureBox(),at:t};const {W,H,box}=chipBox;
  let r=clip?chipScreen(clip,{width:W,height:H,box}):{mode:'off'};
  if(r.mode==='off'&&chip.dataset.mode==='offer')r={mode:'edge',x:W/2,y:box.bottom};
  chip.classList.toggle('tc-off',r.mode==='off');chip.classList.toggle('tc-edge',r.mode==='edge');chip.dataset.at=r.mode;
  if(r.mode!=='off')chip.style.transform=`translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0) translate(-50%,-100%)`;}
 win.addEventListener('hiking:trail-chip',e=>{clip=e.detail;placeChip();});
 win.addEventListener('resize',()=>{chipBox=null;});
 win.addEventListener('hiking:trail-view',e=>{tv=e.detail??{};renderBar();renderSnack();});
 // ⑥ 헥헥·쥐: 쥐가 나면 발끝 당기기 버튼, 스테미너 칸에 '쥐 0:02'
 const stam=card?.querySelector('.nb-stam'),crampTag=doc.createElement('span');crampTag.className='nb-cramp';crampTag.hidden=true;stam?.append(crampTag);
 win.addEventListener('hiking:trail',e=>{const d=e.detail;if(d?.type!=='exhaust')return;ex={phase:d.phase,release:!!d.release};crampTag.hidden=!d.label;if(d.label&&crampTag.textContent!==d.label)crampTag.textContent=d.label;renderBar();});
 win.addEventListener('hiking:state',e=>{st=e.detail??{};boostEnd=performance.now()+chocoLeft(st)*1000;
  const g=st.gadget&&st.gadget!=='none';bar.classList.toggle('tb-gadget',!!g);chip.classList.toggle('tb-gadget',!!g);snack.classList.toggle('tb-gadget',!!g);renderSnack();});
 const timer=setInterval(renderSnack,250);
 renderSnack();
 return {bar,chip,snack,dispose(){clearInterval(timer);bar.remove();chip.remove();snack.remove();}};
}
