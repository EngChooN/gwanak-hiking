// ⑥ 헥헥·쥐 비교판: 시안(artifacts/props-concepts) | 게임(scripts/verify-exhaustion.mjs 결과). node scripts/make-exhaustion-board.mjs
import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync} from 'node:fs';
const out='artifacts/trail-props',r=JSON.parse(readFileSync(`${out}/exhaustion.json`,'utf8'));
const row=(t,c,g,note='')=>`<section><h2>${t}</h2><div class="pair"><figure>${c?`<img src="../props-concepts/${c}.png">`:'<div class="none">시안 없음(동작만 새로 만듦)</div>'}<figcaption>시안</figcaption></figure><figure><img src="${g}.png"><figcaption>게임 안(같은 카메라 구도)${note}</figcaption></figure></div></section>`;
const html=`<!doctype html><meta charset="utf-8"><title>⑥ 헥헥·쥐 — 시안과 게임</title><style>body{margin:0;padding:20px;background:#efe6d2;font-family:'Apple SD Gothic Neo',system-ui,sans-serif;color:#2e2420;width:1400px}h1{font-size:22px;margin:0 0 6px}p{margin:0 0 10px;font-size:14px}h2{font-size:16px;margin:16px 0 6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img{width:100%;border:2px solid #2e2420;border-radius:8px;display:block}.none{aspect-ratio:16/10;border:2px dashed #2e2420;border-radius:8px;display:grid;place-items:center}figcaption{font-size:13px;margin-top:4px}.m{display:flex;gap:10px}.m img{width:220px}</style>
<h1>⑥ 무리해서 뛰면 — 헥헥 · 다리에 쥐</h1><p>실제로 Shift+W로 경사 ${(r.slopeHere*100).toFixed(1)}% 오르막을 뛰어 스테미너 0을 만들었습니다. 헥헥 ${r.pant.seconds.toFixed(2)}초·이동 ${r.pant.moved}m, 쥐 3초·이동 ${r.cramp.moved}m, 발끝 당기기 ${r.release.seconds.toFixed(2)}초, 1인칭 시야 −${r.firstPerson.drop1800ms}m(풀리면 0), 오류 ${r.errors.length}건.</p>
${row('헥헥 — 무릎 짚고 헥헥','pant','pant')}${row('다리에 쥐 — 뒹굴뒹굴','cramp','cramp')}${row('다리에 쥐 — 찌릿·떨어진 모자',null,'cramp-hat')}${row('헥헥 뒤 터벅터벅(스테미너 30까지)',null,'trudge')}
<h2>휴대폰 세로 390×844</h2><div class="m"><img src="pant-mobile.png"><img src="cramp-mobile.png"><img src="trudge-mobile.png"></div>`;
writeFileSync(`${out}/board-exhaustion.html`,html);
const b=await chromium.launch({channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:900}});await p.goto('file://'+process.cwd()+`/${out}/board-exhaustion.html`);await p.waitForTimeout(500);
await p.screenshot({path:`${out}/compare-exhaustion.png`,fullPage:true});await b.close();
