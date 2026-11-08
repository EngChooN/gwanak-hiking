// 즐길거리 효과음 확인(2026-11-06): '소리 꺼짐'이면 즐길거리 소리가 0건이고, '소리 켜짐'이면 public/sounds/trail/ 파일로 재생되는지 본다.
// 재생 호출 감시: 페이지가 뜨기 전에 AudioBufferSourceNode.start·OscillatorNode.start와 fetch를 감싸 모든 재생·소리 파일 요청을 센다.
// 꺼짐: 사용자 입력 → 초콜릿·에어건·헥헥·쥐(비명·뒹굴기·찌릿)·고양이·다람쥐·까치·토끼·산스장 라디오·벤치 영혼을 모두 일으킨 뒤 재생 0건, 소리 파일 요청 0건.
// 동물은 출현 구역에서 무작위로 나오므로(2026-11-07) 장면마다 trail.summon(종류)으로 앞에 불러낸다.
// 켜짐: 입력 전에는 소리 없음(아이폰 사파리 제한과 같은 조건) → 입력 뒤 같은 장면에서 효과음이 파일로 재생(토끼 뒷발은 절반 확률이라 참고만), 쥐 뒹굴기는 발끝 당기기로 멈춤,
//       라디오는 산스장 18m 안에서만(가까울수록 크게), 켜진 채로 '소리 꺼짐'을 누르면 그 뒤로는 0건.
// 사용: 개발 서버(5310) → node scripts/verify-trail-sound.mjs · 결과: artifacts/trail-sound/report.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5310/',out='artifacts/trail-sound';mkdirSync(out,{recursive:true});
const {initialState}=await import('../src/movement.js');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={};let failed=0;

