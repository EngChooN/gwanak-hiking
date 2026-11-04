// 해질녘 색감 전후 비교: 낮·밤이 그대로인지(평균 색·큰 차이 픽셀 비율) 수치로 확인한다. 브라우저 캔버스로 PNG를 읽는다.
import {chromium} from '@playwright/test';import {readFileSync,writeFileSync} from 'node:fs';
const ids=process.argv.slice(2).length?process.argv.slice(2):['forest-day','summit-day','forest-night','summit-night','forest-dusk','summit-dusk','city-dusk','forest-golden'];
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),out=[];
const b64=f=>readFileSync(f).toString('base64');
for(const id of ids){const r=await page.evaluate(async([a,b])=>{const load=s=>new Promise(res=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);res(x.getImageData(0,0,i.width,i.height).data);};i.src='data:image/png;base64,'+s;});
 const A=await load(a),B=await load(b),N=A.length/4;let s=0,big=0;const ma=[0,0,0],mb=[0,0,0];
 for(let i=0;i<N;i++){let m=0;for(let c=0;c<3;c++){const d=Math.abs(A[i*4+c]-B[i*4+c]);s+=d;m=Math.max(m,d);ma[c]+=A[i*4+c];mb[c]+=B[i*4+c];}if(m>24)big++;}
 return {meanDiff:+(s/N/3).toFixed(2),bigDiffPct:+(big/N*100).toFixed(2),meanRgbBefore:ma.map(v=>+(v/N).toFixed(1)),meanRgbAfter:mb.map(v=>+(v/N).toFixed(1))};},[b64(`artifacts/v3/before-${id}.png`),b64(`artifacts/v3/after-${id}.png`)]);
 out.push({id,...r});console.log(id,JSON.stringify(r));}
writeFileSync('artifacts/v3/compare-dusk-grade.json',JSON.stringify(out,null,2));await browser.close();
