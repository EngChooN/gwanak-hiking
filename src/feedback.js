// 의견 보내기(등산·흡연장 공용). 모양은 feedback.css(연디자인), 사양은 docs/흡연장/의견보내기-디자인.md.
// 게임은 아무것도 몰래 보내지 않는다. 사용자가 「GitHub에 올리기」를 누를 때만 새 탭으로 이슈 작성 페이지를 미리 채워 연다.
// 계정이 없는 사람은 「내용 복사」. 닉네임·채팅·방 이름·위치·IP는 넣지 않는다.
//  - 순수 함수(노드 테스트): buildIssueUrl·buildIssueTitle·buildIssueBody·buildIssueText·collectInfo·cleanPath·browserName
//  - 화면: installFeedback({exp,openEvent,state}) → {open,close,isOpen}. 열린 동안 키 입력·조이스틱을 막는다(body.fb-open).
//    나중에 멀티 서버로 직접 받게 되면 buildIssueText만 서버로 보내면 된다.

export const REPO_URL='https://github.com/EngChooN/gwanak-hiking';
export const MAX_BODY=6000; // 주소 길이가 넘치지 않게(GitHub·브라우저 주소 한도 안)
export const MAX_TEXT=500;
export const TITLE_LEN=40;
export const EXPS=Object.freeze({hiking:'등산',smoking:'흡연장'});
export const KINDS=Object.freeze({
 bug:{icon:'🐞',label:'고장·이상해요',sub:'안 돼요·멈춰요',labels:['bug']},
 idea:{icon:'💡',label:'이런 게 있으면',sub:'바라는 점',labels:['idea']},
 talk:{icon:'💬',label:'그냥 한마디',sub:'느낌·응원',labels:[]},
});
// 주소 옵션 중 사람을 알아볼 수 있는 값(닉네임·방 이름)은 지운다
const DROP_PARAMS=['name','multi'];
// 체험 상태 함수가 실수로 넘겨도 본문에 들어가지 않게 막는 이름
const DROP_KEYS=/^(name|nick|nickname|chat|채팅|닉네임|이름|방|방\s*이름|room|ip|위치|좌표|pos|position)$/i;
const kindOf=k=>KINDS[k]?k:'talk';
const oneLine=s=>String(s??'').replace(/\s+/g,' ').trim();
const SEOUL=9*3600e3;

export function cleanPath(pathname='/',search=''){
 const q=new URLSearchParams(search);
 for(const k of DROP_PARAMS)q.delete(k);
 const s=q.toString();
 return pathname+(s?`?${s}`:'');
}
// 브라우저 이름과 운영체제만(전체 UA 문자열은 넣지 않는다)
export function browserName(ua=''){
 const b=/SamsungBrowser/.test(ua)?'삼성 인터넷':/KAKAOTALK/i.test(ua)?'카카오톡':/NAVER/.test(ua)?'네이버':/Edg\//.test(ua)?'Edge':/CriOS|Chrome\//.test(ua)?'Chrome':/FxiOS|Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'기타';
 const os=/iPhone|iPod/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Android':/Mac OS X|Macintosh/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':/Linux/.test(ua)?'Linux':'';
 return os?`${b} · ${os}`:b;
}
export const BUILD_DATE=typeof __BUILD_DATE__!=='undefined'?__BUILD_DATE__:'개발';
export const seoulTime=(ms=Date.now())=>new Date(ms+SEOUL).toISOString().slice(0,16).replace('T',' ')+' (서울)';

// 같이 올라가는 정보 → [[이름,값],…]. state()는 체험 상태(선택, {시간대:'노을',…})
export function collectInfo({exp='hiking',win=globalThis,state=null,now=Date.now()}={}){
 const loc=win.location??{},nav=win.navigator??{};
 const w=Math.round(win.innerWidth||0),h=Math.round(win.innerHeight||0);
 const coarse=!!win.matchMedia?.('(pointer:coarse)')?.matches,phoneUa=/iPhone|iPod|Android.*Mobile|iPad/.test(nav.userAgent??'');
 const rows=[
  ['체험',exp in EXPS?exp:'hiking'],
  ['주소',cleanPath(loc.pathname,loc.search)],
  ['화면',`${w}×${h}${win.devicePixelRatio?` @${+(+win.devicePixelRatio).toFixed(2)}x`:''}`],
  ['기기',`${coarse||phoneUa?'휴대폰':'PC'} · ${h>w?'세로':'가로'}`],
  ['브라우저',browserName(nav.userAgent??'')],
 ];
 let extra={};try{extra=(typeof state==='function'?state():state)||{};}catch{}
 for(const [k,v] of Object.entries(extra))if(v!=null&&v!==''&&!DROP_KEYS.test(oneLine(k)))rows.push([oneLine(k).slice(0,20),oneLine(v).slice(0,80)]);
 rows.push(['빌드',BUILD_DATE],['시각',seoulTime(now)]);
 return rows;
}

