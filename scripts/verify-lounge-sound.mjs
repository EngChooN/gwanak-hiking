// 흡연장 녹음 소리 점검(11-13): 실제 Chrome에서 파일이 풀리는지, 파일·합성 소리 크기 비교, 담배 한 개비·캔커피 흐름에서 파일 재생 횟수.
// 개발 서버(npm run dev, 5173)를 먼저 띄운다. 실행: node scripts/verify-lounge-sound.mjs → artifacts/smoking/lounge-sound-2026-11-13.json
// 출력 끝을 엿듣는 분석기(AnalyserNode)를 끼워 넣어 소리 크기(피크·가장 큰 0.3초 RMS, dBFS)를 잰다. 'synth' 판은 sounds/lounge/를 막아 합성 대체를 본다.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE=process.env.BASE_URL??'http://127.0.0.1:5173';
const TAP=()=>{const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);const an=this.createAnalyser();an.fftSize=2048;window.__tap={an,ctx:this};
 const orig=AudioNode.prototype.connect,dest=this.destination;AudioNode.prototype.connect=function(d,...r){if(d===dest&&this!==an)orig.call(this,an);return orig.call(this,d,...r);};}};};
async function run(mode){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});const logs=[];page.on('pageerror',e=>logs.push(e.message));
 if(mode==='synth')await page.route('**/sounds/lounge/**',r=>r.fulfill({status:404,body:''}));
 await page.addInitScript(TAP);
 await page.goto(`${BASE}/smoking/?capture=1&time=day`);
 await page.waitForFunction(()=>window.lounge?.ctx?.audio,null,{timeout:60000});
 await page.mouse.click(640,400);await page.waitForTimeout(300);
 await page.evaluate(()=>window.lounge.ctx.audio.ready());
 const files=await page.evaluate(()=>window.lounge.ctx.audio.status().files);
 // 소리 하나 재기: 배경음을 잠깐 줄인(duck 0) 상태에서 play 후 2.6초 동안 20ms마다 샘플
 const measure=(name,opts)=>page.evaluate(async([name,opts])=>{const a=window.lounge.ctx.audio,{an}=window.__tap,buf=new Float32Array(an.fftSize);
  a.duck(0,5);await new Promise(r=>setTimeout(r,900));
  const ok=a.play(name,opts);const blocks=[];const t0=performance.now();
  while(performance.now()-t0<2600){an.getFloatTimeDomainData(buf);let pk=0,s=0;for(const x of buf){pk=Math.max(pk,Math.abs(x));s+=x*x;}blocks.push([pk,Math.sqrt(s/buf.length)]);await new Promise(r=>setTimeout(r,20));}
  const db=x=>+(20*Math.log10(x+1e-9)).toFixed(1);const peak=Math.max(...blocks.map(b=>b[0]));
  let best=0;const w=15;for(let i=0;i+w<=blocks.length;i++){const m=Math.sqrt(blocks.slice(i,i+w).reduce((s,b)=>s+b[1]*b[1],0)/w);best=Math.max(best,m);}
  return {ok,peakDb:db(peak),rms300Db:db(best),clip:peak>=.999};},[name,opts]);
 const levels={};
 for(const [k,name,opts] of [['lighter','lighter',{}],['inhale','inhale',{}],['exhale-light','exhale',{quality:'light'}],['exhale-sweet','exhale',{quality:'sweet'}],['exhale-deep','exhale',{quality:'deep'}],['can','can',{}],['ash(합성 기준)','ash',{}],['stamp(합성 기준)','stamp',{}]])levels[k]=await measure(name,opts);
 // 배경음만(비교용)
 levels['배경음']=await page.evaluate(async()=>{const {an}=window.__tap,buf=new Float32Array(an.fftSize);await new Promise(r=>setTimeout(r,2500));let s=0,n=0;for(let i=0;i<20;i++){an.getFloatTimeDomainData(buf);for(const x of buf){s+=x*x;n++;}await new Promise(r=>setTimeout(r,20));}return {rmsDb:+(10*Math.log10(s/n+1e-12)).toFixed(1)};});
 // 담배 한 개비 흐름 + 캔커피: 실제 동작으로 부른 소리 횟수
 const flow=await page.evaluate(async()=>{const L=window.lounge,a=L.ctx.audio,s0={...a.status()};const calls=[];const orig=a.play;
  a.play=(n,o)=>{calls.push([n,+(performance.now()/1000).toFixed(2),L.smoker.status().state]);return orig(n,o);};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  L.smoker.start();await wait(1500);L.smoker.light();await wait(3000);L.smoker.puff();
  let maxBurn=0;for(let i=0;i<40;i++){maxBurn=Math.max(maxBurn,a.status().files.burn);await wait(50);}await wait(2500);
  // 캔커피: 자판기 앞으로 옮긴 뒤 뽑기. 캔이 떨어지기 시작한 시각(dropping)과 can 소리 시각을 같이 남긴다
  const vm=L.rooftop.spots.vending;L.teleport(vm.outlet?.x??vm.x,(vm.outlet?.z??vm.z)+1,0);await wait(300);
  L.spots.coffee();let dropAt=null,heldAt=null;for(let i=0;i<120;i++){const c=L.spots.status().can;const t=+(performance.now()/1000).toFixed(2);
   if(c.dropping&&dropAt==null)dropAt=t;if(c.held&&heldAt==null)heldAt=t;if(heldAt)break;await wait(50);}
  calls.push(['(캔 떨어지기 시작)',dropAt,''],['(캔 손에 쥠)',heldAt,'']);await wait(1500);
  const s1=a.status();a.play=orig;
  return {calls,file:s1.file-s0.file,synth:s1.synth-s0.synth,maxBurn,spots:L.spots?.status?.()?.can??null};});
 // 소리 꺼짐: 0건
 const mute=await page.evaluate(async()=>{const a=window.lounge.ctx.audio;a.setMuted(true);const p0=a.status().played;
  for(const n of ['lighter','inhale','exhale','can'])a.play(n);window.dispatchEvent(new CustomEvent('lounge:spot',{detail:{spot:'vending',state:'use'}}));
  const r={played:a.status().played-p0};a.setMuted(false);return r;});
 await browser.close();
 return {mode,files,levels,flow,mute,logs};
}
const out={date:new Date().toISOString(),runs:[await run('file'),await run('synth')]};
mkdirSync('artifacts/smoking',{recursive:true});writeFileSync('artifacts/smoking/lounge-sound-2026-11-13.json',JSON.stringify(out,null,1));
for(const r of out.runs){console.log(`\n== ${r.mode}: 파일 ${r.files.loaded}/${r.files.total}`,r.files.errors.length?`오류 ${r.files.errors.length}`:'');
 for(const [k,v] of Object.entries(r.levels))console.log(k.padEnd(16),JSON.stringify(v));
 console.log('흐름',JSON.stringify({file:r.flow.file,synth:r.flow.synth,maxBurn:r.flow.maxBurn,calls:r.flow.calls}));console.log('꺼짐',JSON.stringify(r.mute),r.logs.join(' | '));}
