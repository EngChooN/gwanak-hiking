// 상호작용 화면. 게임 상태는 모르고, 컨트롤러(interaction-controller.js)가 넘기는 값만 그린다.
// 조작은 gadget-ui.js와 같은 방식으로 'hiking:command'(interact·choice-2·choice-3·panel-close·page-prev·page-next·stamps-toggle·card-open·emote-pick)로 되돌린다.
import './interaction-ui.css';
import {CHIP_LABEL,NOT_SIGN_NOTICE,CARD_NOTICE,STAMPS} from './interaction-data.js';
import {clock,TAPE_HALF} from './interaction-logic.js';

const FONT="-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
// 완등 기록 카드 1080×1350 PNG. "실제 등산 기록이 아닙니다" 문구는 데이터와 무관하게 항상 그린다.
export function drawCard(canvas,d){
 const g=canvas.getContext('2d'),W=1080,H=1350;canvas.width=W;canvas.height=H;
 const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0f2d27');bg.addColorStop(1,'#1d4a3e');g.fillStyle=bg;g.fillRect(0,0,W,H);
 g.strokeStyle='#e4d6aa55';g.lineWidth=2;roundRect(g,30,30,W-60,H-60,28);g.stroke();
 g.fillStyle='#cdd9c4';g.font=`600 26px ${FONT}`;g.textAlign='left';g.fillText('산길 · GWANAK TRAIL',72,100);g.textAlign='right';g.fillText(d.date,W-72,100);
 g.textAlign='left';g.fillStyle='#f4f1e8';g.font=`800 104px ${FONT}`;g.fillText('관악산 완등',72,214);
 g.fillStyle='#e4d6aa';g.font=`500 34px ${FONT}`;g.fillText('서울대 계곡 코스 · 연주대',76,266);
 g.save();roundRect(g,72,310,936,620,26);g.clip();
 const img=d.photo,iw=img?.naturalWidth??img?.width,ih=img?.naturalHeight??img?.height;
 if(img&&iw&&ih){const s=Math.max(936/iw,620/ih),w=iw*s,h=ih*s;g.drawImage(img,72+(936-w)/2,310+(620-h)/2,w,h);}
 else{const sg=g.createLinearGradient(0,310,0,930);sg.addColorStop(0,'#9cc6dc');sg.addColorStop(.55,'#d3e2e2');sg.addColorStop(.56,'#7b8f73');sg.addColorStop(1,'#4f7a56');g.fillStyle=sg;g.fillRect(72,310,936,620);
  g.fillStyle='#ffffffb0';g.font=`600 28px ${FONT}`;g.textAlign='center';g.fillText('찍은 사진이 없으면 풍경 자리',540,640);}
 const og=g.createLinearGradient(0,810,0,930);og.addColorStop(0,'#0000');og.addColorStop(1,'#0c211ccc');g.fillStyle=og;g.fillRect(72,810,936,120);g.restore();
 g.textAlign='left';g.fillStyle='#fff';g.font=`600 26px ${FONT}`;g.fillText(`정상석 앞 · ${d.time}${d.weather?' · '+d.weather:''}`,100,908);
 [['걸은 시간',d.elapsed],['거리',d.distanceKm],['오른 높이',d.ascent],['스탬프',d.stampText]].forEach((s,i)=>{const x=72+i*236;g.fillStyle='#bdcbbf';g.font=`500 24px ${FONT}`;g.fillText(s[0],x,990);g.fillStyle='#f4f1e8';g.font=`700 50px ${FONT}`;g.fillText(s[1],x,1052);});
 d.stamps.forEach((s,i)=>{const x=72+44+i*(936/6)+10,y=1150;g.save();g.translate(x,y);g.rotate(s.tilt*Math.PI/180);g.strokeStyle=s.got?'#e9b3a8':'#ffffff33';g.lineWidth=4;g.beginPath();g.arc(0,0,46,0,7);g.stroke();g.lineWidth=2;g.beginPath();g.arc(0,0,38,0,7);g.stroke();
  g.fillStyle=s.got?'#e9b3a8':'#ffffff33';g.font=`800 42px ${FONT}`;g.textAlign='center';g.fillText(s.glyph,0,15);g.restore();g.fillStyle='#cdd9c4';g.font=`500 20px ${FONT}`;g.textAlign='center';g.fillText(s.name.slice(0,6),x,1224);});
 g.textAlign='left';g.fillStyle='#9fb0a0';g.font=`500 22px ${FONT}`;g.fillText(CARD_NOTICE,72,1296);g.textAlign='right';g.fillStyle='#e4d6aa';g.font=`700 26px ${FONT}`;g.fillText(d.nickname,W-72,1296);
 return canvas;
}
// 인증샷 틀을 캔버스(저장 사진)에 그린다. 크림색 테두리 + 「정상 인증」 배지 + 아래 띠(장소·날짜·시각·날씨·닉네임).
export function drawPhotoFrame(g,w,h,info){
 const m=Math.round(Math.min(w,h)*.022),fs=Math.max(14,Math.round(Math.min(w,h)*.026));
 g.save();g.strokeStyle='#f1ead2cc';g.lineWidth=Math.max(2,m*.12);roundRect(g,m,m,w-2*m,h-2*m,fs*.7);g.stroke();
 g.font=`800 ${fs}px ${FONT}`;const bw=g.measureText('정상 인증').width+fs*1.6;g.fillStyle='#f1ead2';roundRect(g,m*2,m*2+fs*.4,bw,fs*2,fs);g.fill();g.fillStyle='#254034';g.textAlign='left';g.fillText('정상 인증',m*2+fs*.8,m*2+fs*.4+fs*1.4);
 const bh=fs*4,by=h-m-bh,grad=g.createLinearGradient(0,by,0,h-m);grad.addColorStop(0,'#0000');grad.addColorStop(.5,'#0c211ce6');grad.addColorStop(1,'#0c211ce6');g.fillStyle=grad;g.fillRect(m,by,w-2*m,bh);
 g.fillStyle='#fff';g.font=`700 ${fs*1.25}px ${FONT}`;g.fillText('연주대 정상석 · 관악산',m*2,h-m-fs*1.2);g.font=`500 ${fs*.8}px ${FONT}`;g.fillStyle='#e9e8d9';g.fillText(`${info.date} ${info.time}${info.weather?' · '+info.weather:''}`,m*2,h-m-fs*.35);
 g.textAlign='right';g.font=`700 ${fs}px ${FONT}`;g.fillStyle='#e4d6aa';g.fillText(info.nickname,w-m*2,h-m-fs*.5);g.restore();
}

