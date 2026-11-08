// 자동 걷기 백그라운드 진행(2026-11-08 대표 피드백): 다른 창으로 가거나(blur) 탭을 숨겨(rAF 정지) 두어도 자동 걷기가 이어진다.
// 숨은 탭은 document.hidden을 true로 덮고 requestAnimationFrame을 멈춰 흉내 낸다. 사용: npx playwright test background-walk
import {test,expect} from '@playwright/test';

test('자동 걷기는 창을 떠나고 탭이 숨어도 계속 걷는다',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/hiking/?start=demo&time=12&weather=clear&season=autumn&quality=low');
 await page.waitForFunction(()=>window.hiking?.started===true||window.hiking?.loading?.().phase==='error',null,{timeout:300000});
 expect(await page.evaluate(()=>window.hiking.started),'게임 시작').toBe(true);
 await page.evaluate(()=>{addEventListener('hiking:state',e=>{window.__bgState=e.detail;});window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}}));});
 await page.waitForFunction(()=>window.__bgState?.auto&&window.__bgState.s>0,null,{timeout:30000});
 // 다른 창으로 감: 예전에는 여기서 자동 걷기가 꺼졌다.
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await page.waitForTimeout(1500);
 const afterBlur=await page.evaluate(()=>window.__bgState);
 expect(afterBlur.auto).toBe(true);
 // 탭 숨김: 브라우저가 rAF를 멈춘 상황.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});window.requestAnimationFrame=()=>0;document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(800);
 const hiddenStart=await page.evaluate(()=>window.__bgState.s);
 await page.waitForTimeout(8000);
 const hiddenEnd=await page.evaluate(()=>window.__bgState);
 console.log(`숨은 8초 동안 ${(hiddenEnd.s-hiddenStart).toFixed(1)}m 걸음, auto=${hiddenEnd.auto}`);
 expect(hiddenEnd.auto).toBe(true);
 expect(hiddenEnd.s-hiddenStart).toBeGreaterThan(3);
 expect(errors).toEqual([]);
});
