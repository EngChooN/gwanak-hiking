import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir=process.argv[2];
const before=JSON.parse(readFileSync(`${dir}/stair-camera-before.json`)),after=JSON.parse(readFileSync(`${dir}/stair-camera-after.json`));
const W=620,H=250,P=40;
function panel(title,data){const rows=data.rows.filter(r=>r.t<=6);const g0=rows[0].ground,c0=rows[0].camera;
 // 카메라 높이에서 시작 높이 차를 빼서 땅과 같은 축에 겹친다.
 const off=c0-g0;const ys=rows.flatMap(r=>[r.ground,r.camera-off]);const lo=Math.min(...ys),hi=Math.max(...ys);
 const X=t=>P+t/6*(W-P-10),Y=v=>H-P+( -(v-lo)/((hi-lo)||1))*(H-P-30);
 const line=(f,c,w)=>`<polyline fill="none" stroke="${c}" stroke-width="${w}" points="${rows.map(r=>`${X(r.t).toFixed(1)},${Y(f(r)).toFixed(1)}`).join(' ')}"/>`;
 return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="${P}" y="18" font-size="14" font-weight="700">${title}</text><text x="${P}" y="34" font-size="11" fill="#555">프레임당 최대 변화 ${(data.maxFrameJumpM*100).toFixed(1)}cm · 가속 95% ${data.accelP95.toFixed(1)} m/s²</text>
 <line x1="${P}" y1="${H-P}" x2="${W-10}" y2="${H-P}" stroke="#999"/><text x="${W-60}" y="${H-P+16}" font-size="11">시간 6초</text><text x="4" y="${Y(hi)+4}" font-size="10">${(hi-lo).toFixed(2)}m</text>
 ${line(r=>r.ground,'#c0392b',1.2)}${line(r=>r.camera-off,'#1f5fbf',2)}</svg>`;}
const html=`<html><body style="margin:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;background:#f3f3ef;padding:12px">
<h2 style="margin:4px 0 2px">계단 구간 카메라 높이 · 수정 전/후</h2><p style="margin:0 0 8px;font-size:13px">빨강 = 발 아래 땅 높이(그대로 접지), 파랑 = 카메라 높이(시작 차이를 빼서 겹침). 데크 계단 3720m 오르막 · 돌계단 4560m 내리막 · W 6초 · 헤드리스 Chrome 1280×720 균형 화질.</p>
<table><tr><td>${panel('수정 전 · 3인칭 오르막',before['up-third'])}</td><td>${panel('수정 후 · 3인칭 오르막',after['up-third'])}</td></tr>
<tr><td>${panel('수정 전 · 3인칭 내리막',before['down-third'])}</td><td>${panel('수정 후 · 3인칭 내리막',after['down-third'])}</td></tr>
<tr><td>${panel('수정 전 · 1인칭 오르막',before['up-first'])}</td><td>${panel('수정 후 · 1인칭 오르막',after['up-first'])}</td></tr></table></body></html>`;
writeFileSync(`${dir}/stair-camera-graph.html`,html);
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1300,height:860}});await p.setContent(html);await (await waitChunks(p)).screenshot({path:`${dir}/stair-camera-graph.png`,fullPage:true});await b.close();
