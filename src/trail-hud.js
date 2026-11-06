// 즐길거리 HUD(2026-11-06, 기획-2026-11-06-자동걷기-즐길거리.md): 진행 카드의 간식 줄(🍫 n/5 · 🍫 먹기 · ⚡ 빨라짐 0:28)과
// 화면 아래 '즐길거리 줄'(들르기 4초 · 기구 버튼 · 역기 연타 · 벤치에서 일어나기). main.js·trail-world.js와는 window 이벤트로만 만난다.
//  읽기: 'hiking:state'(chocolates·chocoLeft·gadget), 'hiking:trail-view'(trail-world.js 요약), 'hiking:trail' type 'exhaust'(⑥ 헥헥·쥐)
//  쓰기: 'hiking:command' chocolate · trail-play{act,id,manual} · trail-press · trail-stop · cramp-release
import './trail-hud.css';
import {CHOCO_MAX,chocoCount,chocoLeft,formatBoost,trailBarView} from './trail-rules.js';

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
 let tv={},st={},boostEnd=0,barSig='',ex=null;
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
  bar.dataset.mode=v.mode;bar.hidden=v.mode==='none';
  if(v.mode==='offer'){const o=v.offer;bar.innerHTML=`<button type="button" class="tb-btn tb-offer" data-act="${esc(o.act)}" data-id="${esc(o.id)}" style="--sec:${o.seconds}s"><b>${esc(o.label)}</b><small>들렀다가 자동 걷기를 이어 가요</small><i class="tb-time" aria-hidden="true"></i></button>`;}
  else if(v.mode==='near')bar.innerHTML=v.buttons.map(b=>`<button type="button" class="tb-btn" data-act="${esc(b.act)}" data-id="${esc(v.id)}" data-manual="1"><em aria-hidden="true">${b.ic}</em><b>${esc(b.label)}</b><small>${esc(b.sub)}</small></button>`).join('');
  else if(v.mode==='lift')bar.innerHTML=`<button type="button" class="tb-btn tb-lift" data-press="1"><em aria-hidden="true">💪</em><b>들어 올리기 <span>${v.reps}/${v.of}</span></b><span class="tb-gauge" aria-hidden="true">${Array.from({length:v.of},(_,i)=>`<i class="${i<v.reps?'on':''}"></i>`).join('')}</span></button>`;
  else if(v.mode==='cramp')bar.innerHTML=`<button type="button" class="tb-btn tb-cramp" data-cramp="1"><em aria-hidden="true">🦶</em><b>발끝 당기기</b><small>누르면 1초 만에 풀려요</small></button>`;
  else if(v.mode==='stand-up')bar.innerHTML=`<button type="button" class="tb-btn" data-stop="1"><em aria-hidden="true">🧍</em><b>일어나기</b><small>벤치 쉬기 · 스테미너 1.5배</small></button>`;
  else bar.innerHTML='';
 }
 // 역기는 빠르게 연타하므로 pointerdown에서 바로 센다(click 지연·더블탭 확대 없이). 다른 버튼은 click.
 bar.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-press]');if(!b)return;e.preventDefault();send('trail-press');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit');});
 bar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;b.blur();
  if(b.dataset.press){if(e.detail===0)send('trail-press');return;} // 키보드(Enter·Space)로 누른 경우
  if(b.dataset.stop){send('trail-stop');return;}
  if(b.dataset.cramp){send('cramp-release');return;}
  if(b.dataset.act)send('trail-play',{act:b.dataset.act,id:b.dataset.id,manual:!!b.dataset.manual});});
 win.addEventListener('hiking:trail-view',e=>{tv=e.detail??{};renderBar();renderSnack();});
 // ⑥ 헥헥·쥐: 쥐가 나면 발끝 당기기 버튼, 스테미너 칸에 '쥐 0:02'
 const stam=card?.querySelector('.nb-stam'),crampTag=doc.createElement('span');crampTag.className='nb-cramp';crampTag.hidden=true;stam?.append(crampTag);
 win.addEventListener('hiking:trail',e=>{const d=e.detail;if(d?.type!=='exhaust')return;ex={phase:d.phase,release:!!d.release};crampTag.hidden=!d.label;if(d.label&&crampTag.textContent!==d.label)crampTag.textContent=d.label;renderBar();});
 win.addEventListener('hiking:state',e=>{st=e.detail??{};boostEnd=performance.now()+chocoLeft(st)*1000;
  const g=st.gadget&&st.gadget!=='none';bar.classList.toggle('tb-gadget',!!g);snack.classList.toggle('tb-gadget',!!g);renderSnack();});
 const timer=setInterval(renderSnack,250);
 renderSnack();
 return {bar,snack,dispose(){clearInterval(timer);bar.remove();snack.remove();}};
}
