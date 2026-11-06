// 실제 게임 화면 광장·정상 캡처(카툰/실사). 빌드 미리보기 서버를 띄운 뒤:
//   node src/toon/capture-game.mjs [http://127.0.0.1:4173] [출력 폴더] [접미사(before|after)] [toon,realistic] [probe]
// window.hiking.ready()와 window.hiking.chunks.ready()를 기다린 뒤 찍는다. probe를 주면 카메라 근처 메시 재질을 덤프한다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const [base='http://127.0.0.1:4173',out='artifacts/toon-fix-2026-11-05',suffix='after',styles='toon,realistic',probe]=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const SHOTS=[['start','entrance','12:00'],['summit','summit','16:40']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};
for(const style of styles.split(',')){
 for(const [name,start,time] of SHOTS){
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});
  await page.goto(`${base}/?style=${style}&start=${start}&time=${time}&weather=clear`);
  await page.waitForFunction(()=>!!window.hiking?.ready,null,{timeout:120000});
  await page.evaluate(()=>window.hiking.ready());
  await page.waitForFunction(()=>window.hiking.started===true,null,{timeout:300000});
  await page.evaluate(()=>window.hiking.chunks.ready());
  await page.waitForTimeout(2500);
  await page.evaluate(()=>window.hiking.chunks.ready().then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
  const file=`${out}/${name}-${style}-${suffix}.png`;await page.screenshot({path:file});
  const info={errors,shaderErrors:await page.evaluate(()=>window.hiking.rendering().shaderErrors?.length??0)};
  if(probe)info.near=await page.evaluate(()=>{
   const cam=window.hiking.orientation().camera,root=window.__landscape.group,seen=new Map();
   root.traverse(o=>{if(!o.isMesh)return;if(o.isInstancedMesh&&!o.boundingSphere)o.computeBoundingSphere();o.geometry.boundingSphere||o.geometry.computeBoundingSphere();const s=(o.isInstancedMesh?o.boundingSphere:o.geometry.boundingSphere).clone().applyMatrix4(o.matrixWorld);
    const d=Math.hypot(s.center.x-cam[0],s.center.y-cam[1],s.center.z-cam[2])-s.radius;if(d>25||!o.visible)return;
    const m=Array.isArray(o.material)?o.material[0]:o.material,key=`${o.name}|${m.type}|${m.name}`;
    if(!seen.has(key))seen.set(key,{mesh:o.name,parent:o.parent?.name,type:m.type,name:m.name,color:m.color?.getHexString(),vc:m.vertexColors,map:!!m.map,inst:!!o.isInstancedMesh,count:o.count,metric:o.userData.metricKind,instColor:!!o.instanceColor,key:m.customProgramCacheKey?.().slice(0,60),ud:Object.keys(m.userData)});});
   return [...seen.values()];});
  report[`${name}-${style}`]=info;console.log(name,style,JSON.stringify(info).slice(0,4000));
  await ctx.close();
 }
}
writeFileSync(`${out}/capture-${suffix}.json`,JSON.stringify(report,null,1));
await browser.close();
