import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sample,route} from '../src/route.js';
import {AUTO_VIEW,pathHeading,createAutoView,startAutoView,absorbUserYaw,stepAutoView,wrapAngle} from '../src/auto-view.js';
import {simulateAutoWalk,yawStats} from '../scripts/lib/auto-walk-yaw.mjs';
const DEG=180/Math.PI;

test('평활 길 방향은 GPX 꼭짓점에서 튀지 않는다(0.1m마다 5° 이하, 선분 방향은 수십 도)',()=>{
 let prev=pathHeading(0,sample),worst=0;
 for(let s=.1;s<=route.length;s+=.1){const h=pathHeading(s,sample);worst=Math.max(worst,Math.abs(wrapAngle(h-prev))*DEG);prev=h;}
 assert.ok(worst<=5,`최대 ${worst.toFixed(2)}°/0.1m`);
 // 비교: 선분 방향은 꼭짓점에서 수십 도씩 튄다.
 let raw=0;prev=sample(0).heading;for(let s=.1;s<=route.length;s+=.1){const h=sample(s).heading;raw=Math.max(raw,Math.abs(wrapAngle(h-prev))*DEG);prev=h;}
 assert.ok(raw>30,`선분 방향 최대 ${raw.toFixed(1)}°`);
});

test('꺾임 앞에서 미리 돌기 시작한다',()=>{
 const seg=route.segments.find((g,i)=>i>5&&Math.abs(wrapAngle(Math.atan2(-g.dx,-g.dz)-Math.atan2(-route.segments[i-1].dx,-route.segments[i-1].dz)))>.5&&route.segments[i-1].length>AUTO_VIEW.ahead+1);
 const before=sample(seg.start-AUTO_VIEW.ahead-.5).heading;
 assert.ok(Math.abs(wrapAngle(pathHeading(seg.start-AUTO_VIEW.ahead-.5,sample)-before))<1e-6,'창 밖이면 그대로');
 assert.ok(Math.abs(wrapAngle(pathHeading(seg.start-1,sample)-before))>.05,'꺾임 1m 전에는 이미 돌고 있다');
});

test('스프링은 큰 목표 변화에도 최대 회전 속도를 넘지 않는다',()=>{
 const v=createAutoView();startAutoView(v,0,0);const dt=1/60;let prev=v.heading,worst=0;
 for(let i=0;i<300;i++){const yaw=stepAutoView(v,{target:Math.PI*.9,base:0,dt});worst=Math.max(worst,Math.abs(wrapAngle(v.heading-prev)));prev=v.heading;assert.equal(yaw,v.written);}
 assert.ok(worst<=AUTO_VIEW.maxRate*dt+1e-9);
 assert.ok(Math.abs(wrapAngle(v.heading-Math.PI*.9))<.01,'5초 안에 목표에 닿는다');
 // 최단각: 179° → -179°는 2°만 돈다.
 const w=createAutoView();startAutoView(w,Math.PI-.017,0);for(let i=0;i<60;i++)stepAutoView(w,{target:-Math.PI+.017,base:0,dt});
 assert.ok(Math.abs(wrapAngle(w.heading-(-Math.PI+.017)))<.005);
});

test('마우스로 돌린 시점은 잠시 유지하고, 손을 떼면 천천히 길 쪽으로 돌아온다',()=>{
 const v=createAutoView(),look={yaw:0},dt=1/60;startAutoView(v,0,0);
 const frame=()=>{absorbUserYaw(v,look);look.yaw=stepAutoView(v,{target:0,base:0,dt});};
 frame();look.yaw+=.7;frame();
 assert.ok(Math.abs(look.yaw-.7)<1e-9,'돌린 만큼 바로 반영');
 for(let i=0;i<Math.floor(AUTO_VIEW.holdSeconds*60)-2;i++)frame();
 assert.ok(Math.abs(look.yaw-.7)<1e-9,'holdSeconds 동안 유지');
 let prev=look.yaw,worst=0;for(let i=0;i<8*60;i++){frame();worst=Math.max(worst,Math.abs(look.yaw-prev));prev=look.yaw;}
 assert.ok(Math.abs(look.yaw)<.01,'돌아온다');
 assert.ok(worst<=AUTO_VIEW.returnRate*dt+1e-9,'복귀 속도 제한');
 // 정면 보기 명령(resetting)은 빠르게 돌아온다.
 look.yaw+=.7;frame();absorbUserYaw(v,look,true);for(let i=0;i<40;i++){look.yaw=stepAutoView(v,{target:0,base:0,dt});absorbUserYaw(v,look,true);}
 assert.ok(Math.abs(v.offset)<.01);
});

test('기준 방향(baseHeading)이 바뀌어도 화면 방향은 그대로다',()=>{
 const v=createAutoView();startAutoView(v,.3,.2);
 const a=stepAutoView(v,{target:.3,base:.3,dt:1/60})+.3,b=stepAutoView(v,{target:.3,base:1.4,dt:1/60})+1.4;
 assert.ok(Math.abs(wrapAngle(a-b))<1e-3);
});

test('자동 걷기 전 구간(광장→코스 끝): 카메라·몸 프레임당 회전이 5°를 넘지 않는다',()=>{
 const r=simulateAutoWalk({fps:30});
 assert.ok(r.reachedEnd,'코스 끝까지 걸었다');
 const cam=yawStats(r.rec.camNew),body=yawStats(r.rec.bodyNew),before=yawStats(r.rec.camOld);
 assert.ok(before.over5>100,`고치기 전 5° 넘는 프레임 ${before.over5}`);
 assert.equal(cam.over5,0);assert.equal(body.over5,0);
 assert.ok(cam.maxDeg<=AUTO_VIEW.maxRate*DEG/30+AUTO_VIEW.returnRate*DEG/30+1e-6,`카메라 최대 ${cam.maxDeg}°`);
});

test('main.js가 자동 걷기 시점·몸 방향에 auto-view를 쓴다',()=>{
 const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(src,/absorbUserYaw\(autoView,look/);
 assert.match(src,/look\.yaw=stepAutoView\(autoView,\{target:state\.zone==='route'\?pathHeading\(state\.s,sample\)/);
 assert.match(src,/autoView\.active\?autoView\.heading:movementHeading/);
});
