// npm run reels — 릴스 영상을 처음부터 다시 만든다: 녹화(reels-record.mjs) → 편집(reels-edit.mjs).
// 개발 서버(127.0.0.1:5173)와 함께 걷기 서버(127.0.0.1:8787)가 꺼져 있으면 이 스크립트가 잠시 켰다가 끝나면 끈다.
// (npm run multi:up이 이미 켜져 있으면 그 서버를 그대로 쓴다. 터널은 필요 없다.)
//   npm run reels                 # 전부
//   npm run reels -- --edit-only  # 녹화는 건너뛰고 편집만
//   npm run reels -- hook,multi   # 일부 장면만 다시 녹화하고 편집
import {spawn,spawnSync} from 'node:child_process';

const args=process.argv.slice(2),editOnly=args.includes('--edit-only'),scenes=args.filter(a=>!a.startsWith('--'));
const up=async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});return r.ok;}catch{return false;}};
const waitUp=async(url,ms)=>{const t=Date.now();while(Date.now()-t<ms){if(await up(url))return true;await new Promise(r=>setTimeout(r,500));}return false;};
const started=[];
function start(cmd,argv,env={}){const p=spawn(cmd,argv,{stdio:'ignore',env:{...process.env,...env}});started.push(p);return p;}
function stopAll(){for(const p of started)try{p.kill('SIGINT');}catch{}}
process.on('SIGINT',()=>{stopAll();process.exit(130);});
const run=(file,a=[])=>{const r=spawnSync(process.execPath,[file,...a],{stdio:'inherit'});if(r.status)throw new Error(`${file} 실패(${r.status})`);};

try{
 if(!editOnly){
  if(!await up('http://127.0.0.1:5173/hiking/')){console.log('개발 서버 켜기(5173)');start(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort']);if(!await waitUp('http://127.0.0.1:5173/hiking/',60000))throw new Error('개발 서버가 켜지지 않음');}
  if(!await up('http://127.0.0.1:8787/health')){console.log('함께 걷기 서버 켜기(8787, 로컬만)');start(process.execPath,['server/multi-server.mjs'],{PORT:'8787',ALLOWED_ORIGINS:'http://127.0.0.1:5173'});if(!await waitUp('http://127.0.0.1:8787/health',15000))throw new Error('함께 걷기 서버가 켜지지 않음');}
  run('scripts/reels-record.mjs',scenes.length?[scenes.join(',')]:[]);
 }
 run('scripts/reels-edit.mjs');
}finally{stopAll();}
