// 멧토끼 시안 캡처. 개발 서버를 띄운 뒤: node scripts/capture-hare-concept.mjs 출력.png [장면id=hare]. 주소는 아래 base를 바꿔 쓴다.
import {chromium} from '@playwright/test';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://127.0.0.1:5330/src/toon/props-concepts.html?hud=0&s='+(process.argv[3]??'hare'),{waitUntil:'load'});
await p.waitForFunction(()=>window.props?.frames>8,null,{timeout:90000});await p.waitForTimeout(500);
await p.screenshot({path:process.argv[2]});console.log(JSON.stringify(errs));await b.close();
