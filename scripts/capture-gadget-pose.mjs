// 쌍안경·휴대폰 자세 캡처(3인칭 앞·옆). 개발 서버(기본 5175)에서 artifacts/gadget-pose-2026-11-04/view.html을 연다.
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
const port=process.env.PORT??5175,out='artifacts/gadget-pose-2026-11-04';
const B={gadget:'binoculars'},P={gadget:'phone'},S={gadget:'phone',selfie:true};
const shots=[
 {id:'00-rest-front',view:'front',state:{},label:'평소 · 가슴에 건 쌍안경'},
 {id:'01-binoculars-front',view:'front',state:B,label:'쌍안경 · 앞'},{id:'02-binoculars-side',view:'side',state:B,label:'쌍안경 · 옆'},
 {id:'03-binoculars-34',view:'front34',state:B,label:'쌍안경 · 비스듬히'},
 {id:'04-binoculars-up-left',view:'front34',state:{...B,lookPitch:.35,lookYaw:.5},label:'쌍안경 · 왼쪽 위(20°·29°)를 볼 때'},
 {id:'05-binoculars-raise',view:'side',state:{...B,frames:15},label:'쌍안경 · 들어 올리는 중 (0.25초)'},
 {id:'11-phone-front',view:'front',state:P,label:'휴대폰 일반 촬영 · 앞'},{id:'12-phone-side',view:'side',state:P,label:'휴대폰 일반 촬영 · 옆'},
 {id:'13-phone-back34',view:'back34',state:P,label:'휴대폰 일반 촬영 · 뒤에서(화면 쪽)'},
 {id:'14-phone-turn',view:'front34',state:{...P,lookYaw:-.7},label:'휴대폰 · 오른쪽 40°로 돌아 찍기'},
 {id:'21-selfie-front',view:'selfieFront',state:S,label:'셀카 · 앞'},{id:'22-selfie-side',view:'selfieSide',state:S,label:'셀카 · 옆'},
 {id:'23-selfie-34',view:'selfie34',state:S,label:'셀카 · 비스듬히'},
 {id:'24-selfie-back34',view:'back34',state:S,label:'셀카 · 뒤에서(휴대폰 뒷면 렌즈)'},
 {id:'31-binoculars-close',view:'closeSide',state:B,label:'쌍안경 · 가까이'},{id:'32-phone-close',view:'closeFront',state:{...P,lookYaw:.25},label:'휴대폰 · 가까이(뒷면 렌즈)'},
 {id:'33-selfie-close',view:'closeSelfie',state:S,label:'셀카 · 가까이'}];
mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{const p=await b.newPage({viewport:{width:900,height:900}});p.on('pageerror',e=>console.log('오류',e.message));
 await p.goto(`http://127.0.0.1:${port}/${out}/view.html`);await p.waitForFunction(()=>window.ready,null,{timeout:120000});
 for(const s of shots){const r=await p.evaluate(s=>{setView(s.view);label(s.label);pose({gadget:'none',frames:40});return pose(s.state);},s);await p.screenshot({path:`${out}/${s.id}.png`});rows.push({...s,...r});console.log(s.id,JSON.stringify(r));}
 writeFileSync(`${out}/shots.json`,JSON.stringify(rows,null,2));
}finally{await b.close();}
