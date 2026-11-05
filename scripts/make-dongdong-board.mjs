// 동동이 대조판: capture-dongdong.mjs가 남긴 그림을 한 장으로 붙인다. node scripts/make-dongdong-board.mjs [폴더]
import {chromium} from '@playwright/test';
import {writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve(process.argv[2]??'artifacts/dongdong'),files=readdirSync(dir);
const img=(f,w=260)=>`<figure><img src="${f}" width="${w}"><figcaption>${f.replace('.png','')}</figcaption></figure>`;
const pairs=['front','three','side','back','side-walk'].map(v=>`<div class="pair">${img(`concept-${v}.png`)}${img(`actual-${v}.png`)}</div>`).join('');
const poses=[...new Set(files.filter(f=>f.startsWith('pose-')).map(f=>f.split('-')[1]))];
const grid=poses.map(p=>`<div class="row"><b>${p}</b>${['front','sideL','threeL'].map(v=>img(`pose-${p}-${v}.png`,200)).join('')}</div>`).join('');
const css='body{margin:0;background:#20242c;color:#eee;font:13px system-ui}figure{margin:4px;display:inline-block;text-align:center}img{display:block;border-radius:6px}.pair{display:inline-block;background:#2c3240;margin:6px;padding:4px;border-radius:8px}.row{display:flex;align-items:center;gap:4px}.row b{width:80px}';
writeFileSync(`${dir}/compare.html`,`<!doctype html><meta charset="utf-8"><style>${css}</style><h3>시안(왼쪽) ↔ 실제 동동이(오른쪽) — 같은 카메라</h3>${pairs}`);
writeFileSync(`${dir}/poses.html`,`<!doctype html><meta charset="utf-8"><style>${css}</style><h3>동동이 동작 — 정면·측면·3/4</h3>${grid}`);
const browser=await chromium.launch({channel:'chrome',headless:true});
for(const n of ['compare','poses']){const page=await browser.newPage({viewport:{width:n==='compare'?1700:760,height:600}});await page.goto(`file://${dir}/${n}.html`);await page.waitForLoadState('load');await page.screenshot({path:`${dir}/${n}.png`,fullPage:true});}
await browser.close();