export function mountInteractionUI(doc=document,win=window){
 const root=doc.createElement('div');root.id='interaction-ui';
 root.innerHTML=`<div class="ix-markers"></div><div class="ix-vignette"></div><div class="ix-pill-wrap" hidden></div><div class="ix-action" hidden></div><div class="ix-toast" hidden></div>
 <div class="ix-scrim" hidden></div><div class="ix-board" role="dialog" aria-label="안내판" hidden></div><div class="ix-book" role="dialog" aria-label="스탬프 수첩" hidden></div><div class="ix-card" hidden><canvas></canvas><div class="row"></div></div><div class="ix-wheel" hidden></div>`;
 const bino=doc.createElement('div');bino.id='ix-bino';bino.innerHTML='<div class="ix-tape"></div><div class="ix-labels"></div><div class="ix-edges"></div><div class="ix-bino-note" hidden></div><div class="ix-focus" hidden></div><button type="button" class="ix-tagbtn">이름표 <kbd>N</kbd></button>';
 const frame=doc.createElement('div');frame.id='ix-frame';frame.hidden=true;frame.innerHTML='<div class="brd"></div><div class="badge">정상 인증</div><div class="band"></div>';
 doc.body.append(root,bino,frame);
 const $=s=>root.querySelector(s),send=(id,value)=>win.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}}));
 const stop=e=>e.stopPropagation();
 bino.querySelector('.ix-tagbtn').addEventListener('click',()=>send('labels-toggle'));
 for(const el of [root,bino])el.addEventListener('pointerdown',e=>{if(e.target.closest('button,.ix-board,.ix-book,.ix-card,.ix-scrim,.ix-focus'))e.stopPropagation();});
 const markers=$('.ix-markers'),pillWrap=$('.ix-pill-wrap'),actionEl=$('.ix-action'),toastEl=$('.ix-toast'),scrim=$('.ix-scrim'),boardEl=$('.ix-board'),bookEl=$('.ix-book'),cardEl=$('.ix-card'),wheelEl=$('.ix-wheel'),vignette=$('.ix-vignette');
 let toastTimer=0,pillSig='',board=null,boardIndex=0,cardCanvas=cardEl.querySelector('canvas'),markerEls=new Map(),lastCardData=null;
 // ── 알약 ──
 // 세상 속 줄(where:'world')은 등산 수첩 HUD의 빨간 도장(첫 줄)·상황 꼬리표(나머지 줄)가 그린다(hud-notebook.js).
 // 휴대폰 화면 안 줄(where:'phone')만 여기서 휴대폰 틀 위 꼬리표로 그린다.
 const sendView=v=>win.dispatchEvent(new CustomEvent('hiking:interact-view',{detail:v}));
 function setPill(view){
  if(!view){if(pillSig!==''){pillSig='';pillWrap.hidden=true;pillWrap.replaceChildren();sendView(null);}return;}
  const sig=JSON.stringify([view.rows,view.where]);
  if(view.where!=='phone'){if(sig!==pillSig){pillSig=sig;pillWrap.hidden=true;pillWrap.replaceChildren();sendView({rows:view.rows,where:'world'});}return;}
  if(pillSig&&!pillSig.endsWith('"phone"]'))sendView(null);
  if(view.where==='phone'&&view.rect){pillWrap.dataset.where='phone';pillWrap.style.left=`${view.rect.cx}px`;pillWrap.style.top=`${view.rect.top-12}px`;pillWrap.style.transform='translate(-50%,-100%)';}
  else{pillWrap.dataset.where='world';pillWrap.style.left=pillWrap.style.top='';pillWrap.style.transform='';}
  if(sig===pillSig)return;pillSig=sig;pillWrap.hidden=false;
  pillWrap.replaceChildren(...view.rows.map((r,i)=>{const b=doc.createElement('button');b.type='button';b.className=`ix-pill${i?' sub':''}${r.state==='done'?' done':r.state==='lock'?' lock':''}`;b.dataset.num=String(i+1);
   b.innerHTML=`<kbd class="key">${esc(r.key)}</kbd><span><b>${esc(r.label)}</b>${r.state==='lock'&&r.reason?`<small>${esc(r.reason)}</small>`:r.sub?`<small>${esc(r.sub)}</small>`:''}</span>`;
   b.setAttribute('aria-label',`${r.label} (${r.key})`);b.addEventListener('pointerdown',stop);b.addEventListener('click',()=>{b.blur();send(i?`choice-${i+1}`:'interact');});return b;}));
  pillWrap.setAttribute('aria-live','polite');
 }
 // ── 월드 마커(15m 안 점) ──
 function setMarkers(list){
  const seen=new Set();
  for(const m of list){seen.add(m.id);let el=markerEls.get(m.id);if(!el){el=doc.createElement('div');el.className='ix-marker';markerEls.set(m.id,el);markers.append(el);}
   el.classList.toggle('far',!!m.far);el.textContent=m.far?'':m.glyph;el.style.transform=`translate(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px)`;}
  for(const [id,el] of markerEls)if(!seen.has(id)){el.remove();markerEls.delete(id);}
 }
 // ── 행동 진행 ──
 let actionSig='';
 function setAction(m){
  win.dispatchEvent(new CustomEvent('hiking:action-view',{detail:m?{label:m.label,step:m.step,progress:m.progress,breath:!!m.breath}:null}));
  if(!m){actionEl.hidden=true;actionSig='';vignette.classList.remove('on');return;}
  const sig=m.label+'|'+m.step;if(sig!==actionSig){actionSig=sig;actionEl.innerHTML=`${m.breath?'<div class="ix-breath"></div>':''}<b>${esc(m.label)}</b><small>${esc(m.step)}</small><div class="bar"><i></i></div><small>${esc(m.hint)}</small>`;}
  actionEl.hidden=false;actionEl.querySelector('.bar i').style.width=`${Math.round(m.progress*100)}%`;vignette.classList.toggle('on',m.tint==='water');
 }
 function toast(text,{ms=2600}={}){clearTimeout(toastTimer);toastEl.className='ix-toast plain';toastEl.innerHTML=`<div class="tx"><b>${esc(text)}</b></div>`;toastEl.hidden=false;toastTimer=setTimeout(()=>{toastEl.hidden=true;},ms);}
 const stampHtml=(s,sz,cls='')=>`<div class="ix-stp ${cls}" style="--sz:${sz}px;--rot:${s.tilt}deg"><span>${s.glyph}</span></div>`;
 function stampToast(m){
  clearTimeout(toastTimer);toastEl.className='ix-toast';
  toastEl.innerHTML=`${stampHtml(m.stamp,92,'slam')}<div class="tx"><b>스탬프 ${m.count}/6 · ${esc(m.stamp.name)}</b><small>${esc(m.detail)}</small><div class="bar"><i style="width:${m.count/6*100}%"></i></div></div>`;
  toastEl.hidden=false;toastTimer=setTimeout(()=>{toastEl.hidden=true;},3200);
 }
 // ── 안내판 패널 ──
 function renderBoard(){
  const p=board.pages[boardIndex],multi=board.pages.length>1;
  const rows=(p.rows??[]).map(r=>`<div class="ix-signrow"><span class="arr"><span style="transform:rotate(${r.angle.toFixed(3)}rad)">↑</span></span><b>${esc(r.text)}</b><small>${esc(r.hint)}</small></div>`).join('');
  boardEl.innerHTML=`<div class="eyebrow"><span>${esc(board.eyebrow)}</span><em>${multi?`${boardIndex+1} / ${board.pages.length}`:''}</em></div><h2>${esc(p.title)}</h2>${rows}${(p.body??[]).map(t=>`<p>${esc(t)}</p>`).join('')}
   ${p.chips?.length?`<div class="ix-chips">${p.chips.map(c=>`<span class="ix-chip ${c.kind}">${CHIP_LABEL[c.kind]} · ${esc(c.text)}</span>`).join('')}</div>`:''}
   <div class="src">${esc(p.source)}</div><div class="why">${esc(board.notice??NOT_SIGN_NOTICE)}</div>
   <div class="foot"><div>${multi?`<button type="button" data-a="prev" aria-label="이전 쪽">◀</button> <button type="button" data-a="next" aria-label="다음 쪽">▶</button>`:''}</div><div class="ix-dots">${board.pages.map((_,i)=>`<i class="${i===boardIndex?'on':''}"></i>`).join('')}</div><button type="button" data-a="close">닫기 <kbd>F</kbd></button></div>`;
 }
 function openBoard(model){board=model;boardIndex=0;renderBoard();boardEl.hidden=scrim.hidden=false;}
 function closeBoard(){board=null;boardEl.hidden=scrim.hidden=true;}
 function stepBoard(d){if(!board||board.pages.length<2)return false;boardIndex=(boardIndex+d+board.pages.length)%board.pages.length;renderBoard();return true;}
 boardEl.addEventListener('click',e=>{const a=e.target.closest('button')?.dataset.a;if(a==='close')send('panel-close');else if(a==='prev')stepBoard(-1);else if(a==='next')stepBoard(1);});
 scrim.addEventListener('click',()=>send('panel-close'));
 // 모바일: 시트를 아래로 끌어 닫기
 {let y0=null;boardEl.addEventListener('pointerdown',e=>{y0=e.clientY;});boardEl.addEventListener('pointerup',e=>{if(y0!==null&&e.clientY-y0>90&&boardEl.scrollTop<=0)send('panel-close');y0=null;});}
 // ── 수첩 ──
 function openBook(m){
  const slots=m.slots.map(s=>s.got?`<div class="ix-slot">${stampHtml(s,m.small?84:128)}<b>${esc(s.name)}</b><small>${clock(s.at)} · ${s.recKm.toFixed(2)}km · ${Math.round(s.recElev)}m</small></div>`
   :`<div class="ix-slot todo"><div class="ix-stp empty" style="--sz:${m.small?84:128}px"><span>${s.n}</span></div><b>${esc(s.name)}</b><small>${s.next?'다음 · ':''}${s.ahead.toFixed(1)}km 앞</small></div>`).join('');
  const pts=STAMPS.map(s=>[s.km/5*1020+30,64-(s.elev-99)/540*50]);
  const prof=`<svg viewBox="0 0 1080 74" preserveAspectRatio="none"><path d="M30 66 C300 60 500 40 800 22 L1050 14 V74 H30Z" fill="#25403420"/><path d="M30 66 C300 60 500 40 800 22 L1050 14" fill="none" stroke="#25403488" stroke-width="2"/>${pts.map((p,i)=>{const got=m.slots[i].got;return `<circle cx="${p[0]}" cy="${p[1]}" r="${got?9:6}" fill="${got?'#b3382a':'#f1ead2'}" stroke="${got?'#b3382a':'#8a9a82'}" stroke-width="2.5"/>`;}).join('')}</svg>`;
  bookEl.innerHTML=`<div class="hd"><h2>스탬프 수첩<small>서울대 계곡 코스</small></h2><div style="display:flex;align-items:center;gap:14px"><div><div style="display:flex;justify-content:space-between;font-size:13px;color:#dbdfc5;margin-bottom:4px"><span>모은 스탬프</span><b style="color:#f4d67c">${m.count} / 6</b></div><div class="prog"><i style="width:${m.count/6*100}%"></i></div></div><button class="btn" type="button" data-a="close" aria-label="수첩 닫기">✕ <kbd>J</kbd></button></div></div>
   <div class="pg"><div class="ix-slots">${slots}</div><div class="ix-prof">${prof}</div><div class="ix-profl"><span>일주문 99m</span><span>정상 629m</span></div></div>
   ${m.fun?`<div class="ix-fun"><b>즐길거리</b>${m.fun.map(f=>`<div class="ix-fun-slot${f.got?' got':''}"><div class="ix-stp ${f.got?'':'empty'}" style="--sz:${m.small?56:72}px;--rot:-6deg"><span>${f.got?esc(f.glyph):'?'}</span></div><span><b>${esc(f.name)}</b><small>${f.got?clock(f.at):esc(f.hint)}</small></span></div>`).join('')}</div>`:''}
   <div class="cardbtn"><span>스탬프 위치는 지도 기준 후보 · 현장 표지와 다를 수 있어요</span><button type="button" class="btn ${m.canCard?'ix-btn-gold':''}" data-a="card" ${m.canCard?'':'disabled style="opacity:.5"'}>${m.canCard?'완등 기록 카드 보기':'정상 스탬프가 남았어요'}</button></div>
   <div class="stats">${esc(m.stats)}</div>`;
  bookEl.hidden=scrim.hidden=false;
 }
 function closeBook(){bookEl.hidden=true;if(!board)scrim.hidden=true;}
 bookEl.addEventListener('click',e=>{const a=e.target.closest('button')?.dataset.a;if(a==='close')send('stamps-toggle');else if(a==='card')send('card-open');});
 // ── 완등 카드 ──
 function openCard(data,{canShare=false,filename='관악산-완등.png'}={}){
  lastCardData=data;drawCard(cardCanvas,data);const row=cardEl.querySelector('.row');row.replaceChildren();
  const mk=(t,fn,cls='')=>{const b=doc.createElement('button');b.type='button';b.textContent=t;if(cls)b.className=cls;b.addEventListener('click',fn);row.append(b);return b;};
  mk('저장',()=>{const a=doc.createElement('a');a.download=filename;a.href=cardCanvas.toDataURL('image/png');doc.body.append(a);a.click();a.remove();},'ix-btn-gold');
  if(canShare)mk('공유',()=>cardCanvas.toBlob(async blob=>{try{const f=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'관악산 완등 기록'});else mk('이 기기는 공유를 지원하지 않아요',()=>{});}catch{}}));
  mk('닫기',()=>send('panel-close'));cardEl.hidden=false;
 }
 function closeCard(){cardEl.hidden=true;}
 // ── 쌍안경 이름표 ──
 let tapeSig='';
 function setBino(m){
  if(!m){bino.classList.remove('on');return;}
  bino.classList.add('on');
  const tape=bino.querySelector('.ix-tape'),px=tape.clientWidth/(TAPE_HALF*2),c=tape.clientWidth/2;
  const sig=Math.round(m.bearing*5)+'|'+m.tape.map(t=>t.id+Math.round(t.delta*5)).join(',')+'|'+tape.clientWidth;
  if(sig!==tapeSig){tapeSig=sig;let h='';for(let b=-TAPE_HALF;b<=TAPE_HALF;b++){const deg=m.bearing+b,rounded=Math.round(deg),off=(rounded-m.bearing)*px,x=c+off;if(Math.abs(rounded-m.bearing)>TAPE_HALF)continue;const major=rounded%5===0;h+=`<i class="tk${major?' m':''}" style="left:${x}px"></i>`;if(major)h+=`<span class="tn" style="left:${x}px;top:${tape.clientHeight*.48}px">${((rounded%360)+360)%360}°</span>`;}
   const ends=[-1e9,-1e9,-1e9];[...m.tape].sort((a,b)=>a.delta-b.delta).forEach(t=>{const x=c+t.delta*px,w=t.short.length*15+14;let r=ends.findIndex(e=>x-w/2>e);if(r<0)r=0;ends[r]=x+w/2;h+=`<span class="mk${t.directionOnly?' dirOnly':''}" style="left:${x}px;top:${2+r*17}px">${esc(t.short)}</span>`;});h+='<i class="cur"></i>';tape.innerHTML=h;}
  bino.querySelector('.ix-labels').innerHTML=m.labels.map(l=>`<div class="ix-lm${l.focus?' focus':''}${l.dim?' dim':''}${l.directionOnly?' dirOnly':''}" style="left:${l.x}px;top:${l.y}px"><span class="tag">${esc(l.name)}${l.sub?`<small>${esc(l.sub)}</small>`:''}</span>${l.directionOnly?'':`<i class="ln" style="height:${l.rise}px"></i><i class="dot"></i>`}</div>`).join('');
  bino.querySelector('.ix-edges').innerHTML=m.edges.map(e=>`<div class="ix-edge ${e.delta<0?'l':'r'}${e.directionOnly?' dirOnly':''}">${e.delta<0?'◀ ':''}${esc(e.text)}${e.delta>0?' ▶':''}</div>`).join('');
  const note=bino.querySelector('.ix-bino-note');note.hidden=!m.note;note.textContent=m.note??'';
  const f=bino.querySelector('.ix-focus');f.hidden=!m.focus;if(m.focus){const k=`${m.focus.name}|${m.focus.lines.join('|')}`;if(f.dataset.k!==k){f.dataset.k=k;f.innerHTML=`<span class="key">F</span><div><b>${esc(m.focus.name)}</b><small>${m.focus.lines.map(esc).join('<br>')}</small></div>`;f.onclick=()=>send('interact');}}
 }
 // ── 인사 메뉴(X 누르고 있기, 멀티 전용) ──
 function showWheel(items,selected=-1,center=''){
  wheelEl.hidden=false;wheelEl.innerHTML=items.map((it,i)=>`<button type="button" data-i="${i}" class="${i===selected?'sel':''}"><span class="e">${it.icon}</span>${esc(it.label)}<kbd>${i+1}</kbd></button>`).join('')+`<div class="c">${esc(center)}</div>`;
  for(const b of wheelEl.querySelectorAll('button'))b.addEventListener('click',()=>send('emote-pick',Number(b.dataset.i)));
 }
 const hideWheel=()=>{wheelEl.hidden=true;};
 // ── 인증샷 틀(휴대폰 화면 위 오버레이) ──
 function setFrame(on,rect,info){
  frame.hidden=!on||!rect;if(frame.hidden)return;const m=Math.round(Math.min(rect.width,rect.height)*.03);
  Object.assign(frame.querySelector('.brd').style,{left:`${rect.left+m}px`,top:`${rect.top+m}px`,width:`${rect.width-2*m}px`,height:`${rect.height-2*m}px`});
  Object.assign(frame.querySelector('.badge').style,{left:`${rect.left+m*2}px`,top:`${rect.top+m*3}px`});
  const band=frame.querySelector('.band');Object.assign(band.style,{left:`${rect.left+m}px`,top:`${rect.top+rect.height-m-48}px`,width:`${rect.width-2*m}px`,height:'48px'});
  band.innerHTML=`<div><b>연주대 정상석 · 관악산</b>${esc(info.date)} ${esc(info.time)}${info.weather?' · '+esc(info.weather):''}</div><div>${esc(info.nickname)}</div>`;
 }
 return {root,setPill,setMarkers,setAction,toast,stampToast,openBoard,closeBoard,stepBoard,openBook,closeBook,openCard,closeCard,setBino,showWheel,hideWheel,setFrame,
  get boardOpen(){return !!board;},get bookOpen(){return !bookEl.hidden;},get cardOpen(){return !cardEl.hidden;},get boardPages(){return board?.pages.length??0;},get lastCard(){return lastCardData;},cardCanvas};
}
