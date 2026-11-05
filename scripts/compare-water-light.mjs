// 계곡 물·빛 전후 캡처를 나란히 붙인 비교 사진(artifacts/v2/{water,light}/compare-*.png).
// 사용: node scripts/compare-water-light.mjs [id ...]  (capture-water-light.mjs 의 before/after 결과가 있어야 함)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
const all=[['water','water-1096'],['water','water-1096-dusk'],['water','water-1500'],['water','water-1500-low'],['water','water-1500-rain'],['water','water-2000'],
 ['light','light-day'],['light','light-back'],['light','light-sun'],['light','light-sun-golden'],['light','light-morning'],['light','light-golden'],['light','light-overcast'],['light','light-ground'],['light','light-ridge']];
const want=process.argv.slice(2),list=want.length?all.filter(([,id])=>want.includes(id)):all;
const mobile=process.env.MOBILE==='1',prefix=mobile?'mobile-':'';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:520},deviceScaleFactor:1});
 for(const [dir,id] of list){const d=`artifacts/v2/${dir}`,b=`${d}/before-${prefix}${id}.png`,a=`${d}/after-${prefix}${id}.png`;if(!existsSync(b)||!existsSync(a))continue;
  const url=f=>`data:image/png;base64,${readFileSync(f).toString('base64')}`;
  const panel=(f,label)=>`<figure><img src="${url(f)}" style="height:455px;display:block"><figcaption>${label}</figcaption></figure>`;
  await page.setContent(`<style>body{margin:0;background:#111;color:#eee;font:600 18px sans-serif;display:flex;gap:16px;padding:14px;justify-content:center}figure{margin:0}figcaption{padding-top:8px}</style>${panel(b,`전 · ${id}`)}${panel(a,`후 · ${id}`)}`);
  await page.waitForTimeout(150);await (await waitChunks(page)).screenshot({path:`${d}/compare-${prefix}${id}.png`});console.log('compare',id);}
}finally{await browser.close();}