export function buildIssueTitle({exp='hiking',kind='talk',text=''}={}){
 const k=KINDS[kindOf(kind)],t=oneLine(text);
 const head=t?[...t].slice(0,TITLE_LEN).join('')+([...t].length>TITLE_LEN?'…':''):k.label;
 return `[${EXPS[exp]??EXPS.hiking}] ${k.icon} ${head}`;
}
export function buildIssueLabels({exp='hiking',kind='talk'}={}){
 return ['feedback',...KINDS[kindOf(kind)].labels,exp in EXPS?exp:'hiking'];
}
// 본문: 내용 + 정보 표. 6000자를 넘으면 정보는 두고 내용 쪽을 자른다.
export function buildIssueBody({kind='talk',text='',info=[]}={}){
 const k=KINDS[kindOf(kind)];
 const infoPart=`\n\n### 같이 올라가는 정보\n${info.map(([a,b])=>`- ${a}: ${b}`).join('\n')}\n\n_게임 안 「💌 의견 보내기」로 쓴 글이에요._`;
 const head=`### ${k.icon} ${k.label}\n\n`,cut='\n…(잘림)';
 let t=String(text??'').trim()||'(내용 없음)';
 const room=MAX_BODY-head.length-infoPart.length;
 if(t.length>room)t=t.slice(0,Math.max(0,room-cut.length))+cut;
 return (head+t+infoPart).slice(0,MAX_BODY);
}
export function buildIssueUrl({exp='hiking',kind='talk',text='',info=[]}={}){
 const q={title:buildIssueTitle({exp,kind,text}),body:buildIssueBody({kind,text,info}),labels:buildIssueLabels({exp,kind}).join(',')};
 return `${REPO_URL}/issues/new?`+Object.entries(q).map(([a,b])=>`${a}=${encodeURIComponent(b)}`).join('&');
}
// 「내용 복사」에 들어가는 글(제목 + 본문)
export const buildIssueText=o=>`${buildIssueTitle(o)}\n\n${buildIssueBody(o)}`;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MSG={copied:'복사했어요!',copyFail:'복사가 안 돼서 글을 선택해 뒀어요. 길게 눌러 복사해 주세요.',empty:'한 줄만 적어 주세요',opened:'새 탭에서 GitHub가 열렸어요. 거기서 「Submit」을 눌러야 올라가요.'};

