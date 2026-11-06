// 자동 걷기 전 구간 프레임당 yaw 변화량(고치기 전·후) 측정. node scripts/measure-auto-view.mjs [fps]
import {writeFileSync,mkdirSync} from 'node:fs';
import {simulateAutoWalk,yawStats} from './lib/auto-walk-yaw.mjs';
import {AUTO_VIEW} from '../src/auto-view.js';
const out='artifacts/auto-view-2026-11-06';mkdirSync(out,{recursive:true});
const fps=Number(process.argv[2])||60,r=simulateAutoWalk({fps});
const pack=(cam,body)=>({camera:yawStats(r.rec[cam],r.rec.s),body:yawStats(r.rec[body],r.rec.s)});
const common={fps,simulatedSeconds:+r.seconds.toFixed(1),frames:r.frames,reachedEnd:r.reachedEnd,routeLength:+r.routeLength.toFixed(1),start:'광장 출발점(자동 걷기 켬, 마우스 조작 없음)'};
const before={...common,method:'baseHeading()+look.yaw (GPX 선분 방향에 바로 붙음), 몸은 실제 이동 방향',...pack('camOld','bodyOld')};
const after={...common,method:'src/auto-view.js 평활 길 방향 + 임계 감쇠 스프링 + 최대 회전 속도',settings:AUTO_VIEW,...pack('camNew','bodyNew')};
writeFileSync(`${out}/before.json`,JSON.stringify(before,null,1));writeFileSync(`${out}/after.json`,JSON.stringify(after,null,1));
const line=(name,x)=>`${name.padEnd(12)} 최대 ${String(x.maxDeg).padStart(8)}°  p50 ${x.p50}  p95 ${x.p95}  p99 ${x.p99}  p99.9 ${x.p999}  >1° ${x.over1}  >2° ${x.over2}  >5° ${x.over5}`;
console.log(`${fps}fps · ${r.frames}프레임 · ${common.simulatedSeconds}초 · 끝까지 ${r.reachedEnd}`);
console.log(line('전 카메라',before.camera));console.log(line('후 카메라',after.camera));
console.log(line('전 몸',before.body));console.log(line('후 몸',after.body));
console.log('전 카메라 상위',JSON.stringify(before.camera.top));
