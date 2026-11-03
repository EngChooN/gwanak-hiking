// 복장 4종 정면 비교(실제 등산객 모델 렌더). 전신·상반신 두 장씩 저장하고 비교 HTML을 만든다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {OUTFITS} from '../src/outfit-config.js';
const dir='artifacts/outfits';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5190';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const errors=[];
try{const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?outfit=1&start=entrance&quality=balanced&time=15:00&weather=clear`);await page.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});await page.waitForTimeout(1500);
 for(const [kind,opt] of [['full',{width:300,height:560,fov:21,eye:[.35,1.0,-5.2],target:[0,.9,0]}],['upper',{width:300,height:360,fov:13,eye:[.25,1.42,-3.3],target:[0,1.3,0]}],['back',{width:300,height:560,fov:21,eye:[-.4,1.1,5.2],target:[0,.95,0]}]]){
  const shots=await page.evaluate(o=>hiking.outfitPreviews(o),opt);
  for(const o of OUTFITS)writeFileSync(`${dir}/compare-${kind}-${o.index}.png`,Buffer.from(shots[o.id].split(',')[1],'base64'));
 }
}finally{await browser.close();}
const photo=process.env.PHOTO??'';
const html=`<!doctype html><meta charset="utf-8"><title>복장 4종 비교</title><style>body{font:14px system-ui;margin:20px;background:#f4f3ee}h1{font-size:20px}.row{display:flex;gap:10px;align-items:flex-start}figure{margin:0;text-align:center}img{display:block;border-radius:8px}figcaption{font-size:13px;margin-top:4px}.photo img{height:560px}</style><h1>복장 4종 — 사진(왼쪽부터 1~4)과 3D 등산객</h1>
<div class="row">${photo?`<figure class="photo"><img src="${photo}"><figcaption>대표 첨부 사진(비교용·앱에 쓰지 않음)</figcaption></figure>`:''}${OUTFITS.map(o=>`<figure><img src="compare-full-${o.index}.png"><figcaption>${o.index}. ${o.name}</figcaption></figure>`).join('')}</div>
<h2>상반신</h2><div class="row">${OUTFITS.map(o=>`<figure><img src="compare-upper-${o.index}.png"><figcaption>${o.index}. ${o.name}</figcaption></figure>`).join('')}</div>
<h2>뒷모습(배낭)</h2><div class="row">${OUTFITS.map(o=>`<figure><img src="compare-back-${o.index}.png"><figcaption>${o.index}. ${o.name}</figcaption></figure>`).join('')}</div>`;
writeFileSync(`${dir}/복장-비교.html`,html);console.log(JSON.stringify({errors}));
