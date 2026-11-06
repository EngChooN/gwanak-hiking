import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,PlaneGeometry,MeshBasicMaterial,DoubleSide,LOD,BoxGeometry,InstancedMesh,Matrix4,Quaternion,Vector3,Euler,Box3} from 'three';
import {initialState,advance,restore,setPose,positionAt,lateralLimit} from '../src/movement.js';
import {sample,route,speedFor,baseSpeedFor,SPEED_CALIBRATION,isStairs} from '../src/route.js';
import {createWalkingGround} from '../src/walking-ground.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
const flat={height:()=>0,canMove:()=>true};
function tick(s,input,seconds,ground=flat){for(let i=0;i<Math.round(seconds*10);i++)advance(s,input,.1,()=>{},ground);}
test('speedFor는 보정 없이 걸음 모델(보폭×빈도) 그대로',()=>{
 assert.equal(SPEED_CALIBRATION,1);
 for(const material of ['soil','stairs','deck_stairs','ridge','paved'])for(const slope of [-.3,0,.3])for(const direction of [-1,1])near(speedFor(slope,material,direction),baseSpeedFor(slope,material,direction));
 const direct=initialState(),auto=initialState();auto.auto=true;advance(direct,{forward:1},.1);advance(auto,{},.1);near(direct.distance,auto.distance);
});
test('Shift 1.6배, 걷기·정지·앉기 회복률과 상한',()=>{
 const walk=initialState(),run=initialState();walk.stamina=run.stamina=60;
 advance(walk,{side:1},.1,()=>{},flat);advance(run,{side:1,run:true},.1,()=>{},flat);near(run.distance/walk.distance,1.6);near(walk.stamina,60.4);near(run.stamina,59);
 tick(walk,{},1);near(walk.stamina,68.4);setPose(walk,'sit');tick(walk,{},1);near(walk.stamina,83.4);tick(walk,{},5);near(walk.stamina,100);
});
test('오르막은 추가 소모, 0 고갈은 30까지 잠금',()=>{
 const uphill=initialState();advance(uphill,{forward:1,run:true},.1);assert.ok(uphill.stamina<99);
 const s=initialState();s.stamina=.5;tick(s,{side:1,run:true},.1);assert.equal(s.stamina,0);assert.equal(s.runExhausted,true);
 tick(s,{},3.7);near(s.stamina,29.6);tick(s,{side:-1,run:true},.1);assert.equal(s.running,false);near(s.stamina,30);assert.equal(s.runExhausted,false);
 tick(s,{side:-1,run:true},.1);assert.equal(s.running,true);near(s.stamina,29);
});
test('C 상태 전환, T는 앉을 때만 허용, 3초 후 +30 한 번, 이동은 일어나기',()=>{
 const s=initialState();s.stamina=10;assert.equal(setPose(s,'tea'),false);setPose(s,'sit');assert.equal(setPose(s,'tea'),true);assert.equal(setPose(s,'tea'),false);
 const start=s.distance;tick(s,{},2.9);assert.equal(s.pose,'tea');near(s.stamina,53.5);tick(s,{},.1);assert.equal(s.pose,'sit');near(s.stamina,85);near(s.distance,start);
 tick(s,{},.1);near(s.stamina,86.5);tick(s,{forward:1},.1);assert.equal(s.pose,'stand');assert.ok(s.distance>start);
 setPose(s,'sit');setPose(s,'tea');tick(s,{side:1},.1);assert.equal(s.pose,'stand');assert.equal(s.teaRemaining,0);
});
test('길 밖 8m 한계·0.7배 속도·흙 낙엽 발소리·자동 중앙 복귀',()=>{
 const s=initialState();tick(s,{side:1},100,null);near(s.lateral,lateralLimit(s.s));const d=s.distance;tick(s,{side:1},1);near(s.distance,d);
 const inside=initialState(),outside=initialState();outside.lateral=sample(outside.s).width/2+2;
 advance(inside,{side:-1},.1,()=>{},flat);advance(outside,{side:-1},.1,()=>{},flat);near(outside.distance/inside.distance,.7);
 const steps=[];outside.stepPhase=.999;advance(outside,{side:-1},.1,e=>steps.push(e),flat);assert.equal(steps[0].material,'soil');near(steps[0].position[1],0);
 outside.auto=true;const before=outside.lateral;tick(outside,{},1);assert.ok(outside.lateral<before);assert.ok(outside.s>inside.s);
});
test('통행 불가 지형 차단은 거리·걸음 불변, 스테미너는 정지 회복',()=>{
 const s=initialState();s.stamina=50;s.lateral=sample(s.s).width/2+1;const before={...s};advance(s,{forward:1,run:true},.1,()=>{assert.fail('발소리 발생');},{height:()=>0,canMove:()=>false});near(s.distance,before.distance);near(s.s,before.s);near(s.steps,before.steps);near(s.stamina,50.8);assert.equal(s.running,false);
});
test('저장 복원: 구버전 기본값·고갈·자세·차 진행·비정상 값과 범위',()=>{
 const s=initialState();s.stamina=12;s.runExhausted=true;setPose(s,'sit');setPose(s,'tea');tick(s,{},.4);let r=restore(JSON.stringify(s));near(r.stamina,s.stamina);assert.equal(r.runExhausted,true);assert.equal(r.pose,'tea');near(r.teaRemaining,s.teaRemaining);assert.equal('paused' in r,false);
 s.lateral=lateralLimit(s.s)-.1;r=restore(JSON.stringify(s));near(r.lateral,s.lateral);s.lateral=100;r=restore(JSON.stringify(s));assert.ok(Math.abs(r.lateral)<sample(s.s).width/2);
 s.stamina=-20;s.pose='invalid';s.ascent='oops';r=restore(JSON.stringify(s));near(r.stamina,0);assert.equal(r.runExhausted,true);assert.equal(r.pose,'stand');near(r.ascent,0);
 delete s.stamina;delete s.pose;delete s.runExhausted;r=restore(JSON.stringify(s));near(r.stamina,100);assert.equal(r.pose,'stand');
 s.s=route.length+100;s.lateral=100;assert.ok(Number.isFinite(restore(JSON.stringify(s)).lateral));
});
// rocks: [{size:[w,h,d],at:[x,y,z],yaw}] 상자 바위. 식생 LOD처럼 첫 레벨 InstancedMesh + userData.contactOccluders(worldBounds)로 만든다.
function rockLod(rocks){
 const lod=new LOD(),holder=new Group(),geometry=new BoxGeometry(1,1,1),mesh=new InstancedMesh(geometry,new MeshBasicMaterial(),rocks.length);holder.add(mesh);lod.addLevel(holder,0);
 lod.userData.contactOccluders=rocks.map((r,i)=>{const m=new Matrix4().compose(new Vector3(...r.at),new Quaternion().setFromEuler(new Euler(0,r.yaw??0,0)),new Vector3(...r.size));mesh.setMatrixAt(i,m);
  const box=new Box3().setFromBufferAttribute(geometry.attributes.position).applyMatrix4(m);return {kind:'rock',x:r.at[0],z:r.at[2],worldBounds:{min:box.min.toArray(),max:box.max.toArray()}};});
 return lod;
}
function groundFor(grade,rocks=[]){const group=new Group(),geometry=new PlaneGeometry(100,100,1,1);geometry.rotateX(-Math.PI/2);const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getX(i)*grade);const mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide}));mesh.name='NearDEM8m';group.add(mesh);if(rocks.length)group.add(rockLod(rocks));return createWalkingGround({group,collisionObjects:()=>[new Group(),mesh],floorHeight:(x,z)=>99,surfaceHeight:()=>77});}
test('렌더링 지형 삼각형 높이 사용·45도 초과 경사와 절벽 차단',()=>{
 for(const degrees of [0,34,44,46,70]){const grade=Math.tan(degrees*Math.PI/180),ground=groundFor(grade);near(ground.height(1,0),grade);near(ground.height(1,0,false),77);assert.equal(ground.canMove([0,0,0],[.1,grade*.1,0]),degrees<=45);}
 const ground=groundFor(0);assert.equal(ground.canMove([0,0,0],[.1,1,0]),false);
});
test('큰 바위 몸체와 몸통이 겹치면 막고 낮은 자갈·범위 밖은 허용',()=>{
 const ground=groundFor(0,[{size:[1,2,2],at:[1.5,1,0]},{size:[1,.1,2],at:[-1.5,.05,0]}]);ground.refreshObstacles();
 assert.equal(ground.canMove([.7,0,0],[.9,0,0]),false,'큰 바위 0.2m 앞');assert.equal(ground.canMove([-1.5,0,0],[-1.4,0,0]),true,'낮은 자갈');assert.equal(ground.canMove([0,0,3],[.1,0,3]),true,'범위 밖');
});
test('회전한 긴 바위는 축 정렬 상자 모서리의 빈 땅을 막지 않는다(정상부 보이지 않는 벽 회귀)',()=>{
 // 8×1m 바위를 45° 돌리면 축 정렬 상자는 약 6.4m 네모가 된다. 상자 모서리 쪽은 실제로 빈 땅이다.
 const ground=groundFor(0,[{size:[8,2,1],at:[0,1,0],yaw:Math.PI/4},{size:[3,6,3],at:[0,-2.7,10]}]);ground.refreshObstacles();
 assert.equal(ground.rockBlocked(2.6,2.6,0),false,'상자 모서리 빈 땅');assert.equal(ground.canMove([2.4,0,2.6],[2.6,0,2.6]),true);
 assert.equal(ground.rockBlocked(1,-1,0),true,'바위 몸체 위');assert.equal(ground.canMove([1.6,0,-1.6],[1.2,0,-1.2]),false,'바위 쪽으로 걸으면 막힘');
 // 거의 묻힌 바위: 땅 위로 0.35m 안쪽만 나오면 넘어 디딘다.
 assert.equal(ground.rockBlocked(0,10,0),false,'묻힌 바위(위 끝 0.3m)는 넘는다');assert.equal(ground.rockBlocked(0,10,-.2),true,'발밑이 낮으면 막힌다');
});
test('길 밖에서 코스 꺾임을 넘어도 좌우 기준이 연속이고 실제 속도를 넘지 않음',()=>{
 const s=initialState();s.lateral=2.9;s.auto=true;
 const start=s.s;
 for(let i=0;i<60;i++){const a=positionAt(s.s,s.lateral),budget=speedFor(sample(s.s).slope,sample(s.s).material)*.7*.1;advance(s,{},.1);const b=positionAt(s.s,s.lateral);assert.ok(Math.hypot(...a.map((v,j)=>b[j]-v))<=budget+1e-6);}
 assert.ok(s.s>start);assert.ok(s.lateral<2.9);
});
test('계단 실제 디딤판 높이가 한 프레임 예산보다 커도 길 위 전진 가능',()=>{
 const seg=route.segments.find(p=>p.material==='stairs'&&p.length>10),s=initialState();s.s=seg.start+1;
 const stair={height:(x,z)=>Math.round(sample(s.s).y/.18)*.18,canMove:()=>true};
 const before=s.s;tick(s,{forward:1},1,stair);assert.ok(s.s>before+.4);
});
