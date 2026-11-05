// 청크 스트리밍 왕복 메모리 측정(기획서 §4). 개발용 구간 이동(hiking.jumpTo)으로 입구 광장 → 정상 → 광장을 오가며
// renderer.info.memory(geometries·textures)와 청크 해제 수(status().disposed)를 기록한다. 왕복 후 광장 값이 처음 광장 값 근처로 돌아와야 한다.
// 사용: (vite preview 또는 dev 서버를 띄운 뒤) BASE_URL=http://127.0.0.1:4173 STYLE=realistic|toon node scripts/measure-chunk-memory.mjs [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.argv[2]??'artifacts/ab-chunks-2026-11-05',base=process.env.BASE_URL||'http://127.0.0.1:4173',styles=(process.env.STYLE??'realistic,toon').split(',');
const route=(process.env.ROUTE??'plaza,summit,plaza,summit,plaza').split(',');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const result={base,route,styles:{}};
for(const style of styles){
 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?style=${style}&outfit=1&start=entrance&time=12:00&weather=clear&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});
 const sample=async label=>{
  await page.evaluate(()=>window.hiking.chunks.ready());await page.waitForTimeout(4000);
  return page.evaluate(label=>{const s=window.hiking.chunks.status();return {label,position:window.hiking.position(),memory:s.memory,terrain:{loaded:s.loaded,pending:s.pending,ids:s.ids,disposed:s.disposed},vegetation:s.vegetation&&{loaded:s.vegetation.loaded,pending:s.vegetation.pending,disposed:s.vegetation.disposed}};},label);
 };
 const rows=[await sample(route[0])];
 for(const id of route.slice(1)){
  const ok=await page.evaluate(id=>window.hiking.jumpTo(id),id);if(!ok)throw new Error(`이동 실패: ${id}`);
  rows.push(await sample(id));
 }
 const first=rows[0].memory,last=rows.at(-1).memory;
 result.styles[style]={rows,errors,roundTrip:{geometries:[first.geometries,last.geometries],textures:[first.textures,last.textures],geometryDelta:last.geometries-first.geometries,textureDelta:last.textures-first.textures,peakGeometries:Math.max(...rows.map(r=>r.memory.geometries))}};
 console.log(style,JSON.stringify(rows.map(r=>[r.label,r.memory.geometries,r.memory.textures,r.terrain.loaded,r.terrain.disposed.geometries,r.vegetation?.loaded,r.vegetation?.disposed.geometries])),JSON.stringify(result.styles[style].roundTrip),errors);
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/chunk-memory.json`,JSON.stringify(result,null,1));
