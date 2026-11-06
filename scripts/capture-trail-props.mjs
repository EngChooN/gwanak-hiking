// 즐길거리 장면 촬영: 게임 안에서 동작을 실제로 돌리고, 시안(src/toon/props-concepts.js)과 같은 카메라 구도로 찍어 나란히 비교한다.
// 개발 서버를 먼저 띄운다: npx vite --host 127.0.0.1 --port 5310
//   node scripts/capture-trail-props.mjs [장면,...] [--size 1280x800] [--out artifacts/trail-props] [--mobile 1]
// 결과: <out>/<장면>.png(게임), <out>/board.html + compare.png(시안 | 게임), <out>/results.json
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';

const argv=process.argv.slice(2),opt={},names=[];
for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--'))opt[a.slice(2)]=argv[++i];else names.push(...a.split(','));}
const base=opt.base??'http://127.0.0.1:5310',out=opt.out??'artifacts/trail-props',[vw,vh]=(opt.size??'1280x800').split('x').map(Number);
mkdirSync(out,{recursive:true});
// 장면: where = 서는 자리(소품 id 또는 동물 id), act = 동작, at = 찍는 동작 시각(초), frame = 카메라 기준(prop: 소품 공간 + off, char: 몸 기준 + yaw·off), cam = 시안 카메라
const SCENES=[
 {id:'gym',title:'① 산스장 — 전경',where:'gym',frame:{prop:'gym'},cam:{p:[4.4,3.3,6.4],t:[-.2,.75,-.6],fov:34}},
 {id:'gym-lift',title:'① 산스장 — 시멘트 역기',where:'gym',act:'gym-lift',at:3.2,frame:{prop:'gym',off:[-.6,0,.35]},cam:{p:[1.2,1.05,3.6],t:[0,.6,0],fov:30}},
 {id:'gym-hang',title:'① 산스장 — 거꾸리',where:'gym',act:'gym-hang',at:3.4,frame:{char:true,yaw:Math.PI},cam:{p:[2.0,1.05,4.3],t:[.1,.75,0],fov:32}},
 {id:'gym-twist',title:'① 산스장 — 허리돌리기',where:'gym',act:'gym-twist',at:1.3,frame:{char:true,fixedYaw:true},cam:{p:[1.6,1.25,3.4],t:[0,.65,0],fov:32},concept:null},
 {id:'gym-bar',title:'① 산스장 — 철봉',where:'gym',act:'gym-bar',at:2.1,frame:{prop:'gym',off:[-1.68,0,-1.3]},cam:{p:[1.4,1.5,3.8],t:[0,1.15,0],fov:34},concept:null},
 {id:'choco',title:'② 초콜릿 — 먹기',where:'gym',act:'choco',at:.95,frame:{char:true,yaw:-Math.PI/2},cam:{p:[2.3,1.05,3.0],t:[.05,.52,0],fov:30}},
 {id:'bench',title:'③ 벤치 — 앉아서 쉬기',where:'bench-2156',act:'bench-sit',at:3.2,cat:true,frame:{prop:'bench-2156'},cam:{p:[.9,1.05,3.3],t:[.05,.62,0],fov:32}},
 {id:'airgun',title:'⑤ 등산화 먼지털이기',where:'airgun',act:'airgun',at:1.75,frame:{prop:'airgun',off:[.75,0,.35]},cam:{p:[1.2,1.3,4.0],t:[-.1,.7,0],fov:34}},
 {id:'airgun-hat',title:'⑤ 먼지털이기 — 2초 뒤 모자 툭',where:'airgun',act:'airgun',at:3.42,frame:{prop:'airgun',off:[.75,0,.35]},cam:{p:[1.2,1.3,4.0],t:[-.1,.7,0],fov:34},concept:null},
 {id:'animals-pet',title:'④ 동물 — 고양이 쓰다듬기',where:'cat-plaza',act:'pet-cat',at:1.6,frame:{char:true,yaw:-.95,off:[-.25,0,-.05]},cam:{p:[.6,1.15,3.4],t:[.05,.55,0],fov:32}},
 {id:'squirrel-hat',title:'④ 동물 — 모자 위 다람쥐',where:'squirrel-1',special:'squirrel',at:3.2,frame:{char:true},cam:{p:[1.1,1.25,2.7],t:[0,.75,0],fov:32},concept:null},
 {id:'magpie-ride',title:'④ 동물 — 배낭 위 까치',where:'magpie-1',special:'magpie',at:2.4,frame:{char:true},cam:{p:[1.6,1.3,-2.4],t:[0,.65,0],fov:32},concept:null},
];
const wanted=names.length?SCENES.filter(s=>names.includes(s.id)):SCENES;
// 같은 자리 장면은 페이지 하나에서 찍는다
const groups=[...new Set(wanted.map(s=>s.where))].map(w=>({where:w,scenes:wanted.filter(s=>s.where===w)}));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const results={};
let sites=null;
async function stateFor(where){
 if(where==='airgun'||where==='cat-plaza'||where.startsWith('magpie-1'))return null;
 if(!sites){const ctx=await browser.newContext({viewport:{width:640,height:400}});await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});const page=await ctx.newPage();
  await page.goto(`${base}/?start=entrance&quality=low`);await page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail,null,{timeout:300000});
  sites=await page.evaluate(async()=>{const {route,sample}=await import('/src/route.js');const {initialState}=await import('/src/movement.js');const T=window.hiking.trail,L=window.__landscape;
   const pts=[...T.props.map(p=>({id:p.id,x:p.x,z:p.z})),...(L.status.interactionProps.spawns??[]).map(p=>({id:p.id,x:p.x,z:p.z}))];const out={};
   for(const p of pts){let best={d:Infinity,s:0};for(let q=0;q<=route.length;q+=.5){const r=sample(q),d=Math.hypot(r.x-p.x,r.z-p.z);if(d<best.d)best={d,s:q};}out[p.id]={...best,state:initialState({start:'demo'})};}return out;});await ctx.close();}
 const b=sites[where];return JSON.stringify({...b.state,s:Math.max(0,b.s-(where.startsWith('squirrel')?0:6)),lateral:0,zone:'route',view:'third'});
}
for(const g of groups){
 const mobile=!!opt.mobile,ctx=await browser.newContext(mobile?{viewport:{width:vw,height:vh},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:vw,height:vh},deviceScaleFactor:1});
 // 서는 자리: 자리에서 가장 가까운 코스 지점(입구 광장 자리는 광장 출발). 자리 좌표는 처음 한 번 게임을 열어 읽어 둔다(sites).
 const save=await stateFor(g.where);
 await ctx.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
 const q=new URLSearchParams({time:'11:00',weather:'clear',season:'summer'});if(!mobile)q.set('quality','high');if(!save)q.set('start','entrance');
 await page.goto(`${base}/?${q}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.dispatchEvent(new CustomEvent('hiking:hud-toggle'));});
 await page.addStyleTag({content:'#section-jump{display:none!important}'});
 // 3인칭으로(광장 출발은 1인칭이 기본)
 await page.evaluate(()=>{if(window.hiking.snapshot().view!=='third')window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'view'}}));});
 await page.waitForTimeout(2500);
 for(const s of g.scenes){
  const t0=Date.now();
  // 동작 시작(소품·고양이는 들르기와 같은 play, 초콜릿은 먹기)
  const started=await page.evaluate(async(s)=>{const T=window.hiking.trail;T.reset();window.hiking.cameraOverride=null;
   if(s.special==='squirrel'){const sq=[...T.animals.values()].find(a=>a.kind==='squirrel');if(!sq)return 'no-squirrel';const R=window.__hiker.scene;R.position;return T.squirrelHat()?'ok':'fail';}
   if(s.special==='magpie')return T.magpieRide()?'ok':'no-magpie';
   if(s.act==='choco')return T.acts.eatChocolate(30)?'ok':'fail';
   if(!s.act)return 'ok';return T.play(s.act,s.where)?'ok':'fail';},s);
  // 동작 시각까지 기다리며 카메라를 시안 구도로 고정
  const shot=await page.evaluate(async(s)=>{const T=window.hiking.trail,H=window.__hiker,V=H.scene.position.constructor;
   const frame=()=>{if(s.frame.prop){const o=T.props.find(p=>p.id===s.frame.prop)?.obj;if(!o)return null;o.updateMatrixWorld(true);const M=o.matrixWorld,off=new V(...(s.frame.off??[0,0,0]));return p=>new V(...p).add(off).applyMatrix4(M);}
    const r=H.scene;if(s.frame.fixedYaw&&s._yaw===undefined)s._yaw=r.rotation.y;const Y=(s.frame.fixedYaw?s._yaw:r.rotation.y)+Math.PI+(s.frame.yaw??0),c=Math.cos(Y),sn=Math.sin(Y),o=r.position.clone(),off=s.frame.off??[0,0,0];
    return p=>{const x=p[0]-off[0],z=p[2]-off[2];return new V(o.x+x*c+z*sn,o.y+p[1]-off[1],o.z-x*sn+z*c);};};
   const until=performance.now()+40000;
   for(;;){await new Promise(r=>requestAnimationFrame(r));const st=T.status(),a=st.acts.active,anim=st.animals;
    const ready=s.special==='squirrel'?anim.some(x=>x.kind==='squirrel'&&x.state==='hat'):s.special==='magpie'?anim.some(x=>x.kind==='magpie'&&x.state==='ride'):!s.act?true:a?.name===s.act;
    if(ready){s._t??=performance.now();const t=s.special||!s.act?(performance.now()-s._t)/1000:a.t;
     if(s.cat&&!s._cat&&a.t>.3){s._cat=T.catToBench();}
     const f=frame();if(f)window.hiking.cameraOverride={p:f(s.cam.p).toArray(),t:f(s.cam.t).toArray(),fov:s.cam.fov};
     if(t>=(s.at??.3))return {ok:true,t,acts:st.acts,animals:anim,bubble:st.bubble};}
    if(performance.now()>until)return {ok:false,status:T.status()};}},s);
  await page.waitForTimeout(16);
  const file=`${out}/${s.id}${mobile?'-mobile':''}.png`;await page.screenshot({path:file});
  results[s.id]={file,started,...shot,seconds:(Date.now()-t0)/1000};console.log(s.id,started,shot.ok?`t=${shot.t?.toFixed(2)}`:'시간 초과',shot.bubble?.text??'');
  await page.evaluate(()=>{window.hiking.trail.reset();window.hiking.cameraOverride=null;});await page.waitForTimeout(400);
 }
 results[g.where]={errors};if(errors.length)console.log('오류',errors.slice(0,3));
 await ctx.close();
}
writeFileSync(`${out}/results${opt.mobile?'-mobile':''}.json`,JSON.stringify(results,null,1));
// 비교판: 시안 | 게임
const rows=SCENES.filter(s=>existsSync(`${out}/${s.id}.png`)).map(s=>{const c=s.concept===null?null:`../props-concepts/${s.id}.png`;
 return `<section><h2>${s.title}</h2><div class="pair"><figure>${c&&existsSync(`artifacts/props-concepts/${s.id}.png`)?`<img src="${c}">`:'<div class="none">시안 없음(동작만 새로 만듦)</div>'}<figcaption>시안</figcaption></figure><figure><img src="${s.id}.png"><figcaption>게임 안(같은 카메라 구도)</figcaption></figure></div></section>`;}).join('');
writeFileSync(`${out}/board.html`,`<!doctype html><meta charset="utf-8"><title>즐길거리 — 시안과 게임 비교</title><style>body{margin:0;padding:20px;background:#efe6d2;font-family:'Apple SD Gothic Neo',system-ui,sans-serif;color:#2e2420}h1{font-size:22px;margin:0 0 12px}h2{font-size:16px;margin:16px 0 6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img,.none{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:8px;border:2px solid #3a2d22;background:#ddd;display:flex;align-items:center;justify-content:center}figcaption{font-size:13px;margin-top:3px}</style><h1>즐길거리 오브젝트·동물 — 시안(왼쪽) · 게임 안(오른쪽)</h1>${rows}`);
await browser.close();
