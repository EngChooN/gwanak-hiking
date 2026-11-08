// HUD: 로비·수첩 카드·흡연 버튼·재떨이로 가기·채팅창+말풍선·이모트·설정. 모양은 hud.css(등산 수첩 종이 톤).
// 함께 단추(불 빌리기·한 대 권하기·받기·수다 대답 칩)는 npcs.social()을 읽어 띄우고 npcs.borrowLight·offerCig·acceptCig·choose를 부른다.
// 다른 모듈과는 ctx·window 이벤트로만: 'lounge:chat' {id,name,text}(받기·보내기), 'lounge:emote' {emote}(내가 이모트), 'lounge:smoke'(흡연 쪽이 보냄).
import './hud.css';
import {OUTFITS} from './outfit.js';
import {quitStats,attachRecord,todayCigs} from './profile.js';
import {CIG_KINDS,DRAW,cigKind,drawQuality} from './smoke-feel.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date(Date.now()+9*3600e3).toISOString().slice(0,10); // 서울 날짜
const won=n=>n.toLocaleString('ko-KR')+'원';
const EMOTES=[{k:'wave',i:'👋',t:'인사'},{k:'sigh',i:'😮‍💨',t:'한숨'},{k:'stretch',i:'🙆',t:'기지개'}];
const TIMES=[['auto','지금'],['day','낮'],['dusk','노을'],['night','밤']];

