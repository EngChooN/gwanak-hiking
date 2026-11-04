// 정상 자유 이동 범위를 위에서 본 그림. 사용: BASE_URL=http://127.0.0.1:5190 node scripts/summit-map.mjs (개발 서버 필요)
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5190',out=process.env.OUT??'artifacts/summit-free';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${base}/?start=summit&quality=low&time=11:00&weather=clear`);
await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,null,{timeout:240000});
const result=await page.evaluate(async()=>{
 const m=hiking.summitMap(),{route,sample}=await import('/src/route.js'),S=8,W=m.n*m.cell*S,c=document.createElement('canvas');c.width=c.height=Math.round(W);const g=c.getContext('2d');
 let lo=Infinity,hi=-Infinity;for(const h of m.height)if(Number.isFinite(h)){lo=Math.min(lo,h);hi=Math.max(hi,h);}
 const px=(x)=>(x-m.x0)*S,pz=(z)=>(z-m.z0)*S;
 for(let j=0;j<m.n;j++)for(let i=0;i<m.n;i++){const k=j*m.n+i,t=(m.height[k]-lo)/(hi-lo||1),v=Math.round(70+t*150);g.fillStyle=m.walk[k]?(m.route[k]?`rgb(${v*.3|0},${v*.85|0},${v})`:`rgb(${v*.35|0},${v},${v*.35|0})`):`rgb(${v},${v*.55|0},${v*.5|0})`;g.fillRect(i*m.cell*S-m.cell*S/2,j*m.cell*S-m.cell*S/2,m.cell*S+1,m.cell*S+1);}
 // 등고선 2m
 g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;
 for(let j=0;j<m.n-1;j++)for(let i=0;i<m.n-1;i++){const k=j*m.n+i,a=Math.floor(m.height[k]/2),b=Math.floor(m.height[k+1]/2),d=Math.floor(m.height[k+m.n]/2);if(a!==b){g.beginPath();g.moveTo(i*m.cell*S+m.cell*S/2,j*m.cell*S-m.cell*S/2);g.lineTo(i*m.cell*S+m.cell*S/2,j*m.cell*S+m.cell*S/2);g.stroke();}if(a!==d){g.beginPath();g.moveTo(i*m.cell*S-m.cell*S/2,j*m.cell*S+m.cell*S/2);g.lineTo(i*m.cell*S+m.cell*S/2,j*m.cell*S+m.cell*S/2);g.stroke();}}
 // 코스(마지막 130m): 계단은 굵게
 g.lineWidth=5;for(let s=route.length-130;s<route.length;s+=1){const a=sample(s),b=sample(s+1);g.strokeStyle=a.material==='stairs'?'#fff':'#ffd54a';g.beginPath();g.moveTo(px(a.x),pz(a.z));g.lineTo(px(b.x),pz(b.z));g.stroke();}
 // 구역 경계 원, 입구 s
 g.strokeStyle='#0af';g.lineWidth=2;g.beginPath();g.arc(px(m.center.x),pz(m.center.z),m.radius*S,0,7);g.stroke();
 const e=sample(m.enterS);g.fillStyle='#0af';g.beginPath();g.arc(px(e.x),pz(e.z),7,0,7);g.fill();
 g.font='bold 22px sans-serif';g.fillStyle='#fff';g.strokeStyle='#000';g.lineWidth=4;
 const label=(x,z,t,color)=>{g.fillStyle=color;g.beginPath();g.arc(px(x),pz(z),8,0,7);g.fill();g.strokeStyle='#000';g.lineWidth=4;g.strokeText(t,px(x)+12,pz(z)+7);g.fillStyle='#fff';g.fillText(t,px(x)+12,pz(z)+7);};
 label(m.end.x,m.end.z,'길 끝(GPX)','#f0f');label(m.center.x,m.center.z,'마루 636m','#ff0');label(e.x,e.z,'구역 입구(끝 40m 앞)','#0af');
 for(const s of m.sites){if(s.id==='helipad'||s.id==='fork')continue;const name={radar:'레이돔(추정)',eungjinjeon:'응진전(추정)',marker:'정상석(추정)'}[s.id];label(s.x,s.z,name,'#f60');if(s.id!=='marker'){g.strokeStyle='#f60';g.lineWidth=3;g.beginPath();g.arc(px(s.x),pz(s.z),(s.supportRadius+.7)*S,0,7);g.stroke();}}
 g.fillStyle='rgba(0,0,0,.65)';g.fillRect(8,8,560,118);g.font='20px sans-serif';g.fillStyle='#fff';
 ['초록 = 정상 자유 이동 칸(1.5m) · 청록 = 길 둘레(코스 이동으로 이어짐)','붉은 갈색 = 막힘(급경사·시설·원 밖) · 흰 선 = 계단, 노란 선 = 능선길','파란 원 = 구역 반경 45m · 명도 = 높이 '+lo.toFixed(0)+'~'+hi.toFixed(0)+'m · 가는 선 = 2m 등고선',`자유 이동 ${m.free}칸 ≈ ${(m.free*m.cell*m.cell).toFixed(0)}㎡ (길 둘레 포함 ${(m.walkable*m.cell*m.cell).toFixed(0)}㎡) · 위쪽이 북`].forEach((t,i)=>g.fillText(t,16,34+i*26));
 return {png:c.toDataURL('image/png'),walkable:m.walkable,free:m.free,area:m.walkable*m.cell*m.cell,freeArea:m.free*m.cell*m.cell,lo,hi,sites:m.sites.map(s=>({id:s.id,x:s.x,z:s.z,r:s.supportRadius})),end:m.end,center:m.center,enterS:m.enterS};
});
writeFileSync(`${out}/walkable-map.png`,Buffer.from(result.png.split(',')[1],'base64'));
const {png,...info}=result;writeFileSync(`${out}/walkable-map.json`,JSON.stringify({...info,errors},null,2));console.log(JSON.stringify({...info,errors}));await browser.close();
