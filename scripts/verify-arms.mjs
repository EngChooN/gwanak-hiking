import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const variant=process.env.VARIANT??'before';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const rows=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5178/artifacts/arms/view.html${variant==='before'?'?before':''}`);await page.waitForFunction(()=>window.ready,null,{timeout:120000});
 for(const [id,spec] of [['front',{view:'front'}],['side',{view:'side'}],['back',{view:'back'}],['walk',{view:'front',moving:true,phase:.5}],['walk-other',{view:'side',moving:true,phase:1.5}],['rotated',{view:'front',heading:Math.PI/2,moving:true,phase:.5}],['sit',{view:'side',pose:'sit'}],['tea',{view:'front',pose:'tea',teaProgress:.5}]]){
  const result=await page.evaluate(s=>show(s),spec);await page.screenshot({path:`artifacts/arms/${variant}-${id}.png`});rows.push({id,...spec,...result});
 }
 writeFileSync(`artifacts/arms/${variant}.json`,JSON.stringify({rows,errors},null,2));console.log(JSON.stringify({errors,front:rows[0],walk:rows[3]},null,2));
}finally{await browser.close();}
