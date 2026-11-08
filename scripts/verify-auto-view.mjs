// 실제 빌드에서 자동 걷기 중 프레임당 카메라·몸 회전량을 잰다. npm run build 뒤 vite preview(4173)가 떠 있어야 한다.
// node scripts/verify-auto-view.mjs [초] [start]
// beforeProxy_routeHeading: GPX 선분 방향의 프레임당 변화 = 고치기 전 카메라(baseHeading()+고정 yaw)가 겪던 회전.
import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const seconds=Number(process.argv[2])||40,start=process.argv[3]||'demo',out='artifacts/auto-view-2026-11-06';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:4173/hiking/?start=${start}&time=12:00&weather=clear`);
await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});
const result=await page.evaluate(async seconds=>{
 window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}}));
 const DEG=180/Math.PI,d=(a,b)=>Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)))*DEG,cam=[],body=[],dts=[],route=[];
 let prev=window.hiking.orientation(),last=performance.now();const s0=window.hiking.snapshot().s;
 await new Promise(done=>{const end=performance.now()+seconds*1000;const tick=now=>{const o=window.hiking.orientation();cam.push(d(prev.cameraHeading,o.cameraHeading));route.push(d(prev.routeHeading,o.routeHeading));body.push(d(prev.avatarHeading,o.avatarHeading));dts.push(now-last);last=now;prev=o;if(now<end)requestAnimationFrame(tick);else done();};requestAnimationFrame(tick);});
 const st=a=>{const s=[...a].sort((x,y)=>x-y);return {max:+s.at(-1).toFixed(3),p95:+s[Math.floor(.95*s.length)].toFixed(3),over5:a.filter(v=>v>5).length,over2:a.filter(v=>v>2).length};};
 return {frames:cam.length,auto:window.hiking.snapshot().auto,walkedMetres:+(window.hiking.snapshot().s-s0).toFixed(1),camera:st(cam),beforeProxy_routeHeading:st(route),body:st(body),frameMs:st(dts)};
},seconds);
result.errors=errors;await page.screenshot({path:`${out}/auto-walk-${start}.png`});
writeFileSync(`${out}/browser-${start}.json`,JSON.stringify(result,null,1));console.log(JSON.stringify(result));await browser.close();
