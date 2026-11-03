// 접지 진단: 구간(S0~S1)만 0.1m씩 걸으며 관통·미끄러짐 프레임의 위치와 원인 값을 기록한다. (워밍업 8m)
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const port=process.env.PORT??5176,ds=Number(process.env.DS??.1),RANGES=(process.env.RANGES??`${process.env.S0??0}-${process.env.S1??1e9}`).split(',').map(r=>r.split('-').map(Number)),out=process.env.OUT??`/tmp/diag-${RANGES[0][0]}.json`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{const page=await browser.newPage();page.on('pageerror',e=>{throw e;});
 await page.goto(`http://127.0.0.1:${port}/?start=demo`);await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,{timeout:120000});await page.waitForTimeout(3000);
 const r=await page.evaluate(async ({ds,RANGES})=>{const {route,sample,strideFor}=await import('/src/route.js');const h=window.__hiker,surf=window.__surface;
  const ev=[];for(const [S0,S1] of RANGES){let phase=0,first=true,prev=null,frames=0;const start=Math.max(.5,S0-8),end=Math.min(route.length-.5,S1);
  for(let s=start;s<end;s+=ds){const q=sample(s),stride=strideFor(q);phase+=ds/stride;
   const h0=h.scene.rotation.y;if(first){h.snapTo(q.heading);first=false;}else h.turnTo(q.heading,.07);const dturn=h.scene.rotation.y-h0;
   h.scene.position.set(q.x,surf(q.x,q.z),q.z);h.update({clip:q.slope>.15?'Climb':'Walk',distance:phase,stride:1,stepLength:stride,slope:q.slope});
   const c=h.ground({s,lateral:0,moving:true,phase,floorHeight:()=>0,sample,surfaceHeight:surf,measure:frames%4===0});frames++;
   if(s>=S0)c.forEach((x,i)=>{const rec=()=>({s:+s.toFixed(1),mat:q.material,slope:+q.slope.toFixed(2),side:i,turn:+dturn.toFixed(3),stride:+stride.toFixed(2),...Object.fromEntries(Object.entries(x.dbg).map(([k,v])=>[k,+v.toFixed(3)])),anch:x.anchored,heelOn:x.heelOn,lift:+x.lift.toFixed(3)});
    if(x.truePen!==undefined&&x.truePen>.01)ev.push({t:'pen',pen:+x.truePen.toFixed(4),...rec()});
    if(prev&&prev[i].anchored&&x.anchored){const pr=prev[i],useToe=!x.heelOn&&!pr.heelOn,useHeel=x.heelOn&&pr.heelOn;if(!useToe&&!useHeel)return;const pa=useToe?[x.toe,pr.toe]:[x.foot,pr.foot],d=Math.hypot(pa[0][0]-pa[1][0],pa[0][1]-pa[1][1]);if(d>.03)ev.push({t:'slip',d:+d.toFixed(3),useToe,...rec()});}
    if(x.lift<.008&&!x.anchored)ev.push({t:'unanch',...rec()});});
   prev=c;}}
  return ev;},{ds,RANGES});
 writeFileSync(out,JSON.stringify(r));console.log(out,r.length);
}finally{await browser.close();}