for(const mode of (process.env.MODES??'off,on').split(',')){
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript(on=>{
  if(!sessionStorage.getItem('vs-keep')){localStorage.clear();sessionStorage.setItem('vs-keep','1');}
  localStorage.setItem('gwanak-hiking:sound:v1',String(on));
  const v=sessionStorage.getItem('vs-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('vs-save');}
  const w=window.__soundWatch={buffer:0,osc:0,trailFetch:[],starts:[]};
  const bs=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){w.buffer++;w.starts.push(+(this.buffer?.duration??0).toFixed(3));return bs.apply(this,a);};
  const os=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...a){w.osc++;return os.apply(this,a);};
  const f=window.fetch;window.fetch=function(u,...a){const s=String(u?.url??u);if(s.includes('sounds/trail/'))w.trailFetch.push(s.split('/').pop());return f.call(this,u,...a);};
 },mode==='on');
 const page=await ctx.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errors.push(m.text().slice(0,300));});
 const ok=(what,pass,info='')=>{checks.push({what,pass:!!pass,info});if(!pass)failed++;console.log(mode,pass?'✓':'✗',what,typeof info==='string'?info:JSON.stringify(info));};
 const ready=()=>page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
 const gesture=async()=>{await page.keyboard.press('Shift');await sleep(600);};
 const snap=()=>page.evaluate(()=>({sound:window.hiking.trailSound(),watch:{...window.__soundWatch,starts:undefined},enabled:window.hiking.audio().enabled}));
 // 페이지를 다시 열면 세던 값이 처음부터라, 떠나기 전에 더해 둔다.
 const acc={byName:{},fetch:new Set(),buffer:0,osc:0,played:0};
 const bank=async()=>{const s=await snap();for(const [k,v] of Object.entries(s.sound?.byName??{}))acc.byName[k]=(acc.byName[k]??0)+v;s.watch.trailFetch.forEach(f=>acc.fetch.add(f));acc.buffer+=s.watch.buffer;acc.osc+=s.watch.osc;acc.played+=s.sound?.played??0;};
 const go=async(s)=>{await bank();await page.evaluate(v=>sessionStorage.setItem('vs-save',v),JSON.stringify({...initialState({start:'demo'}),s,lateral:0,view:'third'}));
  await page.goto(base+'?time=11:00&weather=clear&season=summer');await ready();await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await gesture();};
 const cmd=(id,value)=>page.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
 // 들르기 동작이 끝날 때까지(걸어가기 → 동작 → 돌아오기) 기다린다
 const done=async(max=70000)=>{const t0=Date.now();await sleep(800);while(Date.now()-t0<max){if(await page.evaluate(()=>{const s=window.hiking.trail.status();return !s.active&&!s.acts?.active;}))return true;await sleep(300);}return false;};
 const cleanup=async()=>{await page.evaluate(()=>window.hiking.trail.reset());await sleep(300);};

 // ① 입구 광장
 await page.goto(base+'?start=entrance&time=11:00&weather=clear&season=summer');await ready();
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 if(mode==='on'){await page.evaluate(()=>window.hiking.trail.exhaust('pant'));await sleep(1800);await page.evaluate(()=>window.hiking.trail.reset());const s=await snap();
  ok('입력 전: 즐길거리 소리 없음(AudioContext는 사용자 입력 때만)',s.sound.played===0&&s.watch.buffer===0&&s.watch.osc===0,{played:s.sound.played,context:s.sound.context,buffer:s.watch.buffer});}
 await gesture();
 const before=await snap();
 await cmd('chocolate');await sleep(1800);
 await page.evaluate(()=>window.hiking.trail.play('airgun','airgun'));await done();
 const catId=await page.evaluate(()=>window.hiking.trail.summon('cat',{ahead:3,offset:.6}));await sleep(500);await page.evaluate(id=>window.hiking.trail.play('pet-cat',id),catId);await done();await cleanup();
 await page.evaluate(()=>window.hiking.trail.exhaust('pant'));await sleep(2200);await cleanup();
 await page.evaluate(()=>window.hiking.trail.exhaust('cramp'));await sleep(2000);
 const midCramp=await snap();await cmd('cramp-release');await sleep(350);const afterRelease=await snap();await sleep(2600);const afterCramp=await snap();await cleanup();
 await page.evaluate(()=>window.hiking.trail.summon('squirrel',{ahead:4,offset:1}));await sleep(500);const squirrel=await page.evaluate(()=>window.hiking.trail.squirrelHat());await sleep(3000);await cleanup();
 await page.evaluate(()=>window.hiking.trail.summon('magpie',{ahead:6,offset:1}));await sleep(500);const magpie=await page.evaluate(()=>window.hiking.trail.magpieRide());await sleep(4500);
 const plaza=await snap();
 // ② 산스장(라디오)·벤치(영혼 후우)
 const sites=await page.evaluate(async()=>{const {route}=await import('/src/route.js');const {positionAt}=await import('/src/movement.js');
  return window.hiking.trail.status().sites.filter(s=>s.id==='gym'||s.id==='bench-2156').map(s=>{let b={d:1e9,s:0};for(let q=0;q<=route.length;q+=.5){const [x,,z]=positionAt(q,0);const d=Math.hypot(x-s.x,z-s.z);if(d<b.d)b={d,s:q};}return {id:s.id,s:b.s,d:b.d};});});
 const gym=sites.find(s=>s.id==='gym'),bench=sites.find(s=>s.id==='bench-2156');
 await go(gym.s-40);await sleep(1500);const farRadio=await snap();
 await go(gym.s);await sleep(3000);const nearRadio=await snap();
 const radioDist=await page.evaluate(()=>{const g=window.hiking.trail.status().sites.find(s=>s.id==='gym'),p=window.hiking.coordinates();return Math.hypot(g.x-p.x,g.z-p.z);});
 await go(1650);await sleep(1500);await page.evaluate(()=>window.hiking.trail.summon('squirrel',{ahead:4,offset:1}));await sleep(500);const squirrel2=await page.evaluate(()=>window.hiking.trail.squirrelHat());await sleep(2500);await page.evaluate(()=>window.hiking.trail.exhaust('pant'));await sleep(1800);await cleanup(); // 동작이 시작되면 모자 위 다람쥐가 찍! 하고 달아남
 await go(bench.s);await page.evaluate(()=>window.hiking.trail.play('bench-sit','bench-2156'));await sleep(9000);const benchSnap=await snap();await cleanup();
 // ③ 토끼: 6m 앞에서 귀 쫑긋 뒤 경계하며 풀 뜯기(사각사각) → 바로 앞(3m 안)에 불러내 달아나기(풀잎 스침)
 await go(2700);await sleep(1200);await page.evaluate(()=>window.hiking.trail.summon('hare',{ahead:5.5,offset:.5}));await sleep(6000);const hareFar=await snap();
 await page.evaluate(()=>window.hiking.trail.summon('hare',{ahead:1.2,offset:.2}));await sleep(2500);const hareNear=await snap();
 const last=await snap();await page.screenshot({path:`${out}/${mode}.png`});await bank();
 const all={sound:{...last.sound,byName:acc.byName,played:acc.played},watch:{buffer:acc.buffer,osc:acc.osc,trailFetch:[...acc.fetch]}};

 if(mode==='off'){
  ok('꺼짐: 즐길거리 소리 재생 0건(효과음 모듈)',all.sound.played===0,{played:all.sound.played,muted:all.sound.muted,context:all.sound.context});
  ok('꺼짐: 페이지 전체 재생 호출 0건(버퍼·합성 모두)',all.watch.buffer===0&&all.watch.osc===0,{buffer:all.watch.buffer,osc:all.watch.osc});
  ok('꺼짐: 즐길거리 소리 파일 요청 0건',all.watch.trailFetch.length===0,all.watch.trailFetch.join(','));
  ok('꺼짐: 라디오 0',nearRadio.sound.radio===0,{radio:nearRadio.sound.radio,dist:+radioDist.toFixed(1)});
 }else{
  const by=all.sound.byName;
  ok('켜짐: 효과음 버스가 마스터에 붙고 게인 1',all.sound.busGain===1&&all.sound.context==='running',{busGain:all.sound.busGain,context:all.sound.context});
  for(const n of ['crunch','airgun','meow','pant','scream','roll','zap','squeak','caw','whoo','radio','munch','rustle'])ok(`켜짐: ${n} 파일 재생`,by[n]>0,{n:by[n]??0});
  console.log('참고: 토끼 뒷발(thump, 절반 확률)',by.thump??0,'회');
  ok('켜짐: 소리 파일 14개 받음(라디오 포함)',new Set(all.watch.trailFetch).size===14,[...new Set(all.watch.trailFetch)].join(','));
  ok('토끼: 12m 안 풀 뜯기 사각사각 → 가까이 가면 풀잎 스침',hareNear.sound.byName.munch>0&&hareNear.sound.byName.rustle>0,{munch:[hareFar.sound.byName.munch??0,hareNear.sound.byName.munch??0],rustle:hareNear.sound.byName.rustle});
  console.log('참고: 합성음 호출',all.watch.osc,'건은 수첩 도장·안내 소리(interaction-sound.js, 원래 소리 켜기/끄기를 따름)이고 즐길거리 합성음은 trail-world.js에서 없앰');
  ok('켜짐: 오류 없음',!all.sound.errors.length,all.sound.errors.join(';'));
  ok('쥐: 뒹굴기 소리가 나다가 발끝 당기기 뒤 멈춤',midCramp.sound.byName.roll>0&&!afterRelease.sound.playing.includes('roll')&&afterCramp.sound.byName.roll===afterRelease.sound.byName.roll,{mid:midCramp.sound.byName.roll,after:afterCramp.sound.byName.roll,playing:afterRelease.sound.playing});
  ok('쥐: 비명 1회',all.sound.byName.scream===1,{scream:all.sound.byName.scream});
  ok('라디오: 40m 앞에서는 0, 산스장 옆에서는 들림',farRadio.sound.radio===0&&nearRadio.sound.radio>0,{far:farRadio.sound.radio,near:nearRadio.sound.radio,dist:+radioDist.toFixed(1)});
  ok('벤치: 영혼 후우',benchSnap.sound.byName.whoo>0,{whoo:benchSnap.sound.byName.whoo});
  // 켜진 채로 '소리 꺼짐' → 그 뒤 0건
  await page.evaluate(()=>document.getElementById('sound-toggle').click());await sleep(400);const m0=await snap();
  await page.evaluate(()=>window.hiking.trail.exhaust('pant'));await sleep(2000);await cleanup();
  await page.evaluate(()=>window.hiking.trail.play('bench-sit','bench-2156'));await sleep(3000);await cleanup();
  const m1=await snap();
  ok("켜짐 → '소리 꺼짐' 누른 뒤: 버스 0, 새 재생 0건",!m1.enabled&&m1.sound.busGain===0&&m1.sound.played===m0.sound.played&&m1.watch.buffer===m0.watch.buffer,{enabled:[m0.enabled,m1.enabled],busGain:[m0.sound.busGain,m1.sound.busGain],ctx:m1.sound.context,played:[m0.sound.played,m1.sound.played],buffer:[m0.watch.buffer,m1.watch.buffer]});
 }
 ok('페이지 오류 0',!errors.length,errors.slice(0,3).join(' | '));
 report[mode]={checks,squirrel,squirrel2,magpie,snapshot:all.sound,watch:all.watch,errors};
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
console.log(failed?`실패 ${failed}`:'모두 통과');process.exit(failed?1:0);