export function createHud({ctx,npcs,smoker,audio,timeState,TIME_PRESETS,profile,onProfile,goTo}){
 const root=document.getElementById('app')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'app'}));
 const THREE=ctx.THREE;
 const save=p=>onProfile(p);
 const stats=()=>{const s=profile.stats,t=s.today?.date===today()?s.today:{date:today(),cigs:0,chats:0};return t;};
 const bump=(key,extra={})=>{const t={...stats()};if(key)t[key]=(t[key]||0)+1;save({stats:{...profile.stats,today:t,...extra}});};
 root.innerHTML=`
 <div class="lg-bubbles"></div>
 <div class="lg-top">
  <section class="lg-card lg-note" aria-label="수첩 카드"></section>
  <div class="lg-top-r"><button class="lg-btn" data-a="snd" aria-label="소리">🔊</button><button class="lg-btn" data-a="set" aria-label="설정">⚙️</button></div>
 </div>
 <div class="lg-bottom">
  <div class="lg-chat"><div class="lg-log" aria-live="polite"></div>
   <form class="lg-form"><button type="button" class="lg-btn lg-chat-toggle" data-a="chat" aria-label="채팅 열기">💬</button><input type="text" maxlength="60" placeholder="한마디 해 보세요" autocomplete="off" aria-label="채팅"><button class="lg-btn primary" type="submit">보내기</button></form></div>
  <div class="lg-dock"><div class="grp chips" aria-label="대답 고르기"></div><div class="grp social"></div><div class="grp smoke"></div><div class="grp tools"></div></div>
 </div>
 <div class="lg-toast" hidden></div>
 <div class="lg-modal" hidden></div>`;
 const $=s=>root.querySelector(s);
 const bubLayer=$('.lg-bubbles'),note=$('.lg-note'),log=$('.lg-log'),form=$('.lg-form'),input=form.querySelector('input'),smokeBox=$('.smoke'),toolBox=$('.tools'),socialBox=$('.social'),chipBox=$('.chips'),toast=$('.lg-toast'),modal=$('.lg-modal'),chatBox=$('.lg-chat');
 // 키보드로 채팅 칠 때 이동키가 먹히지 않게
 for(const ev of ['keydown','keyup'])input.addEventListener(ev,e=>e.stopPropagation());
 let folded=matchMedia('(max-height:540px)').matches;

 // ── 흡연 단추(꺼내기 → 불 → 들이마시기·재 털기·꽁초 버리기)
 let stage='idle',stageAt=0;
 const setStage=s=>{if(stage!==s){stage=s;stageAt=performance.now();renderSmoke();}};
 const showToast=t=>{toast.textContent=t;toast.hidden=false;toast.style.opacity=1;clearTimeout(showToast.h);showToast.h=setTimeout(()=>{toast.style.opacity=0;setTimeout(()=>{toast.hidden=true;},400);},1800);};
 function nearestAshtray(){const l=ctx.rooftop.spots.ashtrays??[];return l.slice().sort((a,b)=>Math.hypot(a.x-ctx.player.x,a.z-ctx.player.z)-Math.hypot(b.x-ctx.player.x,b.z-ctx.player.z))[0];}
 let tricksOpen=false,drawing=false;
 const KIND_KEYS=Object.keys(CIG_KINDS);
 const act={
  take(){setStage('choose');}, // 꺼낼 때 담배 종류부터 고른다
  kind(k){k=cigKind(k);if(!smoker.start?.(k))return;save({cigKind:k});setStage('held');},
  cancel(){setStage('idle');},
  light(){smoker.light?.();setStage('lit');bump('cigs',{cigs:(profile.stats.cigs||0)+1});},
  puff(){smoker.puff?.();bump(null,{puffs:(profile.stats.puffs||0)+1});},
  flick(){smoker.flick?.();},
  tricks(){tricksOpen=!tricksOpen;renderSmoke();},
  trick(name){smoker.trick?.(name);},
  drop(){
   const a=nearestAshtray(),good=a&&Math.hypot(a.x-ctx.player.x,a.z-ctx.player.z)<1.6;
   if(!smoker.dispose?.())return; // 버릴 수 없는 순간(이미 버리는 중 등)이면 숫자·도장을 올리지 않는다
   // 단추 단계는 lounge:smoke(dispose → done)를 따라간다. 버리는 1.1초 동안 꺼내기가 먼저 떠서 입력이 사라지지 않게.
   save({stats:{...profile.stats,butts:(profile.stats.butts||0)+1,manners:(profile.stats.manners||0)+(good?1:0)}});
   if(good)showToast('🔖 매너 도장 꾹!');else showToast('재떨이 근처에서 버리면 매너 도장!');
  },
  ashtray(){const a=nearestAshtray();if(a){goTo({x:a.x,z:a.z,heading:a.heading});showToast('재떨이로 걸어가요');}},
  // ── 함께(npc.js social): 불 빌리기·한 대 권하기·받기·대답 칩
  borrow(){const r=npcs.borrowLight?.();if(!r)return;bump('cigs',{cigs:(profile.stats.cigs||0)+1});showToast(r.mode==='tip'?`${r.name}님과 맞불 🔥`:`${r.name}님이 불을 붙여 줘요 🔥`);renderSocial(true);},
  offer(){const r=npcs.offerCig?.();if(r?.accepted)showToast(`${r.name}님에게 한 대 건넸어요 🤝`);renderSocial(true);},
  accept(){const r=npcs.acceptCig?.();if(r)showToast(`${r.name}님이 ${CIG_KINDS[r.kind]?.label??''} 한 대를 줬어요`);renderSocial(true);},
  decline(){npcs.declineCig?.();renderSocial(true);},
  chip(i){if(npcs.choose?.(+i))renderSocial(true);},
 };
 // 꾹 누르는 모금 단추: 누르는 동안 들이마시고, 단추 안 막대가 들이마신 정도를 보여 준다(꿀모금 구간은 초록).
 const DRAW_IDLE='💨 꾹 들이마시기';
 const drawLabel=(held)=>({light:'💨 살짝…',sweet:'😌 꿀모금!',deep:'😤 진하게',cough:'😵 콜록'})[drawQuality(held)];
 function press(name,down){
  if(down&&!modal.hidden)return; // 로비·설정 창이 열려 있으면 담배 키는 쉰다
  if(name==='draw'){
   if(!down){if(drawing){drawing=false;smoker.drawEnd?.();}return;}
   if(stage==='idle'||stage==='choose')return act.kind(profile.cigKind);
   if(stage==='held')return act.light();
   if(stage==='butt'||stage==='dropping')return; // 다 탄 담배·버리는 중에는 들이마시지 않는다
   drawing=true;if(smoker.state==='smoking')bump(null,{puffs:(profile.stats.puffs||0)+1});smoker.drawStart?.();return;}
  if(!down)return;
  if(/^kind\d$/.test(name)){if(stage==='idle'||stage==='choose')act.kind(KIND_KEYS[+name.slice(4)-1]);return;}
  if(['ring','nose','french'].includes(name)&&stage==='lit')act.trick(name);
  if(name==='borrow')act.borrow();
  if(name==='give'){if(npcs.social?.().incoming)act.accept();else act.offer();}
 }
 // 함께 단추: 가까운 NPC·불 안 붙인 담배·NPC가 권하는 중·수다 칩에 따라 뜬다. 바뀔 때만 다시 그린다.
 let socialSig='',socialT=0;
 function renderSocial(force){
  const s=npcs.social?.();if(!s)return;
  const sig=JSON.stringify([s.borrow?.mode,s.borrow?.id,s.offer?.id,s.incoming?.id,s.chips,s.helping]);if(!force&&sig===socialSig)return;socialSig=sig;
  const b=(a,txt,cls='',extra='')=>`<button class="lg-btn ${cls}" data-a="${a}"${extra}>${txt}</button>`;
  socialBox.innerHTML=(s.incoming?b('accept',`🙏 받기 · ${esc(s.incoming.name)}`,'primary',' title="G"')+b('decline','✕','',' aria-label="괜찮아요"'):'')
   +(s.borrow?b('borrow',s.borrow.mode==='tip'?`🔥 맞불 · ${esc(s.borrow.name)}`:`🔥 불 빌리기 · ${esc(s.borrow.name)}`,'primary',' title="B"'):'')
   +(s.offer&&!s.incoming&&!s.helping?b('offer','🤝 한 대 권하기','',` title="G · ${esc(s.offer.name)}님에게"`):'');
  chipBox.innerHTML=(s.chips??[]).map((t,i)=>b('chip',`💬 ${esc(t)}`,'',` data-k="${i}"`)).join('');
 }
 function renderSmoke(){
  const b=(a,txt,cls='',extra='')=>`<button class="lg-btn ${cls}" data-a="${a}"${extra}>${txt}</button>`;
  const holdBtn=`<button class="lg-btn primary lg-draw" data-a="draw" style="touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none" aria-label="꾹 눌러 들이마시기">${DRAW_IDLE}</button>`;
  const kinds=KIND_KEYS.map((k,i)=>b('kind',`${CIG_KINDS[k].icon} ${CIG_KINDS[k].label}`,k===cigKind(profile.cigKind)?'on':'',` data-k="${k}" title="${i+1}번 키"`)).join('');
  if(stage!=='lit')tricksOpen=false;
  smokeBox.innerHTML=stage==='idle'?b('take','🚬 꺼내기','primary')
   :stage==='choose'?kinds+b('cancel','✕','',' aria-label="그만두기"')
   :stage==='held'?b('light','🔥 불','primary')+b('drop','🗑 버리기')
   :stage==='butt'?b('drop','🗑 꽁초 버리기','primary') // 다 탄 담배: 들이마시기·재 털기는 안 되니 버리기만
   :stage==='dropping'?'<button class="lg-btn" disabled>🗑 버리는 중…</button>'
   :tricksOpen?holdBtn+b('trick','⭕ 링','',' data-k="ring" title="R · 내뿜는 중에 꾹 단추를 짧게 탭해도 링"')+b('trick','👃 코로','',' data-k="nose" title="N"')+b('trick','🌀 프렌치','',' data-k="french" title="T"')+b('tricks','↩','',' aria-label="묘기 닫기"')
   :holdBtn+b('tricks','🎩 묘기')+b('flick','재 털기')+b('drop','🗑 꽁초 버리기');
  const hasAsh=(ctx.rooftop.spots.ashtrays?.length??0)>0;
  toolBox.innerHTML=b('ashtray','🚏 재떨이로').replace('<button','<button'+(hasAsh?'':' disabled'))+EMOTES.map(e=>`<button class="lg-btn" data-a="emote" data-k="${e.k}" aria-label="${e.t}" title="${e.t}">${e.i}</button>`).join('');
 }
 renderSmoke();
 // 꾹 단추: 누르는 동안(pointerdown~up). 손가락이 단추 밖에서 떨어져도 끝나게 window에서도 받는다.
 smokeBox.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-a=draw]'))return;e.preventDefault();press('draw',true);});
 for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>press('draw',false));
 smokeBox.addEventListener('contextmenu',e=>{if(e.target.closest('[data-a=draw]'))e.preventDefault();});

 // ── 채팅·말풍선
 const bubbles=new Map(); // id → {el,t,avatar}
 const avatarOf=id=>id==='me'?ctx.player:npcs.avatars.find(a=>a.id===id)??ctx.multi?.avatarOf?.(id); // 같이 피우는 사람(multi.js)은 서버 id로 찾는다
 function addLog(id,name,text){
  const p=document.createElement('p');p.className=id==='me'?'me':'';p.innerHTML=`<b>${esc(name)}</b> ${esc(text)}`;log.appendChild(p);
  while(log.children.length>30)log.firstChild.remove();
 }
 function bubble(id,name,text){
  const av=avatarOf(id);if(!av)return;let o=bubbles.get(id);
  if(!o){const el=document.createElement('div');el.className='lg-bub';bubLayer.appendChild(el);o={el};bubbles.set(id,o);}
  o.avatar=av;o.t=5+Math.min(4,text.length/14);o.el.classList.remove('out');o.el.innerHTML=`<small>${esc(name)}</small>${esc(text)}`;
 }
 const onChat=e=>{const {id,name,text}=e.detail??{};if(!text)return;addLog(id,name||'동동이',text);bubble(id,name||'동동이',text);};
 window.addEventListener('lounge:chat',onChat);
 // 흡연 쪽 state(out·ready·lighting·smoking·inhale·exhale·flick·finished·dispose·done)를 단추 단계로 따라간다. 콘솔·자동 점검으로 피워도 단추가 맞게 바뀐다.
 window.addEventListener('lounge:smoke',e=>{const d=e.detail??{};if(d.id!==ctx.player.id)return;const s=String(d.state??d.stage??'');
  setStage(s==='done'||s==='idle'?'idle':s==='dispose'?'dropping':s==='out'||s==='ready'?'held':s==='finished'?'butt':'lit');});
 form.addEventListener('submit',e=>{
  e.preventDefault();const text=input.value.trim().slice(0,60);if(!text)return;input.value='';
  ctx.dispatch('lounge:chat',{id:'me',name:profile.nickname||'동동이',text});bump('chats',{chats:(profile.stats.chats||0)+1});
  if(folded&&matchMedia('(max-height:540px)').matches)chatBox.classList.remove('open');
 });

 // ── 수첩 카드
 // 금연 기록 도장(B7): 한 대를 다 피우면 빨간 도장이 7초 찍혀 있다. 기록은 profile.js attachRecord가 쌓는다.
 let stampUntil=0,stampInfo=null;
 attachRecord({profile,save,dispatch:ctx.dispatch,onStamp(info){stampInfo=info;stampUntil=performance.now()+7000;folded=false;renderNote();audio.play?.('stamp');}});
 function renderNote(){
  const q=quitStats(profile),t=stats();
  const fold=`<button class="lg-note-fold" data-a="fold" aria-label="수첩 접기">${folded?'📒':'✕'}</button>`;
  if(folded){note.style.width='auto';note.innerHTML=fold;return;}
  note.style.width='';
  const r=profile.stats.record??{},stamp=performance.now()<stampUntil&&stampInfo
   ?`<div class="lg-stamp" role="status">진짜 담배 1개비 참음<br>약 ${won(stampInfo.won)} 아낌</div>`:'';
  note.innerHTML=q
   ?`<h3>📒 금연 수첩 ${fold}</h3><div class="big">${q.days}일째</div><span class="seal">금연 중</span><div class="row"><span>아낀 돈</span><b>${won(q.saved)}</b></div><div class="row"><span>오늘 가상 개비</span><b>${t.cigs||0}개비</b></div><div class="row"><span>참은 담배 오늘·누적</span><b>${todayCigs(profile)}·${r.total||0}개비</b></div>${stamp}`
   :`<h3>📒 오늘의 수다 ${fold}</h3><div class="big">${t.chats||0}마디</div><span class="seal">비흡연</span><div class="row"><span>방문</span><b>${profile.stats.visits||0}번째</b></div><div class="row"><span>오늘 가상 개비</span><b>${t.cigs||0}개비</b></div>`;
 }

 // ── 로비·내 정보 / 설정
 function lobby(edit=false){
  let status=profile.status==='never'?'never':'quit',outfit=profile.outfit;const tmp={};
  modal.hidden=false;
  const draw=()=>{modal.innerHTML=`<div class="lg-card lg-sheet" role="dialog" aria-modal="true">
   ${edit?'<button class="lg-btn lg-close" data-a="close" aria-label="닫기">✕</button>':''}
   <div class="sub">온라인 시리즈 ②</div><h1>온라인 흡연장</h1><div class="sub">옥상에서 수다만 떨어요. 몸에 해로운 건 하나도 없어요.</div>
   <h2>닉네임</h2><input type="text" id="lg-nick" maxlength="8" placeholder="동동이" value="${esc(profile.nickname||'')}" autocomplete="off">
   <h2>나는</h2><div class="opts"><button class="lg-btn ${status==='quit'?'on':''}" data-s="quit">🚭 금연 중</button><button class="lg-btn ${status==='never'?'on':''}" data-s="never">🌿 비흡연자</button></div>
   ${status==='quit'?`<div class="two"><div><h2>금연 시작일</h2><input type="date" id="lg-date" value="${profile.quitDate||today()}" max="${today()}"></div><div><h2>하루 몇 갑</h2><select id="lg-packs">${[.25,.5,1,1.5,2].map(v=>`<option value="${v}" ${v===profile.packsPerDay?'selected':''}>${v}갑</option>`).join('')}</select></div></div>`:''}
   <h2>옷 고르기</h2><div class="lg-outfits">${Object.entries(OUTFITS).map(([k,o])=>`<button class="lg-btn ${k===outfit?'on':''}" data-o="${k}" title="${esc(o.desc)}">${esc(o.label)}</button>`).join('')}</div>
   <div class="actions"><button class="lg-btn primary" data-a="enter">${edit?'저장':'입장하기'}</button></div></div>`;};
  const keep=()=>{const n=modal.querySelector('#lg-nick');if(n)tmp.nick=n.value;const d=modal.querySelector('#lg-date');if(d)tmp.date=d.value;const p=modal.querySelector('#lg-packs');if(p)tmp.packs=+p.value;};
  draw();
  modal.onclick=e=>{
   const t=e.target.closest('button');if(!t)return;
   if(t.dataset.s){keep();status=t.dataset.s;draw();modal.querySelector('#lg-nick').value=tmp.nick??'';if(tmp.date&&modal.querySelector('#lg-date'))modal.querySelector('#lg-date').value=tmp.date;if(tmp.packs&&modal.querySelector('#lg-packs'))modal.querySelector('#lg-packs').value=tmp.packs;return;}
   if(t.dataset.o){outfit=t.dataset.o;modal.querySelectorAll('[data-o]').forEach(b=>b.classList.toggle('on',b.dataset.o===outfit));save({outfit});return;}
   if(t.dataset.a==='close'){closeModal();return;}
   if(t.dataset.a==='enter'){
    const nick=(modal.querySelector('#lg-nick').value.trim()||'동동이').slice(0,8);
    const p={nickname:nick,status,outfit,seenIntro:true};
    if(status==='quit'){p.quitDate=modal.querySelector('#lg-date')?.value||profile.quitDate||today();p.packsPerDay=+(modal.querySelector('#lg-packs')?.value||profile.packsPerDay);}
    if(!edit)p.stats={...profile.stats,visits:(profile.stats.visits||0)+1,lastVisit:today()};
    save(p);audio.resume?.();closeModal();renderNote();showToast(edit?'내 정보를 고쳤어요':`${nick}님 어서 오세요!`);
   }
  };
 }
 function settings(){
  modal.hidden=false;
  const draw=()=>{modal.innerHTML=`<div class="lg-card lg-sheet" role="dialog" aria-modal="true"><button class="lg-btn lg-close" data-a="close" aria-label="닫기">✕</button><h1 style="font-size:22px">설정</h1>
   <h2>시간</h2><div class="opts">${TIMES.map(([k,l])=>`<button class="lg-btn ${timeState.mode===k?'on':''}" data-t="${k}">${l}</button>`).join('')}</div>
   <h2>소리</h2><div class="opts"><button class="lg-btn ${profile.muted?'':'on'}" data-a="mute">${profile.muted?'🔇 꺼짐':'🔊 켜짐'}</button></div>
   <h2>옷</h2><div class="lg-outfits">${Object.entries(OUTFITS).map(([k,o])=>`<button class="lg-btn ${k===profile.outfit?'on':''}" data-o="${k}">${esc(o.label)}</button>`).join('')}</div>
   <h2>내 정보</h2><div class="opts"><button class="lg-btn" data-a="info">✏️ 닉네임·금연 정보 고치기</button></div></div>`;};
  draw();
  modal.onclick=e=>{
   const t=e.target.closest('button');if(!t)return;
   if(t.dataset.t){save({timeMode:t.dataset.t});timeState.mode=t.dataset.t;ctx.dispatch('lounge:time',{mode:t.dataset.t});draw();return;}
   if(t.dataset.o){save({outfit:t.dataset.o});draw();return;}
   if(t.dataset.a==='mute'){save({muted:!profile.muted});renderSnd();draw();return;}
   if(t.dataset.a==='info'){lobby(true);return;}
   if(t.dataset.a==='close')closeModal();
  };
 }
 const closeModal=()=>{modal.hidden=true;modal.innerHTML='';modal.onclick=null;};
 const renderSnd=()=>{const b=root.querySelector('[data-a=snd]');b.textContent=profile.muted?'🔇':'🔊';};

 // ── 단추 처리
 root.addEventListener('click',e=>{
  const t=e.target.closest('[data-a]');if(!t||modal.contains(t))return;
  const a=t.dataset.a;
  if(act[a])act[a](t.dataset.k);
  else if(a==='emote'){ctx.dispatch('lounge:emote',{emote:t.dataset.k});const em=EMOTES.find(x=>x.k===t.dataset.k);ctx.dispatch('lounge:chat',{id:'me',name:profile.nickname||'동동이',text:em.i});}
  else if(a==='set')settings();
  else if(a==='snd'){save({muted:!profile.muted});renderSnd();}
  else if(a==='fold'){folded=!folded;renderNote();}
  else if(a==='chat'){chatBox.classList.toggle('open');if(chatBox.classList.contains('open'))input.focus();}
 });
 // 키보드 단축(PC): Enter로 채팅 칸에 포커스
 addEventListener('keydown',e=>{if(e.key==='Enter'&&document.activeElement!==input&&modal.hidden){chatBox.classList.add('open');input.focus();e.preventDefault();}});
 renderSnd();renderNote();
 if(!profile.seenIntro||!profile.nickname)lobby(false);else{profile.stats.lastVisit!==today()&&save({stats:{...profile.stats,visits:(profile.stats.visits||0)+1,lastVisit:today()}});}

 // ── 매 프레임: 말풍선 위치, 수첩 숫자 갱신
 const v=new THREE.Vector3();let noteT=0;
 return {
  update(dt){
   for(const [id,o] of bubbles){
    o.t-=dt;if(o.t<=0){o.el.remove();bubbles.delete(id);continue;}
    o.el.classList.toggle('out',o.t<.5);
    o.avatar.headTop(v);v.project(ctx.camera);
    const hide=v.z>1||Math.abs(v.x)>1.1||Math.abs(v.y)>1.1;o.el.style.display=hide?'none':'';
    if(!hide){const w=innerWidth,h=innerHeight;o.el.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-100%)`;}
   }
   noteT-=dt;if(noteT<=0||(stampInfo&&performance.now()>stampUntil)){noteT=2;if(stampInfo&&performance.now()>stampUntil)stampInfo=null;renderNote();}
   socialT-=dt;if(socialT<=0){socialT=.2;renderSocial();}
   // 꾹 단추 막대: 들이마신 정도(draw)와 지금 맛
   const db=smokeBox.querySelector('.lg-draw');
   if(db){const st=smoker.status?.()??{},on=st.hold&&st.state==='inhale';
    const txt=on?drawLabel(st.held):DRAW_IDLE;if(db.textContent!==txt)db.textContent=txt;
    const pct=on?Math.round(st.draw*100):0,col=st.held>=DRAW.sweet&&st.held<DRAW.deep?'var(--go)':st.held>=DRAW.deep?'var(--tab)':'rgba(255,255,255,.33)'; // 수첩 색 토큰(꿀모금 초록·진하게 종이 탭색)
    const bg=on?`linear-gradient(90deg,${col} ${pct}%,transparent ${pct}%)`:'';if(db.style.backgroundImage!==bg)db.style.backgroundImage=bg;}
  },
  press,
  hasBubble:id=>bubbles.has(id), // 이름표(multi-ui.js)가 말풍선과 겹치지 않게
 };
}
