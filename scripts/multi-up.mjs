// 대표 맥에서 함께 걷기 서버를 켠다: 서버 + Cloudflare Quick Tunnel + 잠자기 막기 + 서버 주소 공개 파일.
// 사용: npm run multi:up                 (켜기, Ctrl+C로 끄기)
//       npm run multi:up -- --no-publish  (공개 파일을 올리지 않음: 로컬 시험용)
// 하는 일
//  1. server/multi-server.mjs를 PORT(기본 8787)로 켠다. ALLOWED_ORIGINS = 배포 사이트 + 로컬 미리보기·개발 주소.
//  2. cloudflared tunnel --url http://127.0.0.1:PORT 로 임시 공개 주소(https://….trycloudflare.com)를 받는다.
//  3. 그 주소로 /health가 열리면 gh-pages 맨 위 multi-server.json을 {state:'on',url:'wss://…',updated}로 올린다(scripts/multi-publish.mjs).
//     사이트는 들어올 때마다 이 파일을 새로 받아 서버 카드에 인원을 띄운다(src/server-link.js). 5분마다 파일이 그대로인지 보고 다르면 다시 올린다.
//  4. caffeinate로 맥이 잠들지 않게 한다(뚜껑을 닫으면 잠들 수 있음).
//  5. Ctrl+C(또는 터널·서버가 죽으면): 공개 파일을 {state:'off'}로 바꾼 뒤 모두 끈다. 사이트는 옛 주소로 붙으려 하지 않고 바로 '서버에 연결할 수 없어요'를 띄운다.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {publishServerFile,readPublished,serverFileBody} from './multi-publish.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const PORT=Number(process.env.PORT||8787);
const SITE='https://engchoon.github.io';
const LOCAL=['http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:5173','http://localhost:5173'];
const publish=!process.argv.includes('--no-publish');
const CHECK_MS=5*60*1000;
const say=(...a)=>console.log('[multi:up]',...a);

export function findCloudflared(env=process.env){
 if(env.CLOUDFLARED&&existsSync(env.CLOUDFLARED))return env.CLOUDFLARED;
 for(const d of [...(env.PATH||'').split(':'),join(homedir(),'.local/bin'),'/opt/homebrew/bin','/usr/local/bin']){const p=join(d,'cloudflared');if(d&&existsSync(p))return p;}
 return null;
}
// cloudflared 출력에서 Quick Tunnel 주소 찾기
export const tunnelUrlIn=text=>text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0]??null;
export const wssOf=https=>https.replace(/^https:/i,'wss:');

async function waitHealth(url,ms){
 const end=Date.now()+ms;
 while(Date.now()<end){
  try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.ok){const h=await r.json();if(h?.servers)return h;}}catch{}
  await new Promise(r=>setTimeout(r,1500));
 }
 return null;
}

