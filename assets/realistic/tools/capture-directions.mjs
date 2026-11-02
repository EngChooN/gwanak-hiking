// 미실행. 자료 준비 및 Vite 서버 실행 승인 후 사용한다.
import {chromium} from '../../../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const output=fileURLToPath(new URL('../captures/',import.meta.url));
await mkdir(output,{recursive:true});
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
const results=[];
try{
  // 기본 네 장. 비교 화각 70도까지 필요하면 ALL_FOVS=1로 총 여덟 장.
  for(const fov of process.env.ALL_FOVS==='1'?[55,70]:[55])for(const bearing of [0,60,340,200]){
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const badResponses=[];page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
    await page.goto(`${base}/assets/realistic/방위검토.html?bearing=${bearing}&fov=${fov}`,{waitUntil:'networkidle',timeout:180000});
    await page.waitForFunction(()=>window.__skylineResult?.ready||window.__skylineResult?.error,{},{timeout:180000});
    const report=await page.evaluate(()=>window.__skylineResult);
    if(!report.ready||errors.length||badResponses.length)throw new Error(JSON.stringify({report,errors,badResponses}));
    if(report.rows.some(row=>!row.placementPass))throw new Error(`방위·거리 오차: ${bearing}°`);
    const file=`yeonjudae-${String(bearing).padStart(3,'0')}-fov${fov}.png`;
    await page.screenshot({path:path.join(output,file)});
    results.push({...report,file,errors,badResponses});await page.close();
  }
  await writeFile(path.join(output,'direction-verification.json'),JSON.stringify({results,renderCaptured:true,visualChecklistPassed:false,releaseApproved:false},null,2));
  const md=['# 연주대 네 방향 캡처 검증','',`실행일: ${new Date().toISOString()}`,'','좌표 대조와 렌더 캡처 완료. 지형 가림·실사 룩·경험자 확인은 미완료. 레이블은 실제로 보인다는 판정이 아니라 기준점 투영이다.',''];
  for(const r of results){
    md.push(`## 방위 ${r.bearing}° · 수직 FOV ${r.fov}°`,'',`![연주대 ${r.bearing}도](${r.file})`,'','| 대상 | 기준 방위 | 배치 방위 | 오차 | 화각 |','|---|---:|---:|---:|---|');
    for(const p of r.rows)md.push(`| ${p.name} | ${p.expectedBearing}° | ${p.measuredBearing.toFixed(3)}° | ${p.bearingError.toFixed(5)}° | ${p.inHorizontalFrame?'수평 화각 안':'밖'} |`);
    md.push('');
  }
  await writeFile(path.join(output,'방위-검증-실행결과.md'),md.join('\n'));
  console.log(`캡처 ${results.length}장 저장: ${output}`);
}finally{await browser.close();}
