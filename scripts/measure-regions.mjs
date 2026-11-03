// PNG 영역 평균색·채도 측정. 사용: node scripts/measure-regions.mjs a.png [b.png ...]  (1440×900 캡처 기준 영역)
import {chromium} from '@playwright/test';import {readFileSync} from 'node:fs';
const R={바닥:[300,600,300,100],바닥우:[900,500,350,150],숲좌:[0,300,350,120],하늘:[700,0,80,60]};
const b=await chromium.launch({channel:'chrome',headless:true});const pg=await b.newPage();
for(const f of process.argv.slice(2)){const url='data:image/png;base64,'+readFileSync(f).toString('base64');
 const out=await pg.evaluate(async([url,R])=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const o={};
  for(const [k,[a,b,w,h]] of Object.entries(R)){const d=x.getImageData(a,b,w,h).data;let r=0,g=0,bl=0,n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];bl+=d[i+2];}r/=n;g/=n;bl/=n;const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl);o[k]={rgb:[r,g,bl].map(v=>Math.round(v)),밝기:Math.round(.2126*r+.7152*g+.0722*bl),채도:+(mx?(mx-mn)/mx:0).toFixed(2),'B-R':Math.round(bl-r)};}return o;},[url,R]);
 console.log(f);console.table(out);}
await b.close();
