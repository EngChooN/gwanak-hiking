// 카툰 등산객 「동동이」 대조 캡처. 개발 서버(vite)를 띄운 뒤: node scripts/capture-dongdong.mjs [http://127.0.0.1:5311] [출력 폴더]
// 1) 시안(mascot-concepts.html?c=0)과 실제 캐릭터(character-preview.html?match=concept)를 같은 카메라로 찍어 나란히 붙인다(정면·3/4·측면·후면·걷기).
// 2) 실제 캐릭터의 서기·걷기·뛰기·앉기·차·쌍안경·휴대폰·셀카를 정면·측면·3/4로 찍는다.
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5311',out=process.argv[3]??'artifacts/dongdong';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[],vp={width:700,height:860};
async function open(path,ready){const page=await browser.newPage({viewport:vp,deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}${path}`,{waitUntil:'load'});await page.waitForFunction(ready,null,{timeout:120000});return page;}
const settle=async(page,get)=>{const n=await page.evaluate(get);await page.waitForFunction(([g,k])=>eval(g)>k+5,[get.toString().replace(/^\(\)=>/,''),n]);};
const concept=await open('/src/toon/mascot-concepts.html?hud=0&c=0&view=three&t=1.2',()=>window.mascot?.frames>8);
const actual=await open('/src/toon/character-preview.html?hud=0&match=concept',()=>window.charPreview?.frames>8);
const cf=()=>window.mascot.frames,af=()=>window.charPreview.frames;
// 시안 보기 → 미리보기 보기 이름(시안은 +Z가 앞·왼쪽 +X, 미리보기는 -Z가 앞이라 3/4·측면은 왼쪽에서 본다)
const pairs=[['front','front',0,'Idle',0],['three','threeL',0,'Idle',0],['side','sideL',0,'Idle',0],['back','back',0,'Idle',0],['side-walk','sideL',1,'Walk',.5]];
for(const [cv,av,walk,clip,phase] of pairs){
 await concept.evaluate(o=>window.mascot.set(o),{view:cv.replace('-walk',''),walk,t:walk?.13:1.2});await settle(concept,cf);await concept.screenshot({path:`${out}/concept-${cv}.png`});
 await actual.evaluate(o=>window.charPreview.set(o),{view:av,clip,phase,pose:'stand',gadget:'none',selfie:false});await settle(actual,af);await actual.screenshot({path:`${out}/actual-${cv}.png`});
}
const shots=[['stand','Idle',{}],['walk','Walk',{phase:.25}],['walk2','Walk',{phase:.75}],['run','Run',{phase:.3}],['run2','Run',{phase:.8}],['sit','Idle',{pose:'sit'}],['tea','Idle',{pose:'tea',tea:.5}],['binoculars','Idle',{gadget:'binoculars'}],['phone','Idle',{gadget:'phone'}],['selfie','Idle',{gadget:'phone',selfie:true}]];
for(const [name,clip,o] of shots)for(const view of ['front','sideL','threeL']){
 await actual.evaluate(o=>window.charPreview.set(o),{view,clip,phase:0,pose:'stand',gadget:'none',selfie:false,...o});await settle(actual,af);await actual.screenshot({path:`${out}/pose-${name}-${view}.png`});
}
console.log('errors',JSON.stringify(errors));
await browser.close();
