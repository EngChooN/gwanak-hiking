// 카툰 폭포(낙수 막·물보라) 옆모습 캡처. 개발 서버(vite)를 띄운 뒤:
//   node scripts/capture-waterfall.mjs [http://127.0.0.1:5191] [출력 폴더] [접미사(before|after)]
// 코스 옆 낙수 두 곳(코스 2,102m·1,122m 둘레, 높이 약 0.7~0.8m)을 낮(12:00)·밤(21:00)에 찍는다.
// 플레이어 자리에서는 둑·바위·풀에 가려서, 캡처하는 동안만 카메라를 낙수 옆(흐름과 직각 SIDE m, 하류 AHEAD m, 낙수 위 끝보다 UP m 위)에 두고
// 낙수 가운데를 보게 한다. 개발 서버의 three 모듈(앱과 같은 인스턴스)에서 Object3D.lookAt을 감싸 카메라만 바꾼다. 게임 코드는 건드리지 않는다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const [base='http://127.0.0.1:5191',out='artifacts/waterfall-2026-11-06',suffix='after']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const FALLS=[{name:'fall-2102',x:239.6,z:1913,s:2102},{name:'fall-1122',x:79.9,z:1019.4,s:1122}];
const SIDE=+(process.env.SIDE??3.2),AHEAD=+(process.env.AHEAD??1.4),UP=+(process.env.UP??1.1);
const TIMES=[['day','12:00'],['night','21:00']],viewport={width:1280,height:800},report={};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
for(const fall of FALLS)for(const [label,time] of TIMES){
 const context=await browser.newContext({viewport,deviceScaleFactor:1});
 const probe=await context.newPage();await probe.goto(`${base}/?startMode=manual`,{waitUntil:'domcontentloaded'});
 const save=await probe.evaluate(async s=>{const {initialState}=await import('/src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s,lateral:0,zone:'route'});},fall.s);
 await probe.close();
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});
 await page.goto(`${base}/?${new URLSearchParams({outfit:'1',time,weather:'clear',quality:'high'})}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 await page.evaluate(()=>window.hiking.chunks.ready());
 await page.waitForTimeout(1000);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 const view=await page.evaluate(async ([f,SIDE,AHEAD,UP])=>{
  const url=performance.getEntriesByType('resource').map(e=>e.name).find(n=>/\/deps\/three\.js/.test(n));const THREE=await import(url);
  // 이 낙수의 위 끝 가운데(uv 0.5,0)와 아래 끝 가운데(uv 0.5,1)
  let top=null,bottom=null,best=Infinity;
  window.__landscape.group.traverse(o=>{if(o.name!=='계곡 낙수')return;const p=o.geometry.attributes.position,uv=o.geometry.attributes.uv;
   for(let i=0;i<p.count;i++)if(Math.abs(uv.getX(i)-.5)<1e-3&&uv.getY(i)<1e-3){const d=Math.hypot(p.getX(i)-f.x,p.getZ(i)-f.z);if(d<best){best=d;top={o,i};}}});
  const P=top.o.geometry.attributes.position,UV=top.o.geometry.attributes.uv,t=new THREE.Vector3().fromBufferAttribute(P,top.i);let bd=Infinity;
  for(let i=0;i<P.count;i++)if(Math.abs(UV.getX(i)-.5)<1e-3&&UV.getY(i)>1-1e-3){const v=new THREE.Vector3().fromBufferAttribute(P,i),d=v.distanceTo(t);if(d<bd){bd=d;bottom=v;}}
  const dir=new THREE.Vector3(bottom.x-t.x,0,bottom.z-t.z).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);
  // 길 쪽(플레이어 쪽) 옆에서 본다.
  const me=window.hiking.position(),toMe=new THREE.Vector3(me.x-t.x,0,me.z-t.z);if(side.dot(toMe)<0)side.negate();
  const pos=t.clone().addScaledVector(side,SIDE).addScaledVector(dir,AHEAD);pos.y=t.y+UP;
  const target=t.clone().lerp(bottom,.5).addScaledVector(dir,.2);
  window.__camOverride={pos,target};
  const look=THREE.Object3D.prototype.lookAt;
  THREE.Object3D.prototype.lookAt=function(...a){if(this.isCamera&&window.__camOverride){this.position.copy(window.__camOverride.pos);return look.call(this,window.__camOverride.target);}return look.apply(this,a);};
  return {top:t.toArray(),bottom:bottom.toArray(),pos:pos.toArray(),drop:+(t.y-bottom.y).toFixed(2)};
 },[fall,SIDE,AHEAD,UP]);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 await page.addStyleTag({content:'#section-jump{display:none!important}'});
 await page.waitForTimeout(2500);
 const file=`${out}/${fall.name}-${label}-${suffix}.png`;await page.screenshot({path:file});
 report[`${fall.name}-${label}`]={file,view,errors,shaderErrors:await page.evaluate(()=>window.hiking.rendering().shaderErrors?.length??0)};
 console.log(fall.name,label,JSON.stringify(report[`${fall.name}-${label}`]));
 await context.close();
}
writeFileSync(`${out}/capture-${suffix}.json`,JSON.stringify(report,null,1));
await browser.close();
