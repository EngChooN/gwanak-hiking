// 서울 도심 전후 캡처를 나란히 붙인 비교 사진(artifacts/v2/city/compare-*.png). 쌍안경 원 안쪽만 잘라 붙인다.
// 사용: node scripts/compare-city.mjs  (capture-city.mjs before/after 결과가 있어야 함)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
const dir='artifacts/v2/city',ids=process.argv.slice(2).length?process.argv.slice(2):['63-day','63-dusk','63-night','tower-night','lotte-day','lotte-night','hangang-day','hangang-dusk','hangang-night','wide-day','wide-night'];
const url=f=>`data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:560},deviceScaleFactor:1});
 for(const id of ids){if(!existsSync(`${dir}/before-${id}.png`)||!existsSync(`${dir}/after-${id}.png`))continue;
  // 1440×900 중 쌍안경 시야 가운데(120..1320 × 150..850)를 각 780×455로 줄여 붙인다.
  const panel=(f,label)=>`<figure><div style="width:780px;height:455px;background:url(${url(f)}) -78px -98px/936px 585px no-repeat"></div><figcaption>${label}</figcaption></figure>`;
  await page.setContent(`<style>body{margin:0;background:#111;color:#eee;font:600 18px sans-serif;display:flex;gap:16px;padding:14px}figure{margin:0}figcaption{padding-top:8px}</style>${panel(`before-${id}.png`,`전 · ${id}`)}${panel(`after-${id}.png`,`후 · ${id}`)}`);
  await (await waitChunks(page)).screenshot({path:`${dir}/compare-${id}.png`});console.log('compare',id);
 }
}finally{await browser.close();}
