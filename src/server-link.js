// 함께 걷기 서버 주소를 늘 주소에 붙인다(2026-11-08 대표 지시: 허브 카드로 오든 공유 링크로 오든 같은 서버에 붙게).
// 배포본에는 서버 주소(VITE_MULTI_SERVER_URL)가 없어서, 주소에 ?server=가 빠지면 같은 브라우저 창끼리(BroadcastChannel)로 떨어져
// 다른 기기 사람이 보이지 않았다. 그래서
//  - ?server=가 있으면 그 값을 localStorage에 기억한다(off·local은 기억하지 않음 = 이번만 내 컴퓨터 모드).
//  - 없으면 빌드 변수 → 기억한 값 순으로 골라 주소창에 ?server=를 붙인다(history.replaceState, 새로 읽지 않음).
//    주소를 복사해 보내면 받는 사람도 같은 서버로 들어온다.
//  - 허브(/)는 주소에 붙이지 않고(붙이면 옛 주소 규칙으로 /hiking/에 넘어감) 체험 카드 링크에만 붙인다(hub/main.js).
// 서버 주소를 읽는 쪽(multi-transport.js multiServerUrl)은 그대로 location.search를 본다. 이 파일은 그보다 먼저 실행되어야 한다.
export const SERVER_KEY='gwanak-multi-server';
const OFF=new Set(['off','local']);

function safeStorage(storage){try{return storage??globalThis.localStorage??null;}catch{return null;}}
export function rememberedServer(storage){
 const st=safeStorage(storage);let v='';try{v=st?.getItem(SERVER_KEY)||'';}catch{}
 return v.trim();
}
// 사람이 읽기 쉬운 쿼리(wss://… 그대로). URLSearchParams가 바꾼 :와 /만 되돌린다(쿼리 값 안에서 둘 다 허용 문자).
export const readableQuery=q=>q.toString().replace(/%3A/gi,':').replace(/%2F/gi,'/');

/** 이번 접속에 쓸 서버 주소 원문(없으면 ''). 주소에 붙여야 하면 add=true. */
export function resolveServerParam(search='',{envUrl='',storage}={}){
 const q=new URLSearchParams(search),st=safeStorage(storage);
 if(q.has('server')){
  const v=(q.get('server')||'').trim();
  if(v&&!OFF.has(v)){try{st?.setItem(SERVER_KEY,v);}catch{}}
  return {server:v,add:false};
 }
 const v=(envUrl||'').trim()||rememberedServer(st);
 return {server:v,add:!!v};
}

/** 체험 페이지(/hiking/·/smoking/) 첫 줄에서 부른다: 주소에 ?server=가 없으면 붙인다. 붙인 서버 주소를 돌려준다. */
export function pinServerParam({loc=globalThis.location,hist=globalThis.history,envUrl='',storage}={}){
 if(!loc)return '';
 const {server,add}=resolveServerParam(loc.search,{envUrl,storage});
 if(add){
  const q=new URLSearchParams(loc.search);q.set('server',server);
  try{hist?.replaceState(hist.state,'',`${loc.pathname}?${readableQuery(q)}${loc.hash||''}`);}catch{}
 }
 return server;
}

/** 허브 카드 주소에 서버를 붙인다. href에 이미 ?server=가 있으면 그대로. */
export function withServer(href,server){
 if(!server||/[?&]server=/.test(href))return href;
 const [path,hash='']=href.split('#'),q=new URLSearchParams();q.set('server',server);
 return `${path}${path.includes('?')?'&':'?'}${readableQuery(q)}${hash?`#${hash}`:''}`;
}
