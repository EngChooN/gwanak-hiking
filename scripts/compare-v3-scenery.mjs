// 3차 풍경 전후 캡처를 나란히 붙인 비교 사진(artifacts/v3/scenery/compare-*.png). 화면 전체를 줄여 붙인다(휴대폰 세로 촬영 제외).
// 사용: node scripts/compare-v3-scenery.mjs  (capture-v3-scenery.mjs before/after 결과가 있어야 함)
import {chromium} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
const dir='artifacts/v3/scenery',ids=process.argv.slice(2).length?process.argv.slice(2):['valley-1096','valley-1096-wide','valley-1500','valley-1500-wide','summit-nne-night','summit-nne-night-wide','summit-lotte-night','summit-lotte-night-low','stars-bino8','stars-bino4','stars-bino10','stars-eye'];
const url=f=>`data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1604,height:550},deviceScaleFactor:1});
 for(const id of ids){if(!existsSync(`${dir}/before-${id}.png`)||!existsSync(`${dir}/after-${id}.png`))continue;
  // 1440×900 화면 전체를 각 780×487로 줄여 붙인다.
  const panel=(f,label)=>`<figure><div style="width:780px;height:487px;background:url(${url(f)}) 0 0/780px 487px no-repeat"></div><figcaption>${label}</figcaption></figure>`;
  await page.setContent(`<style>body{margin:0;background:#111;color:#eee;font:600 18px sans-serif;display:flex;gap:16px;padding:14px}figure{margin:0}figcaption{padding-top:8px}</style>${panel(`before-${id}.png`,`전 · ${id}`)}${panel(`after-${id}.png`,`후 · ${id}`)}`);
  await page.screenshot({path:`${dir}/compare-${id}.png`});console.log('compare',id);
 }
}finally{await browser.close();}
