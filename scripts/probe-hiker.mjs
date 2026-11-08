// 등산객 발 접지 검사: 전체 경로를 0.1m씩 걸으며 지형 관통·딛는 발 미끄러짐을 센다. (dev 서버 필요, PORT 환경변수)
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const port=process.env.PORT??5175,ds=Number(process.env.DS??.1);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{const page=await browser.newPage();page.on('pageerror',e=>{throw e;});
 await page.goto(`http://127.0.0.1:${port}/hiking/?start=demo`);await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,{timeout:120000});await page.waitForTimeout(3000);
 const r=await page.evaluate(async ds=>{const {route,sample,strideFor}=await import('/src/route.js');const h=window.__hiker,surf=window.__surface;
  let maxTruePen=0,truePen1=0,trueN=0,floatOver3=0,maxFloat=0,unanch=0,phase=0,first=true,prev=null,frames=0,planted=0,slip3=0,maxSlip=0,maxPen=0,maxPlantedErr=0,err3=0,plantedFrames=0;const byMat={};
  for(let s=.5;s<route.length-.5;s+=ds){const q=sample(s),stride=strideFor(q);phase+=ds/stride;
   if(first){h.snapTo(q.heading);first=false;}else h.turnTo(q.heading,.07);
   h.scene.position.set(q.x,surf(q.x,q.z),q.z);h.update({clip:q.slope>.15?'Climb':'Walk',distance:phase,stride:1,stepLength:stride,slope:q.slope});
   const c=h.ground({s,lateral:0,moving:true,phase,floorHeight:()=>0,sample,surfaceHeight:surf,measure:frames%4===0});frames++;
   c.forEach((x,i)=>{maxPen=Math.max(maxPen,x.penetration);if(x.truePen!==undefined){maxTruePen=Math.max(maxTruePen,x.truePen);if(x.truePen>.01)truePen1++;trueN++;if(x.lift<.008){const fl=x.trueFloat;if(fl>.03)floatOver3++;maxFloat=Math.max(maxFloat,fl);}}const m=byMat[q.material]??={planted:0,slip3:0,maxSlip:0,maxPen:0};m.maxPen=Math.max(m.maxPen,x.penetration);
    if(x.lift<.008){plantedFrames++;maxPlantedErr=Math.max(maxPlantedErr,x.error);if(x.error>.03)err3++;}
    if(x.lift<.008&&!x.anchored)unanch++;
    if(prev&&prev[i].anchored&&x.anchored){const pr=prev[i],useToe=!x.heelOn&&!pr.heelOn,useHeel=x.heelOn&&pr.heelOn,pa=useToe?[x.toe,pr.toe]:[x.foot,pr.foot];if(!useToe&&!useHeel)return;const d=Math.hypot(pa[0][0]-pa[1][0],pa[0][1]-pa[1][1]);planted++;m.planted++;maxSlip=Math.max(maxSlip,d);m.maxSlip=Math.max(m.maxSlip,d);if(d>.03){slip3++;m.slip3++;}}});
   prev=c;}
  return {frames,planted,plantedFrames,plantedErrOver3cm:err3,unanchoredStance:unanch,trueN,maxTruePen,truePenOver1cm:truePen1,floatOver3cm:floatOver3,maxFloat,slipOver3cm:slip3,maxSlip,maxPen,maxPlantedErr,byMat};},ds);
 console.log(JSON.stringify(r));writeFileSync('artifacts/hiker-contact.json',JSON.stringify({ds,...r},null,2));
 assert.ok(r.maxPen<=.01,`지형 관통 ${r.maxPen}m`);assert.ok(r.maxTruePen<=.01,`신발 메시 실측 관통 ${r.maxTruePen}m`);assert.ok(r.plantedErrOver3cm/r.plantedFrames<.01,`딛는 발 접지 오차 3cm 초과 비율 ${r.plantedErrOver3cm}/${r.plantedFrames}`);assert.ok(r.slipOver3cm/r.planted<.01,'딛는 발 미끄러짐 1% 초과');
}finally{await browser.close();}