// 카드 화면. exp: 'hiking'|'smoking', openEvent: 이 window 이벤트가 오면 연다, state: 체험 상태 함수(선택)
export function installFeedback({exp='hiking',openEvent='',state=null,doc=globalThis.document,win=globalThis.window}={}){
 if(!doc?.body)return null;
 import('./feedback.css').catch(()=>{});
 let modal=null,kind='talk',lastFocus=null;
 const body=doc.body;
 const status=t=>{const s=modal?.querySelector('.fb-status');if(s)s.textContent=t;};
 const textOf=()=>modal?.querySelector('.fb-text')?.value??'';
 const payload=()=>({exp,kind,text:textOf().slice(0,MAX_TEXT),info:collectInfo({exp,win,state})});
 function syncText(){
  const n=[...textOf()].length,c=modal.querySelector('.fb-count'),empty=!textOf().trim();
  c.textContent=`${n} / ${MAX_TEXT}`;c.classList.toggle('over',n>=MAX_TEXT);
  for(const b of modal.querySelectorAll('[data-fb=send],[data-fb=copy]'))b.disabled=empty;
  if(empty&&n)status(MSG.empty);else if(modal.querySelector('.fb-status').textContent===MSG.empty)status('');
 }
 function render(){
  const info=collectInfo({exp,win,state});
  modal=doc.createElement('div');modal.className='fb-modal';
  modal.innerHTML=`<div class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-t" tabindex="-1">
  <div class="fb-head"><h2 class="fb-title" id="fb-t">의견 보내기</h2><span class="fb-seal" aria-hidden="true">의견</span></div>
  <p class="fb-guide"><b>GitHub 계정이 있으면 바로 올라가요.</b> 없으면 「내용 복사」로 복사해서 보내 주세요.</p>
  <div class="fb-main">
   <fieldset class="fb-kinds" aria-label="종류">${Object.entries(KINDS).map(([k,v])=>`<button type="button" class="fb-kind" data-kind="${k}" aria-pressed="${k===kind}"><i aria-hidden="true">${v.icon}</i>${esc(v.label)}<small>${esc(v.sub)}</small></button>`).join('')}</fieldset>
   <textarea class="fb-text" maxlength="${MAX_TEXT}" rows="4" aria-label="내용" placeholder="무슨 일이 있었나요? 어디서·언제 그랬는지 적어 주면 좋아요."></textarea><span class="fb-count" aria-live="polite">0 / ${MAX_TEXT}</span>
  </div>
  <div class="fb-side">
   <details class="fb-info"><summary>📎 같이 올라가는 정보 (펼쳐 보기)</summary><dl class="fb-rows">${info.map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl><p class="fb-safe">닉네임·채팅·위치·IP는 들어가지 않아요.</p></details>
   <div class="fb-actions"><button type="button" class="fb-btn primary" data-fb="send" disabled>🐙 GitHub에 올리기</button><button type="button" class="fb-btn" data-fb="copy" disabled>📋 내용 복사</button><button type="button" class="fb-btn" data-fb="close">닫기</button></div>
   <p class="fb-status" role="status"></p>
  </div></div>`;
  modal.addEventListener('click',onClick);
  modal.querySelector('.fb-text').addEventListener('input',syncText);
  // 바깥(어두운 곳)을 누르면 닫는다. 카드 안 누름은 그대로.
  modal.addEventListener('pointerdown',e=>{if(e.target===modal)close();});
  body.appendChild(modal); // #app 바깥(body): 토큰이 :root에서 온다
 }
 async function copy(){
  const text=buildIssueText(payload());
  modal.querySelector('.fb-fallback')?.remove();
  try{await win.navigator.clipboard.writeText(text);status(MSG.copied);return true;}
  catch{
   // 클립보드가 막힌 브라우저: 글을 칸에 담아 선택해 보여 준다(옛 방식 복사도 한 번 시도)
   const ta=doc.createElement('textarea');ta.className='fb-fallback';ta.readOnly=true;ta.value=text;ta.setAttribute('aria-label','복사할 내용');
   modal.querySelector('.fb-actions').before(ta);ta.focus();ta.select();ta.setSelectionRange?.(0,text.length);
   let ok=false;try{ok=doc.execCommand?.('copy');}catch{}
   status(ok?MSG.copied:MSG.copyFail);return ok;
  }
 }
 function send(){
  if(!textOf().trim()){status(MSG.empty);return null;}
  const url=buildIssueUrl(payload());
  win.open(url,'_blank','noopener'); // 사용자가 누를 때만 연다
  status(MSG.opened);return url;
 }
 function onClick(e){
  const k=e.target.closest('[data-kind]');
  if(k){kind=kindOf(k.dataset.kind);for(const b of modal.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b.dataset.kind===kind));return;}
  const a=e.target.closest('[data-fb]')?.dataset.fb;
  if(a==='send')send();else if(a==='copy')copy();else if(a==='close')close();
 }
 // 열린 동안 키 입력을 게임에 넘기지 않는다(채팅·서버 고르기 칸의 stopPropagation과 같은 생각, 카드 전체로 넓힘).
 // document 잡기 단계에서 멈추면 window에 붙은 이동·단축키 처리(input.js 등)까지 가지 않는다. 글자는 그대로 쳐진다.
 const onKey=e=>{
  if(!modal)return;
  if(e.type==='keydown'&&e.key==='Escape'&&!e.isComposing){e.preventDefault();close();}
  e.stopPropagation();
 };
 doc.addEventListener('keydown',onKey,true);doc.addEventListener('keypress',onKey,true);
 function open(){
  if(modal)return;
  lastFocus=doc.activeElement;
  // 눌려 있던 이동키·조이스틱을 놓게 한다(등산·흡연장 input.js가 window blur에서 모두 놓는다)
  win.dispatchEvent?.(new Event('blur'));
  kind='talk';render();body.classList.add('fb-open');
  const fine=win.matchMedia?.('(pointer:fine)')?.matches;
  (fine?modal.querySelector('.fb-text'):modal.querySelector('.fb-card'))?.focus({preventScroll:true}); // 휴대폰은 키보드를 바로 띄우지 않는다
 }
 function close(){
  if(!modal)return;
  modal.remove();modal=null;body.classList.remove('fb-open');
  try{lastFocus?.focus?.({preventScroll:true});}catch{}lastFocus=null;
 }
 if(openEvent)win.addEventListener(openEvent,open);
 return {open,close,isOpen:()=>!!modal,send,copy};
}
// 카드가 열려 있나(이동 입력이 확인한다)
export const feedbackOpen=(doc=globalThis.document)=>!!doc?.body?.classList.contains('fb-open');
