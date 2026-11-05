// 카툰 캐릭터 얼굴·어깨 근접, 서기·쌍안경 측면 확인 캡처. node scripts/capture-toon-face-bino.mjs [서버] [폴더] [접미사] [추가쿼리]
import {chromium} from '@playwright/test';
const [server='http://127.0.0.1:5173',dir='artifacts/toon-face',suffix='now',extra='']=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:700,height:800}});
page.on('pageerror',e=>console.log('pageerror',e.message));
await page.goto(`${server}/src/toon/character-preview.html?hud=0&bg=plain${extra}`);
await page.waitForFunction(()=>window.charPreview&&window.charPreview.frames>5,null,{timeout:60000});
const shot=async(name,o)=>{await page.evaluate(o=>window.charPreview.set(o),o);await page.waitForTimeout(400);await page.screenshot({path:`${dir}/${name}-${suffix}.png`});};
const idle={clip:'Idle',pose:'stand',gadget:'none'};
await shot('face-front',{...idle,view:'front',dist:1.6,focus:1.5});
await shot('face-three',{...idle,view:'three',dist:1.6,focus:1.5});
await shot('face-side',{...idle,view:'side',dist:1.6,focus:1.5});
await shot('shoulder-front',{...idle,view:'front',dist:3,focus:1.25});
await shot('shoulder-three',{...idle,view:'three',dist:3,focus:1.25});
await shot('shoulder-back',{...idle,view:'back',dist:3,focus:1.25});
await shot('idle-side',{...idle,view:'side',dist:6,focus:.86});
// 쌍안경은 손이 눈까지 올라오는 데 시간이 걸려 여러 번 적용한다.
for(const v of ['side','three']){for(let i=0;i<6;i++)await page.evaluate(v=>window.charPreview.set({view:v,dist:6,focus:.86,clip:'Idle',pose:'stand',gadget:'binoculars'}),v);await shot('bino-'+v,{view:v,dist:6,focus:.86,clip:'Idle',pose:'stand',gadget:'binoculars'});}
await browser.close();
