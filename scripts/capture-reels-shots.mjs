// 릴스 풍경 장면 확인 촬영(docs/릴스-장면위치.md). scripts/reels-scenes.json 자리를 휴대폰 세로 1080×1920(360×640 ×3)으로 찍는다.
// 개발 서버를 먼저 띄운다: npx vite --host 127.0.0.1 --port 5310
//   node scripts/capture-reels-shots.mjs [장면,...] [--base http://127.0.0.1:5310] [--out artifacts/reels/shots] [--quality high] [--scenes 다른.json]
// 결과: <out>/<장면>.png(HUD 보임), <out>/<장면>-clean.png(HUD 숨김), <out>/results.json(실제 방위·시점·시각·오류)
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {sample} from '../src/route.js';

const argv=process.argv.slice(2),opt={},names=[];
for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--'))opt[a.slice(2)]=argv[++i];else names.push(...a.split(','));}
const scenes=JSON.parse(readFileSync(opt.scenes??'scripts/reels-scenes.json','utf8'));delete scenes._설명;
const base=opt.base??'http://127.0.0.1:5310',out=opt.out??'artifacts/reels/shots';mkdirSync(out,{recursive:true});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),deg=r=>((r*180/Math.PI)%360+360)%360;
// 장면 → 주소 옵션과 이어하기 저장값(코스 위 자리일 때만)
export function sceneSetup(sc){
 const q=new URLSearchParams({time:sc.time,weather:sc.weather??'clear',season:sc.season??'autumn',quality:opt.quality??'high'});
 if(sc.start)q.set('start',sc.start);
 const seed=sc.s===undefined?null:{...initialState({start:'demo'}),zone:'route',s:sc.s,lateral:sc.lateral??0,view:sc.view??'first'};
 // 원하는 카메라 방위: bearing(절대) 또는 코스 진행 방향 + yawFromRoute(+왼쪽)
 const bearing=sc.bearing??(sc.s!==undefined?(deg(-sample(sc.s).heading)-(sc.yawFromRoute??0)+360)%360:null);
 return {query:q.toString(),seed,bearing};
}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const results={};
try{for(const name of names.length?names:Object.keys(scenes)){
 const sc=scenes[name];if(!sc)throw new Error(`장면 없음: ${name}`);
 const {query,seed,bearing}=sceneSetup(sc);
 const context=await browser.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
 await context.addInitScript(({seed,key})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-stick-used','1');if(seed)localStorage.setItem(key,JSON.stringify(seed));},{seed,key:SAVE_KEY});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
 const url=`${base}/hiking/?${query}`;await page.goto(url);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.waitForTimeout(1500);await closeDialogs();
 // 시점: 저장값이 없는 출발(plaza·summit)은 시점 칩으로 맞춘다.
 if(sc.view&&await page.evaluate(()=>window.hiking.snapshot().view)!==sc.view)await page.keyboard.press('v');
 // 시선 끌기: 오른쪽 아래(조이스틱이 안 생기는 시선 영역)를 마우스로 끌어 방위·위아래를 맞춘다. 두 번 보정.
 const drag=(dx,dy)=>page.evaluate(([dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('look-zone')&&getComputedStyle(document.getElementById('look-zone')).display!=='none'?document.getElementById('look-zone'):document.getElementById('world');
  const x=innerWidth*.72,y=innerHeight*.45,ev=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));
  ev('pointerdown',x,y);for(let i=1;i<=20;i++)ev('pointermove',x+dx*i/20,y+dy*i/20);ev('pointerup',x+dx,y+dy);},[dx,dy]);
 for(let k=0;k<3;k++){
  const o=await page.evaluate(()=>window.hiking.orientation());
  const dYaw=bearing===null?0:wrap(-bearing*Math.PI/180-o.cameraHeading),dPitch=sc.pitch===undefined?0:sc.pitch*Math.PI/180-o.pitch;
  if(Math.abs(dYaw)<.01&&Math.abs(dPitch)<.01)break;
  await drag(-dYaw/.004,-dPitch/.003);await page.waitForTimeout(400);
 }
 await page.waitForTimeout(3500);await closeDialogs();
 const file=`${out}/${name}.png`;await (await waitChunks(page)).screenshot({path:file});
 // 풍경만: HUD 숨기기(화면 버튼과 같은 이벤트) + 남는 '화면 보이기' 단추·조이스틱 자리·출처 줄도 감춘다(출처는 캡션에 적는다).
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 await page.addStyleTag({content:'.hud-restore,.hud-hint,#joystick,#source-line,.source-line,#section-jump{display:none!important}'});await page.waitForTimeout(600);
 await page.screenshot({path:`${out}/${name}-clean.png`});
 const info=await page.evaluate(()=>{const o=window.hiking.orientation(),s=window.hiking.snapshot();return {zone:s.zone,s:Math.round(s.s),view:s.view,cameraBearing:Math.round(((-o.cameraHeading*180/Math.PI)%360+360)%360*10)/10,pitchDeg:Math.round(o.pitch*180/Math.PI*10)/10,season:window.hiking.season().season,dpr:window.devicePixelRatio,env:document.getElementById('env-chip')?.innerText.replace(/\s+/g,' ')};});
 results[name]={label:sc.label,url,seed:seed?{s:seed.s,lateral:seed.lateral,view:seed.view}:null,wantBearing:bearing===null?null:Math.round(bearing*10)/10,...info,file,errors};
 console.log(name,JSON.stringify(info),'오류',errors.length);
 await context.close();
}}finally{await browser.close();}
writeFileSync(`${out}/results.json`,JSON.stringify(results,null,1));
