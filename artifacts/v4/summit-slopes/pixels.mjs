// PNG 픽셀 색 표본(브라우저 캔버스로 디코드). 사용: node pixels.mjs x,y;x,y 파일...
import {chromium} from '@playwright/test';import {readFileSync} from 'node:fs';
const [pts,...files]=process.argv.slice(2);const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();
for(const f of files){const data='data:image/png;base64,'+readFileSync(f).toString('base64');
 console.log(f.split('/').pop(),JSON.stringify(await p.evaluate(async([data,pts])=>{const i=new Image();i.src=data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);
 return pts.split(';').map(s=>{const [x,y]=s.split(',').map(Number);const d=g.getImageData(x-3,y-3,7,7).data;let r=0,gg=0,bb=0;for(let k=0;k<d.length;k+=4){r+=d[k];gg+=d[k+1];bb+=d[k+2];}const n=d.length/4;return [r/n|0,gg/n|0,bb/n|0];});},[data,pts])));}
await b.close();
