// 함께 걷기 WebSocket 서버(2026-11-08). Node 내장 http·crypto만 쓴다. 실행: npm run server (= npm run multi:server)
// http(ws://)로만 연다. https(wss://)는 앞단(Cloudflare 터널·클라우드 부하분산기)이 맡는다 — 옮겨도 이 코드는 그대로.
// 환경 변수(코드 안에 경로·주소를 박지 않는다):
//  PORT             기다릴 포트(기본 8787)          HOST            기다릴 주소(기본 0.0.0.0)
//  DATA_DIR         신고 기록(reports.jsonl) 폴더(기본 ./data-multi). 90일 지난 줄은 시작할 때·하루마다 지운다
//  ALLOWED_ORIGINS  허용할 페이지 주소(쉼표). 비우면 모두 허용(경고 출력). Origin 머리말이 없는 접속(앱·시험 도구)은 허용
//  MAX_PER_ROOM(30) MAX_CLIENTS(400) MAX_PER_IP(32) BANNED_WORDS(쉼표, 이름 금칙어) TRUST_PROXY(1이면 X-Forwarded-For·CF-Connecting-IP를 접속 수 제한에 씀)
//  BANNED_CHAT_WORDS(쉼표, 채팅 금칙어 — 기본 목록 파일 server/chat-banned-words.txt에 더함. 파일이 없으면 빈 목록)  CHAT_BANNED_FILE(기본 목록 파일 경로를 바꿀 때)
// 주소: GET /health → 200 {ok,rooms,clients,total(=clients, 전체 접속),uptime,experiences:{hiking:{rooms,clients},smoking:{…}},servers:{hiking:[{id,name,count,max}],smoking:[…]}}
//  servers는 서버 고르기 창(src/server-pick.js)이 5초마다 읽는다. CORS는 *. 그 밖의 경로로 WebSocket 업그레이드를 받는다(경로는 보지 않음).
// IP는 디스크·로그에 남기지 않는다. 메모리에서만 비밀 값으로 해시해 같은 곳 접속 수 제한·신고 숨김 유지에 쓴다.
import http from 'node:http';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,existsSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {handshakeResponse,wrapSocket} from './ws.mjs';
import {createRooms,pruneReports,parseWordList} from './rooms.mjs';
import {EXPERIENCES} from '../src/multi-protocol.js';

const list=s=>String(s??'').split(',').map(x=>x.trim()).filter(Boolean);
const log=(event,detail={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...detail}));
const DEFAULT_CHAT_BANNED_FILE=fileURLToPath(new URL('./chat-banned-words.txt',import.meta.url));
// 채팅 금칙어 = 기본 목록 파일 + BANNED_CHAT_WORDS. 파일이 없거나 못 읽으면 파일 쪽은 빈 목록.
export function loadChatBanned(env=process.env){
 const file=env.CHAT_BANNED_FILE||DEFAULT_CHAT_BANNED_FILE;let fromFile=[];
 try{if(existsSync(file))fromFile=parseWordList(readFileSync(file,'utf8'));}catch{}
 return {words:[...new Set([...fromFile,...list(env.BANNED_CHAT_WORDS)])],file:fromFile.length?file:null,fromFile:fromFile.length};
}