async function main(){
 const cf=findCloudflared();
 if(!cf){
  console.error(`cloudflared가 없습니다. 설치하고 다시 실행하세요.
  brew install cloudflared
  (brew가 없으면) curl -L -o /tmp/cf.tgz https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz && tar -xzf /tmp/cf.tgz -C ~/.local/bin
  다른 위치에 있으면 CLOUDFLARED=/경로/cloudflared npm run multi:up`);
  process.exit(1);
 }
 const kids=[];let stopping=false,current=null,checkTimer=null;
 const stop=async(why,code=0)=>{
  if(stopping)return;stopping=true;clearInterval(checkTimer);
  say(`끄는 중 (${why})`);
  if(publish&&current){try{publishServerFile('',{log:m=>say(m)});}catch(e){say('공개 파일을 꺼짐으로 바꾸지 못했습니다:',String(e.stderr||e.message).trim().split('\n')[0]);}}
  for(const k of kids)try{k.kill('SIGTERM');}catch{}
  setTimeout(()=>process.exit(code),300);
 };
 process.on('SIGINT',()=>stop('Ctrl+C'));
 process.on('SIGTERM',()=>stop('SIGTERM'));

 // 1. 서버
 const origins=[SITE,...LOCAL].join(',');
 // 터널 뒤라 모든 접속이 127.0.0.1로 보인다: TRUST_PROXY=1로 CF-Connecting-IP를 세고(안 켜면 같은 곳 32명 제한에 전체가 묶임, 11-13),
 // 그 머리글을 아무나 꾸미지 못하게 서버는 이 맥 안(127.0.0.1)에서만 기다린다(터널이 127.0.0.1로 붙음)
 const server=spawn(process.execPath,[join(ROOT,'server/multi-server.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',TRUST_PROXY:'1',ALLOWED_ORIGINS:origins},stdio:['ignore','inherit','inherit']});
 kids.push(server);server.on('exit',c=>stop(`서버가 꺼짐(코드 ${c})`,1));
 if(!await waitHealth(`http://127.0.0.1:${PORT}/health`,15000)){say('서버가 켜지지 않았습니다');return stop('서버 시작 실패',1);}
 say(`서버 켜짐: http://127.0.0.1:${PORT} · 허용 주소 ${origins}`);

 // 2. 잠자기 막기(이 스크립트가 끝나면 caffeinate도 끝남)
 const caf=spawn('caffeinate',['-i','-s','-w',String(process.pid)],{stdio:'ignore'});kids.push(caf);
 caf.on('error',()=>say('caffeinate를 켜지 못했습니다(맥이 잠들면 서버도 멈춥니다)'));
 say('caffeinate 켜짐: 맥이 쉬는 동안 잠들지 않습니다(뚜껑을 닫으면 잠들 수 있어요)');

 // 3. 터널
 say(`터널 여는 중: ${cf}`);
 const tunnel=spawn(cf,['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${PORT}`],{stdio:['ignore','pipe','pipe']});
 kids.push(tunnel);tunnel.on('exit',c=>stop(`터널이 꺼짐(코드 ${c})`,1));
 const https=await new Promise(ok=>{
  let buf='';const t=setTimeout(()=>ok(null),60000);
  const on=d=>{buf+=d;const u=tunnelUrlIn(buf);if(u){clearTimeout(t);ok(u);}};
  tunnel.stdout.on('data',on);tunnel.stderr.on('data',on);
 });
 if(!https){say('터널 주소를 받지 못했습니다(60초)');return stop('터널 주소 없음',1);}
 say(`터널 주소: ${https} — 열리기를 기다립니다`);
 if(!await waitHealth(`${https}/health`,90000)){say('터널로 /health가 열리지 않았습니다(90초)');return stop('터널 확인 실패',1);}
 current=wssOf(https);
 say(`터널 열림: ${current}`);

 // 4. 공개 파일
 if(publish){
  try{publishServerFile(current,{log:m=>say(m)});}catch(e){say('공개 파일을 올리지 못했습니다:',String(e.stderr||e.message).trim());return stop('공개 파일 실패',1);}
  say('1분쯤 뒤(GitHub Pages 반영) https://engchoon.github.io/ai-office-world/ 의 서버 카드에 인원이 뜹니다');
  // 누가 배포(npm run deploy)로 파일을 덮었거나 지웠으면 다시 올린다
  checkTimer=setInterval(()=>{
   if(stopping)return;
   try{const now=readPublished();if(!now||JSON.parse(now).url!==current){say('공개 파일이 지금 주소와 달라 다시 올립니다');publishServerFile(current,{log:m=>say(m)});}}
   catch(e){say('공개 파일 확인 실패(다음에 다시):',String(e.message).split('\n')[0]);}
  },CHECK_MS);
 }else say(`--no-publish: 공개 파일을 올리지 않았습니다. 올릴 내용: ${serverFileBody(current).trim()}`);
 say('켜 둔 채로 두세요. 끌 때는 Ctrl+C');
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))main().catch(e=>{console.error(e);process.exit(1);});
