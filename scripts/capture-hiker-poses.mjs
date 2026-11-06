import {chromium} from '@playwright/test';
const [out,suffix]=process.argv.slice(2);
const shots=[['sit-front','pose=sit&view=front'],['sit-side','pose=sit&view=side'],['sit-three','pose=sit&view=three'],
['tea-lift','pose=tea&view=three&tea=.3'],['tea-mouth','pose=tea&view=front&tea=.6'],['tea-drink','pose=tea&view=side&tea=.8'],['tea-reach','pose=tea&view=three&tea=.05'],
['sit-bino','pose=sit&gadget=binoculars&view=three'],['sit-phone','pose=sit&gadget=phone&view=three'],['sit-selfie','pose=sit&gadget=phone&selfie=1&view=three']];
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const p=await b.newPage({viewport:{width:900,height:700}});
p.on('pageerror',e=>console.log('ERR',e.message));
for(const [n,q] of shots){await p.goto(`http://127.0.0.1:5193/src/toon/character-preview.html?${q}&hud=0&dist=2.4&focus=.3`);await p.waitForFunction(()=>window.charPreview,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(2500);await p.screenshot({path:`${out}/${n}-${suffix}.png`});}
await b.close();
