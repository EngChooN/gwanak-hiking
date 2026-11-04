import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,restore,advance,cameraRelative,BACKWARD_MULTIPLIER,ROUTE_MIN_S} from '../src/movement.js';
import {sample,speedFor} from '../src/route.js';
import {createHeightFollow,followHeight,CAMERA_RISE_SECONDS,CAMERA_FALL_SECONDS} from '../src/view.js';
import {KEY_COMMANDS,escapeClosesPanel,POINTER_UNLOCK_GRACE_MS} from '../src/input.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const where=s=>s.zone==='plaza'?{x:s.plaza.x,z:s.plaza.z,s:null}:{s:s.s,lateral:s.lateral};

// 일시정지 개념이 없다: 저장에서 이어와도 첫 걷기 입력부터 바로 움직인다.
test('처음 시작·광장 출발·이어하기 모두 첫 W 입력부터 움직인다',()=>{
 const cases={first:initialState({start:'plaza'}),gate:initialState({start:'gate'}),demo:initialState({start:'demo'}),
  resumeRoute:restore(JSON.stringify({...initialState(),s:2500})),resumePlaza:restore(JSON.stringify(initialState({start:'plaza'})))};
 for(const [name,state] of Object.entries(cases)){
  assert.equal('paused' in state,false,`${name}: 일시정지 상태가 없다`);assert.equal(state.auto,false,name);
  const before=JSON.stringify(where(state)),input={forward:1,side:0};
  assert.ok(advance(state,input,.1)>0,`${name}: 첫 입력 이동`);assert.notEqual(JSON.stringify(where(state)),before,name);
 }
});
test('창이 열려 있는 동안은 걷기 입력을 막는다(일시정지가 아니라 입력 차단)',()=>{
 assert.match(main,/document\.querySelector\('dialog\[open\]'\)\)Object\.assign\(cmd,\{forward:0,side:0/);
});

// (5) 카메라 기준 이동과 뒷걸음
test('카메라 기준 입력 회전: W 앞·S 뒤·A/D 옆, 왼쪽을 보면 W가 왼쪽',()=>{
 const near=(a,b)=>Math.abs(a-b)<1e-12;
 let r=cameraRelative(1,0,0);assert.ok(near(r.along,1)&&near(r.right,0));
 r=cameraRelative(-1,0,0);assert.ok(near(r.along,-1)&&near(r.right,0));
 r=cameraRelative(0,1,0);assert.ok(near(r.along,0)&&near(r.right,1));
 r=cameraRelative(1,0,Math.PI/2);assert.ok(near(r.along,0)&&near(r.right,-1));
 r=cameraRelative(1,1,.7);assert.ok(near(Math.hypot(r.along,r.right),Math.SQRT2));
});
test('코스: S는 앞으로 걷는 속도의 0.6배로 뒷걸음, 카메라가 뒤를 보면 W가 코스 뒤쪽',()=>{
 const start=2500,p=sample(start);
 const fwd=initialState();fwd.s=start;advance(fwd,{forward:1},.1);
 const back=initialState();back.s=start;advance(back,{forward:-1},.1);
 assert.ok(back.s<start);
 assert.ok(Math.abs(back.distance-speedFor(p.slope,p.material,-1)*BACKWARD_MULTIPLIER*.1)<1e-6,'뒷걸음 속도');
 assert.ok(Math.abs(fwd.distance-speedFor(p.slope,p.material,1)*.1)<1e-6,'앞걸음 속도는 그대로');
 const lookBack=initialState();lookBack.s=start;advance(lookBack,{forward:1,yaw:Math.PI},.1);
 assert.ok(lookBack.s<start&&Math.abs(lookBack.distance-speedFor(p.slope,p.material,-1)*.1)<1e-6,'뒤를 보고 W = 보는 쪽으로 앞걸음');
 const left=initialState();left.s=start;advance(left,{forward:1,yaw:Math.PI/2},.1);
 assert.ok(left.lateral<0&&Math.abs(left.s-start)<1e-6,'왼쪽을 보고 W = 왼쪽으로');
 const diag=initialState();diag.s=start;advance(diag,{forward:-1,side:1},.1);
 assert.ok(diag.s<start&&diag.lateral>0&&diag.distance<=speedFor(p.slope,p.material,-1)*BACKWARD_MULTIPLIER*.1+1e-6,'뒤 대각선도 0.6배');
});
test('광장: S 뒷걸음은 몸·시선 방향(plaza.heading)을 바꾸지 않고 0.6배로 물러선다',()=>{
 for(const heading of [0,1,-2.3])for(const yaw of [0,.8]){
  const s=initialState({start:'plaza'});s.plaza.heading=heading;const a={...s.plaza};
  advance(s,{forward:-1,yaw},.1);
  assert.equal(s.plaza.heading,heading);
  const dx=s.plaza.x-a.x,dz=s.plaza.z-a.z,h=heading+yaw;
  // 카메라 전방(-sin h,-cos h)의 반대쪽으로 움직인다.
  assert.ok(Math.abs((dx*-Math.sin(h)+dz*-Math.cos(h))+speedFor(0,'paved')*BACKWARD_MULTIPLIER*.1)<1e-6);
 }
 assert.ok(ROUTE_MIN_S>-1e9);
});
test('main: 직접 걷기는 몸이 카메라 방향, 뒷걸음은 보행 위상을 거꾸로 돌린다',()=>{
 assert.match(main,/hiker\.turnTo\(direct\?heading:movementHeading\(/);
 assert.match(main,/walkPhase\+=\(backward\?-1:1\)\*/);
 assert.match(main,/distance:walkPhase,/);assert.match(main,/phase:walkPhase,/);
});

// (4) 3인칭 계단 카메라
test('카메라 높이 추종: 18cm 계단을 프레임당 작은 변화로 매끈하게, 올라갈 때가 내려갈 때보다 빠르다',()=>{
 const run=(target,seconds,hz=60)=>{const f=createHeightFollow();followHeight(f,0,0);let maxStep=0,prev=0,t90=null;
  for(let i=1;i<=seconds*hz;i++){const y=followHeight(f,target,1/hz);maxStep=Math.max(maxStep,Math.abs(y-prev));prev=y;if(t90===null&&Math.abs(y)>=Math.abs(target)*.9)t90=i/hz;}
  return {maxStep,t90,end:prev};};
 const up=run(.18,1),down=run(-.18,1);
 assert.ok(up.maxStep<.025,`올라갈 때 한 프레임 최대 ${up.maxStep}`);assert.ok(down.maxStep<.02);
 assert.ok(up.t90>.1&&up.t90<.35,`올라갈 때 90% ${up.t90}s`);assert.ok(down.t90>up.t90&&down.t90<.6,`내려갈 때 90% ${down.t90}s`);
 assert.ok(Math.abs(up.end-.18)<.002&&Math.abs(down.end+.18)<.002);
 assert.ok(CAMERA_RISE_SECONDS<CAMERA_FALL_SECONDS);
 // 30/60/120Hz에서 같은 곡선, 순간이동은 바로 붙인다.
 const at=hz=>{const f=createHeightFollow();followHeight(f,0,0);let y=0;for(let i=0;i<hz*.2;i++)y=followHeight(f,.18,1/hz);return y;};
 assert.ok(Math.abs(at(30)-at(120))<.01);
 const f=createHeightFollow();followHeight(f,0,0);assert.equal(followHeight(f,40,1/60),40);
});
test('main: 1인칭 눈높이와 3인칭 카메라·바라보는 점 모두 추종 높이를 쓰고, 발 접지는 실제 높이를 쓴다',()=>{
 assert.match(main,/smoothY=followHeight\(cameraHeight,y,cameraReady\?dt:0\),eye=smoothY\+hiker\.eyeHeight/);
 assert.match(main,/lookGoal\.set\(x,smoothY\+/);
 assert.match(main,/avatar\.position\.set\(x,y,z\)/);
});

// (1) ESC는 닫기 전용, Space는 일시정지가 아니다
test('ESC는 닫기 전용이고 Space는 일시정지가 아니다, H는 HUD 가리기 자리, 마우스 고정 해제 ESC와 충돌하지 않음',()=>{
 assert.equal(KEY_COMMANDS.Escape,'escape');assert.equal(KEY_COMMANDS.Space,undefined);assert.equal(KEY_COMMANDS.KeyH,'hud-toggle');
 assert.ok(!Object.values(KEY_COMMANDS).includes('pause'),'pause 명령이 없다');
 assert.ok(!['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyL'].some(k=>k in KEY_COMMANDS),'걷기·둘러보기·헤드랜턴 키와 겹치지 않음');
 assert.equal(escapeClosesPanel({}),true);
 assert.equal(escapeClosesPanel({locked:true}),false,'고정 중 ESC는 브라우저가 고정 해제');
 assert.equal(escapeClosesPanel({sinceUnlockMs:POINTER_UNLOCK_GRACE_MS-1}),false,'해제 직후 같은 ESC');
 assert.equal(escapeClosesPanel({dialogOpen:true}),false,'열린 창은 ESC로 닫힘');
 assert.match(main,/if\(id==='hud-toggle'\)\{window\.dispatchEvent\(new CustomEvent\('hiking:hud-toggle'\)\)/);
 assert.match(main,/if\(id==='escape'\)\{if\(interaction\.anyPanel\(\)\)interaction\.handle\('panel-close'\);return;\}/);
});
test('일시정지·계속하기 화면과 버튼이 없다',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!/pause|일시정지|계속하기/.test(html.replace(/<style[\s\S]*?<\/style>/g,'')),'index.html에 일시정지 표현이 없다');
 assert.ok(!/\$\('pause[-\w]*'\)|state\.paused|id==='pause'/.test(main),'main.js에 일시정지 처리가 없다');
});
