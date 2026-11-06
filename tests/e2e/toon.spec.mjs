// 카툰 e2e(기획서 §4, 2026-11-06 실사 모드 제거 뒤 카툰 하나). 청크 대기 뒤 확인·캡처한다.
// 빌드본이 필요하다: npm run build 후 npm run test:e2e.
import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// 실사 전용 에셋·코드는 배포에서 빠졌다. 받으려 하면(404 포함) 실사 경로가 남은 것이다.
const FORBIDDEN=[/-diff\.jpg(\?|$)/,/-nor_gl\.png(\?|$)/,/-rough\.jpg(\?|$)/,/\.hdr(\?|$)/,/\/assets\/realistic\/generated\/nature\//,/\/assets\/realistic\/models\//,/terrain-material\.js/,/RGBELoader/,/SSAOPass/];
const TIMES={day:'12:00',sunset:'17:20',night:'21:00'};
const SHOTS='artifacts/e2e-2026-11-05';

async function openGame(page,{time='12:00',start='entrance'}={}){
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push(r.url()));
 await page.goto(`/?outfit=1&start=${start}&time=${time}&weather=clear&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started===true||window.hiking?.loading?.().phase==='error',null,{timeout:300000});
 expect(await page.evaluate(()=>window.hiking.started),'게임 시작').toBe(true);
 return {errors,requests};
}
async function settle(page,ms=3000){
 await page.evaluate(()=>window.hiking.chunks.ready());
 await page.waitForFunction(()=>{const s=window.hiking.chunks.status();return s.pending===0&&(!s.vegetation||s.vegetation.pending===0)&&!window.hiking.rendering().compiling;},null,{timeout:120000});
 await page.waitForTimeout(ms);
}
async function jump(page,id){
 expect(await page.evaluate(id=>window.hiking.jumpTo(id),id),`이동 ${id}`).toBe(true);
 await settle(page);
}
const forestTarget=page=>page.evaluate(()=>{const ids=window.hiking.jumpTargets().filter(id=>!['plaza','gate','summit'].includes(id));return ids[Math.floor(ids.length/2)];});

test('시작·청크 준비·실사 에셋 요청 없음',async({page})=>{
 const {errors,requests}=await openGame(page);
 await settle(page);
 const status=await page.evaluate(()=>window.hiking.chunks.status());
 expect(status.loaded,'출발점 주변 지형 청크').toBeGreaterThan(0);
 const bad=requests.filter(u=>FORBIDDEN.some(re=>re.test(u)));
 expect(bad,'실사 전용 요청').toEqual([]);
 expect(await page.evaluate(()=>window.hiking.style)).toBe('toon');
 expect(errors,'페이지 오류').toEqual([]);
});

test('정상 왕복 후 청크 해제·메모리 복귀',async({page})=>{
 const {errors}=await openGame(page);
 await settle(page);
 const mem=()=>page.evaluate(()=>window.hiking.chunks.status().memory);
 await jump(page,'summit');await jump(page,'plaza');
 const base=await mem();
 await jump(page,'summit');
 const disposed=await page.evaluate(()=>window.hiking.chunks.status().disposed);
 await jump(page,'plaza');
 const back=await mem();
 expect(disposed.geometries,'해제된 청크 지오메트리').toBeGreaterThan(0);
 expect(Math.abs(back.geometries-base.geometries),'geometries 복귀').toBeLessThanOrEqual(10);
 expect(Math.abs(back.textures-base.textures),'textures 복귀').toBeLessThanOrEqual(4);
 expect(errors).toEqual([]);
});

test('카툰 기준 스냅샷(광장·정상)',async({page})=>{
 await openGame(page);
 await settle(page);
 await expect(page).toHaveScreenshot('toon-plaza-day.png');
 await jump(page,'summit');
 await expect(page).toHaveScreenshot('toon-summit-day.png');
});

for(const [label,time] of Object.entries(TIMES)){
 test(`카툰 캡처 ${label} × 숲·정상 전망`,async({page})=>{
  mkdirSync(SHOTS,{recursive:true});
  const {errors}=await openGame(page,{time});
  await settle(page);
  await jump(page,await forestTarget(page));
  await page.screenshot({path:`${SHOTS}/toon-${label}-forest.png`});
  await jump(page,'summit');
  await page.screenshot({path:`${SHOTS}/toon-${label}-summit.png`});
  expect(errors).toEqual([]);
 });
}