export function startServer(env=process.env,{quiet=false,now=()=>Date.now()}={}){
 const port=Number(env.PORT??8787),host=env.HOST||'0.0.0.0',dataDir=resolve(env.DATA_DIR||'data-multi');
 const origins=list(env.ALLOWED_ORIGINS),trustProxy=env.TRUST_PROXY==='1';
 const say=quiet?()=>{}:log;
 mkdirSync(dataDir,{recursive:true});
 const reportFile=join(dataDir,'reports.jsonl');
 // 90일 지난 신고 기록을 지우고 남은 기록을 메모리로 읽는다(자동 숨김 판단에 쓴다)
 function pruneFile(){
  if(!existsSync(reportFile))return [];
  const lines=readFileSync(reportFile,'utf8').split('\n'),keep=pruneReports(lines,now(),90);
  if(keep.length!==lines.filter(l=>l.trim()).length){const tmp=reportFile+'.tmp';writeFileSync(tmp,keep.map(r=>JSON.stringify(r)+'\n').join(''));renameSync(tmp,reportFile);}
  return keep;
 }
 const initialReports=pruneFile();
 const chatBanned=loadChatBanned(env);
 const secret=randomBytes(32),ipKey=ip=>ip?createHmac('sha256',secret).update(ip).digest('base64url').slice(0,16):'';
 const rooms=createRooms({now,initialReports,
  maxPerRoom:Number(env.MAX_PER_ROOM)||30,maxClients:Number(env.MAX_CLIENTS)||400,maxPerIp:Number(env.MAX_PER_IP)||32,banned:list(env.BANNED_WORDS),chatBanned:chatBanned.words,
  reports:{append:rec=>{appendFileSync(reportFile,JSON.stringify(rec)+'\n');say('report',{room:rec.room,reason:rec.reason});}}});
 const started=now();
 const server=http.createServer((req,res)=>{
  const path=(req.url||'/').split('?')[0];
  if(path==='/health'){const i=rooms.info();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'});
   const experiences=Object.fromEntries(EXPERIENCES.map(x=>{const rs=i.rooms.filter(r=>r.experience===x);return [x,{rooms:rs.length,clients:rs.reduce((n,r)=>n+r.count,0)}];}));
   res.end(JSON.stringify({ok:true,rooms:i.rooms.length,clients:i.clients,total:i.clients,uptime:Math.round((now()-started)/1000),experiences,servers:rooms.serverCounts()}));return;}
  res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('함께 걷기 서버입니다. WebSocket으로 접속하세요.\n');
 });
 const clientIp=req=>{if(trustProxy){const h=req.headers['cf-connecting-ip']||String(req.headers['x-forwarded-for']||'').split(',')[0].trim();if(h)return h;}return req.socket.remoteAddress||'';};
 const sockets=new Set();
 server.on('upgrade',(req,socket)=>{
  const origin=req.headers.origin;
  if(origin&&origins.length&&!origins.includes(origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');say('reject-origin',{origin});return;}
  const head=handshakeResponse(req.headers);
  if(!head){socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
  socket.write(head);
  const key=ipKey(clientIp(req));let client=null,alive=true,greeted=false;
  const conn=wrapSocket(socket,{maxPayload:4096,
   onPong:()=>{alive=true;},
   onText:text=>{
    let m;try{m=JSON.parse(text);}catch{return;}
    if(!greeted){ // 첫 메시지는 {t:'hello',exp?,room,name,resume?}. exp(체험 id)가 없으면 등산(옛 클라이언트)
     if(m?.t!=='hello'){conn.close(1008,'hello first');return;}
     greeted=true;
     const r=rooms.join({experience:m.exp,room:m.room,name:m.name,resume:typeof m.resume==='string'?m.resume.slice(0,64):null,ipKey:key,send:s=>conn.sendText(s),kick:()=>{client=null;conn.close(4000,'replaced');}});
     if(r.reason==='experience'){conn.sendText(JSON.stringify({t:'reject',reason:'experience'}));conn.close(1008,'unknown experience');say('reject-experience',{});return;}
     if(!r.ok){conn.sendText(JSON.stringify({t:'full',reason:r.reason}));conn.close(1013,'full');return;}
     client=r.client;return;
    }
    if(client)rooms.message(client,m);
   },
   onClose:()=>{sockets.delete(entry);if(client){rooms.leave(client);client=null;}}});
  const entry={conn,ping(){if(!alive){conn.terminate();return;}alive=false;conn.ping();},greetBy:now()+10000,get greeted(){return greeted;}};
  sockets.add(entry);
 });
 // 10Hz 스냅샷, 20초 ping(두 번 연속 답이 없으면 끊음), 10초 안에 hello가 없으면 끊음, 1분 요약 로그, 하루 한 번 신고 정리
 const tick=setInterval(()=>rooms.tick(),100);
 const ping=setInterval(()=>{const t=now();for(const s of sockets){if(!s.greeted&&t>s.greetBy){s.conn.close(1008,'no hello');continue;}s.ping();}},20000);
 let lastStats='';
 const summary=setInterval(()=>{const i=rooms.info(),line=JSON.stringify({clients:i.clients,rooms:i.rooms.length,...i.stats});if(line!==lastStats){lastStats=line;say('summary',JSON.parse(line));}},60000);
 const daily=setInterval(()=>{try{pruneFile();rooms.prune(90);}catch(e){say('prune-error',{message:e.message});}},86400e3);
 for(const t of [tick,ping,summary,daily])t.unref?.();
 const ready=new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,()=>{const a=server.address();say('start',{port:a.port,host,dataDir,origins:origins.length?origins:'*(모두 허용)',reports:initialReports.length,chatBanned:chatBanned.words.length});if(!origins.length)say('warn',{message:'ALLOWED_ORIGINS가 비어 모든 페이지 주소를 허용합니다'});ok(a.port);});});
 async function close(){clearInterval(tick);clearInterval(ping);clearInterval(summary);clearInterval(daily);for(const s of sockets)s.conn.close(1001,'server shutdown');await new Promise(ok=>server.close(()=>ok()));say('stop');}
 return {server,rooms,ready,close,get port(){return server.address()?.port;},reportFile};
}

// 직접 실행했을 때만 띄운다(시험에서는 startServer를 불러 쓴다)
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const s=startServer();
 s.ready.catch(e=>{log('error',{message:e.message});process.exit(1);});
 const stop=async sig=>{log('signal',{sig});await s.close();process.exit(0);};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
