// 상호작용 소품 캡처와 성능 비교(headless Chrome 1440×900, 낮 11시 맑음, 화질 높음).
// 사용: BASE_URL=http://127.0.0.1:5197 node scripts/capture-interaction-props.mjs  (ONLY=summit,spring 로 일부만)
// 자리마다 코스 위 s(경로 3D 거리)를 찾아 저장 상태로 그 앞 back m 지점에서 시작한다. 소품 묶음을 켜고 끈 draw call·삼각형도 잰다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/interaction-props';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5197',only=process.env.ONLY?.split(',');
const env='time=11:00&weather=clear&outfit=1&quality=high';
// [id, 대상 자리 id, 몇 m 앞에서, 옆(lateral m), 시점, 끌기 px, 휠, 추가 쿼리]
const specs=[
 ['summit','board-summit',9,0,'third',0,0,''],
 ['summit-stamp','stamp-6',4.5,-.4,'first',0,0,''],
 ['spring','spring',3,1.4,'third',0,0,''],
 ['spring-close','spring',0,7.2,'first',0,0,''],
 ['stamp-waterfall','stamp-2',6,.6,'third',0,0,''],
 ['signpost','sign-1935',3,.5,'first',0,0,''],
 ['board-valley','board-valley',6,.6,'third',0,0,''],
 ['cairn','cairn',9,.5,'third',0,0,''],
 ['yeonjuam-junction','stamp-5',5,0,'first',-120,0,''],
 ['plaza-stamp','stamp-1',null,0,'third',0,0,'start=entrance'],
 ['magpie','magpie-3',2.5,.4,'first',0,0,'animals=preview'],
 ['squirrel','squirrel-1',1.5,-1.2,'first',0,0,'animals=preview'],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
async function open(query,save){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?${[query,env].filter(Boolean).join('&')}`);await ready(page);return {context,page,errors};
}
// 1) 자리 좌표와 저장 상태 틀을 얻는다.
const probe=await open('start=demo');
const plan=await probe.page.evaluate(async specs=>{
 const {sample,route}=await import('/src/route.js'),{initialState}=await import('/src/movement.js');
 const all=[...hiking.landscape().interactionProps.sites,...hiking.landscape().interactionProps.spawns],out={};
 for(const [id,target,back,lateral] of specs){if(back===null)continue;const site=all.find(s=>s.id===target);let best=0,d0=Infinity;
  for(let s=0;s<=route.length;s+=.5){const p=sample(s),d=Math.hypot(p.x-site.x,p.z-site.z);if(d<d0){d0=d;best=s;}}
  const p=sample(best),side=Math.sign((site.x-p.x)*p.nx+(site.z-p.z)*p.nz)||1;
  out[id]=JSON.stringify({...initialState({start:'demo'}),s:Math.max(0,best-back),lateral:lateral*side,zone:'route'});}
 return out;
},specs);
await probe.context.close();
try{for(const [id,target,back,lateral,view,drag,wheel,query] of specs){if(only&&!only.includes(id))continue;
 const {context,page,errors}=await open(query,plan[id]??null);
 if(view==='third')await page.keyboard.press('v');await page.waitForTimeout(2500);
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await closeDialogs();
 if(await page.evaluate(()=>hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 const dragBy=async px=>{await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(720+px,450,{steps:16});await page.mouse.up();await page.waitForTimeout(400);};
 // 대상 쪽으로 시점을 돌린다: 100px 끌어 1px당 회전량을 재고, 남은 각도만큼 다시 끈다.
 const heading=()=>page.evaluate(()=>hiking.orientation().cameraHeading);
 const want=await page.evaluate(target=>{const p=hiking.position(),all=[...hiking.landscape().interactionProps.sites,...hiking.landscape().interactionProps.spawns],s=all.find(x=>x.id===target);const x=p.x,z=p.z;return Math.atan2(-(s.x-x),-(s.z-z));},target);
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 {const h0=await heading();await dragBy(100);const k=wrap((await heading())-h0)/100;if(Math.abs(k)>1e-5){for(let i=0;i<2;i++){const px=Math.max(-900,Math.min(900,wrap(want-(await heading()))/k));await dragBy(px);}}}
 // 정상·광장은 자유 이동 구역: 대상 5m 앞까지 W로 걸어간 뒤 다시 조준한다.
 if(back===null){const dist=()=>page.evaluate(target=>{const p=hiking.position(),all=[...hiking.landscape().interactionProps.sites,...hiking.landscape().interactionProps.spawns],s=all.find(x=>x.id===target);return Math.hypot(s.x-p.x,s.z-p.z);},target);
  await page.keyboard.down('w');const stopAt=target.startsWith('magpie')?2.2:4.5;for(let t=0;t<50&&(await dist())>stopAt;t++)await page.waitForTimeout(300);await page.keyboard.up('w');await page.waitForTimeout(800);
  const w2=await page.evaluate(target=>{const p=hiking.position(),all=[...hiking.landscape().interactionProps.sites,...hiking.landscape().interactionProps.spawns],s=all.find(x=>x.id===target);return Math.atan2(-(s.x-p.x),-(s.z-p.z));},target);
  const h0=await heading();await dragBy(60);const k=wrap((await heading())-h0)/60;if(Math.abs(k)>1e-5)await dragBy(Math.max(-900,Math.min(900,wrap(w2-(await heading()))/k)));}
 if(drag)await dragBy(drag);
 if(wheel)await page.mouse.wheel(0,wheel);
 await page.waitForTimeout(5000);await closeDialogs();await page.waitForTimeout(300);
 await (await waitChunks(page)).screenshot({path:`${dir}/${id}.png`});
 // 소품 켬/끔 비교: 같은 시점에서 2초씩 평균.
 const measure=async()=>{await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(2000);return page.evaluate(()=>{const r=window.__hikingPerformance.report();return {drawCalls:r.drawCalls,triangles:r.triangles,renderMs:r.cpuMs?.render,props:r.categories?.['상호작용 소품']??null};});};
 const on=await measure();await page.evaluate(()=>{window.__landscape.interactionProps.group.visible=false;});const off=await measure();await page.evaluate(()=>{window.__landscape.interactionProps.group.visible=true;});
 const visible=await page.evaluate(()=>{const p=window.__landscape.interactionProps,c=[];for(const l of [...p.items,...p.animals]){const i=l.levels.findIndex(x=>x.object.visible);if(i>=0&&i<l.levels.length-1&&l.parent.visible)c.push(`${l.userData.id}:L${i}`);}return c;});
 const row={id,target,errors,shaderErrors:await page.evaluate(()=>hiking.rendering().shaderErrors),visibleProps:visible,on,off,position:await page.evaluate(()=>hiking.position())};
 rows.push(row);console.log(id,JSON.stringify({errors:row.errors.length,shader:row.shaderErrors,visible,dc:[on.drawCalls,off.drawCalls],tri:[Math.round(on.triangles),Math.round(off.triangles)],props:on.props}));
 writeFileSync(`${dir}/results${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
