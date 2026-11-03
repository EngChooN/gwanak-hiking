// 광장 바닥 위로 튀어나온 메시 조사: 광장 영역을 1m 간격으로 위에서 아래로 광선을 쏴 바닥판보다 높은 첫 맞음을 모은다.
// 사용: BASE_URL=http://127.0.0.1:5176 START=gate node scripts/probe-plaza-ground.mjs
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5176',start=process.env.START??'gate',out=process.env.OUT??`artifacts/plaza-fix/probe-${start}.json`;
mkdirSync('artifacts/plaza-fix',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage();await page.goto(`${base}/?quality=balanced&start=${start}&outfit=1`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});await page.waitForTimeout(Number(process.env.WAIT??15000));
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js').catch(()=>null);
  const scene=__hiker.scene.parent;let entrance=null;scene.traverse(o=>{if(o.name==='입구 일주문·광장')entrance=o;});
  const plaza=entrance.children.find(c=>c.isMesh);const frame=hiking.landscape().entrance.frame;
  const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);
  const meshes=[];scene.traverse(o=>{if(o.isMesh&&o.visible&&o!==plaza){let p=o,hidden=false,avatar=false;while(p){if(!p.visible)hidden=true;if(p===__hiker.scene)avatar=true;p=p.parent;}if(!hidden&&!avatar)meshes.push(o);}});
  const R=THREE?new THREE.Raycaster():null;if(!R)return {error:'three import 실패'};
  const pathOf=o=>{const n=[];let p=o;while(p&&p!==scene){n.push(p.name||p.type);p=p.parent;}return n.reverse().join(' / ');};
  const hits=[],summary={};
  for(let gx=-14;gx<=14;gx+=1)for(let gz=-40;gz<=40;gz+=1){
   const x=frame.x+gx*c+gz*s,z=frame.z-gx*s+gz*c;
   R.set(new THREE.Vector3(x,frame.y+60,z),new THREE.Vector3(0,-1,0));R.far=120;
   const pp=R.intersectObject(plaza,false)[0],inPlaza=!!pp,p=pp??{point:{y:__surface(x,z)+.05}};
   const others=R.intersectObjects(meshes,false).filter(h=>h.point.y>p.point.y+.005);
   for(const h of others){const key=(inPlaza?"광장: ":"밖: ")+pathOf(h.object);summary[key]??={count:0,maxAbove:0};summary[key].count++;summary[key].maxAbove=Math.max(summary[key].maxAbove,h.point.y-p.point.y);if(hits.length<400)hits.push({gx,gz,inPlaza,above:+(h.point.y-p.point.y).toFixed(3),obj:key});}
  }
  return {frame,summary,hits};
 });
 writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary??result,null,1));
}finally{await browser.close();}
