// 동동이 보완 캡처: 작은 카툰 쌍안경(가슴·눈에 댐·위/옆 보기)과 걷기→뛰기 전환(측면 연속). 개발 서버를 띄운 뒤:
// node scripts/capture-dongdong-fixes.mjs [http://127.0.0.1:5311] [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:5311',out=resolve(process.argv[3]??'artifacts/dongdong/fixes');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[],page=await browser.newPage({viewport:{width:560,height:700},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${base}/src/toon/character-preview.html?hud=0&match=concept`,{waitUntil:'load'});await page.waitForFunction(()=>window.charPreview?.frames>8,null,{timeout:120000});
const shot=async(name,o)=>{const n=await page.evaluate(()=>window.charPreview.frames);await page.evaluate(o=>window.charPreview.set(o),{clip:'Idle',phase:0,pose:'stand',gadget:'none',selfie:false,lookYaw:0,lookPitch:0,runFrames:undefined,...o});
 await page.waitForFunction(n=>window.charPreview.frames>n+4,n);await page.screenshot({path:`${out}/${name}.png`});return page.evaluate(()=>window.charPreview.state.runBlend);};
const bino=[['bino-rest-front',{view:'front'}],['bino-rest-three',{view:'threeL'}],['bino-eyes-front',{view:'front',gadget:'binoculars'}],['bino-eyes-side',{view:'sideL',gadget:'binoculars'}],['bino-eyes-three',{view:'threeL',gadget:'binoculars'}],
 ['bino-up-side',{view:'sideL',gadget:'binoculars',lookPitch:.7}],['bino-left-front',{view:'front',gadget:'binoculars',lookYaw:1.1}],['bino-right-three',{view:'three',gadget:'binoculars',lookYaw:-1.1,lookPitch:.4}]];
for(const [n,o] of bino)await shot(n,o);
const runs=[];for(const f of [0,2,4,6,8,11,15,24]){const b=await shot(`run-${String(f).padStart(2,'0')}`,{view:'sideL',runFrames:f,dist:3.2});runs.push([f,b]);}
const img=(f,cap,w=200)=>`<figure><img src="${f}.png" width="${w}"><figcaption>${cap}</figcaption></figure>`;
const css='body{margin:0;background:#20242c;color:#eee;font:13px system-ui;padding:6px}figure{margin:3px;display:inline-block;text-align:center}img{display:block;border-radius:6px}h3{margin:8px 4px}';
writeFileSync(`${out}/bino.html`,`<!doctype html><meta charset="utf-8"><style>${css}</style><h3>작은 카툰 쌍안경 — 가슴에 걸기 · 눈에 대기 · 위·옆 보기</h3>${bino.map(([n])=>img(n,n.replace('bino-','')))}`.replace(/,/g,''));
writeFileSync(`${out}/run.html`,`<!doctype html><meta charset="utf-8"><style>${css}</style><h3>걷기 → 뛰기 전환(측면, 1/30초 간격 프레임 · 뛰기 섞는 비율)</h3>${runs.map(([f,b])=>img(`run-${String(f).padStart(2,'0')}`,`${f}프레임 · 뛰기 ${Math.round(b*100)}%`,180)).join('')}`);
for(const [n,w] of [['bino',900],['run',800]]){const p=await browser.newPage({viewport:{width:w,height:400}});await p.goto(`file://${out}/${n}.html`);await p.waitForLoadState('load');await p.screenshot({path:`${out}/${n}.png`,fullPage:true});await p.close();}
console.log('runs',JSON.stringify(runs),'errors',JSON.stringify(errors));
await browser.close();
