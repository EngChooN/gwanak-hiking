// 함께 걷기 서버 주소 고르기(2026-11-11 대표 지시: 그냥 https://engchoon.github.io/gwanak-hiking/ 로 들어와 서버 카드만 누르면 붙게).
// 서버는 대표 맥 + Cloudflare Quick Tunnel이라 켤 때마다 주소가 바뀐다. 그래서 `npm run multi:up`이 지금 주소를
// gh-pages 맨 위 multi-server.json({state:'on',url:'wss://…',updated})에 올리고, 사이트는 들어올 때마다 그 파일을 새로 받는다.
// 고르는 순서: ?server= → 빌드 변수 VITE_MULTI_SERVER_URL → 공개 파일 → 기억한 값(파일을 못 받았을 때만).
//  - 공개 파일이 기억한 옛 터널 주소보다 앞선다. 파일이 '꺼짐'이면 기억한 값으로 내려가지 않는다(옛 주소로 붙다 실패하지 않게).
//  - ?server=가 옛 Quick Tunnel 주소(*.trycloudflare.com)인데 공개 파일이 다른 켜진 주소를 알려 주면 파일을 쓴다.
//    11-08~11-10 판이 터널 주소를 주소창에 붙여 두어서, 그때 복사해 보낸 링크가 아직 돌아다닌다.
//  - 주소창에는 더 붙이지 않는다(붙이면 다시 읽을 때 ?server=가 되어 옛 주소가 앞서게 된다).
// 서버 주소를 읽는 쪽(multi-transport.js multiServerUrl)은 ?server=·빌드 변수가 없으면 currentServer()를 본다.
// 그래서 체험 코드는 server-link-pin.js의 serverReady를 기다린 뒤 주소를 읽는다.
export const SERVER_KEY='gwanak-multi-server';
export const SERVER_FILE='multi-server.json';
export const FILE_TIMEOUT_MS=3000;
const OFF=new Set(['off','local']);
const QUICK_TUNNEL=/\.trycloudflare\.com$/i;

function safeStorage(storage){try{return storage??globalThis.localStorage??null;}catch{return null;}}
export function rememberedServer(storage){
 const st=safeStorage(storage);let v='';try{v=st?.getItem(SERVER_KEY)||'';}catch{}
 return v.trim();
}
const remember=(st,v)=>{try{st?.setItem(SERVER_KEY,v);}catch{}};
const hostOf=v=>{try{return new URL(String(v).replace(/^ws/i,'http')).hostname;}catch{return '';}};

// 공개 파일 내용 → {state:'on',url} · {state:'off'} · null(모양이 틀림)
export function parseServerFile(data){
 if(!data||typeof data!=='object')return null;
 const url=typeof data.url==='string'?data.url.trim():'';
 if(data.state==='off'||!url)return data.state==='off'||'url' in data?{state:'off'}:null;
 return /^wss?:\/\/[^/\s]+/i.test(url)?{state:'on',url}:null;
}
// 공개 파일 주소(배포 하위 경로 기준). 캐시 무력화 쿼리를 붙여 매번 새로 받는다(Pages CDN은 10분 캐시).
export const serverFileUrl=(base='/',now=Date.now())=>`${base.endsWith('/')?base:base+'/'}${SERVER_FILE}?t=${now}`;

// 공개 파일 받기. 못 받으면(없음·시간 초과·모양 틀림) null.
export async function fetchServerFile({fetchImpl=globalThis.fetch?.bind(globalThis),base='/',now=Date.now(),timeoutMs=FILE_TIMEOUT_MS,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!fetchImpl)return null;
 const ctl=typeof AbortController==='function'?new AbortController():null,to=setTimer(()=>ctl?.abort(),timeoutMs);
 try{
  const r=await fetchImpl(serverFileUrl(base,now),{cache:'no-store',signal:ctl?.signal});
  if(!r.ok)return null;
  return parseServerFile(await r.json());
 }catch{return null;}
 finally{clearTimer(to);}
}

/** 이번 접속에 쓸 서버 주소 원문과 출처. source: query·env·file·file-off·remembered·none */
export async function chooseServer({search='',envUrl='',storage,fetchFile=()=>fetchServerFile()}={}){
 const q=new URLSearchParams(search),st=safeStorage(storage);
 if(q.has('server')){
  const v=(q.get('server')||'').trim();
  if(!v||OFF.has(v))return {server:v,source:'query'};
  if(QUICK_TUNNEL.test(hostOf(v))){
   const f=await fetchFile();
   if(f?.state==='on'&&hostOf(f.url)!==hostOf(v)){remember(st,f.url);return {server:f.url,source:'file',stale:v};}
  }
  remember(st,v);return {server:v,source:'query'};
 }
 const env=(envUrl||'').trim();
 if(env)return {server:env,source:'env'};
 const f=await fetchFile();
 if(f?.state==='on'){remember(st,f.url);return {server:f.url,source:'file'};}
 if(f?.state==='off')return {server:'',source:'file-off'};
 const v=rememberedServer(st);
 return v?{server:v,source:'remembered'}:{server:'',source:'none'};
}

// 고른 결과(체험 페이지에서 serverReady가 채운다). ?server=·빌드 변수가 없을 때 multiServerUrl이 이 값을 쓴다.
let chosen={server:'',source:'none'};
export const currentServer=()=>chosen.server;
export const currentChoice=()=>({...chosen});
export function setChoice(c){chosen={server:c?.server??'',source:c?.source??'none',...(c?.stale?{stale:c.stale}:{})};return currentChoice();}

/** 옛 ?server=를 공개 파일 주소로 바꿨으면 주소창에서 그 ?server=를 뺀다(복사해 보내도 옛 주소가 따라가지 않게). */
export function dropStaleServerParam({loc=globalThis.location,hist=globalThis.history}={}){
 if(!loc)return false;
 const q=new URLSearchParams(loc.search);if(!q.has('server'))return false;
 q.delete('server');const s=q.toString();
 try{hist?.replaceState(hist.state,'',`${loc.pathname}${s?'?'+s:''}${loc.hash||''}`);return true;}catch{return false;}
}
