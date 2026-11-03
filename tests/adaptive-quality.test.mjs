import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveQuality} from '../src/adaptive-quality.js';
import {chunkBounds,createChunkCuller} from '../src/chunk-culling.js';
import {BoxGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera,InstancedMesh,Matrix4} from 'three';

const feed=(q,ms,n,work=ms)=>{for(let i=0;i<n;i++)q.sample(ms,true,work);};
test('수동 상한 내 단계별 하향과 느린 복귀',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,160);assert.equal(q.step,1);assert.equal(q.settings.ao,true);
 feed(q,25,160);assert.equal(q.settings.shadowDistance,45);
 feed(q,25,160);assert.equal(q.settings.ao,false);
 feed(q,25,800);assert.equal(q.step,4);
 feed(q,1000/60,121,5);assert.equal(q.step,4);
 feed(q,1000/60,22000,5);assert.ok(q.step<4);
 q.setCap(1);assert.equal(q.step,0);assert.equal(q.settings.targetMs,33);assert.equal(q.settings.ao,false);
 feed(q,40,1000);assert.ok(q.settings.dpr<=1.15);assert.equal(q.settings.shadowDistance,30);
 q.setCap(0);assert.equal(q.settings.shadowDistance,30);assert.equal(q.settings.shadowMap,1024);q.setCap(2);assert.equal(q.settings.shadowMap,2048);
});
test('숨겨진 탭 프레임은 조절에 포함하지 않는다',()=>{
 const q=new AdaptiveQuality(2);for(let i=0;i<100;i++)q.sample(500,false);assert.equal(q.step,0);
});
test('비용이 작은 60Hz 기기는 실패 이력 없는 단계에서 계속 복귀한다',()=>{
 const q=new AdaptiveQuality(2);q.step=4;
 feed(q,1000/60,750,5);assert.equal(q.step,2);assert.equal(q.settings.ao,true);
 feed(q,1000/60,750,5);assert.equal(q.step,0);
});
test('60Hz 정지·CPU 여유에서 최저 단계가 AO 켜짐으로 복귀하고 최상 단계까지 회복한다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,640,5);assert.equal(q.step,4);
 feed(q,1000/60,22000,5);assert.equal(q.step,0);assert.equal(q.settings.ao,true);
 feed(q,1000/60,1500,5);assert.equal(q.step,0);
 const changes=q.changes;feed(q,1000/60,3600,5);assert.equal(q.changes,changes);
});
test('비싼 AO 재시험은 짧게 포기하고 같은 세션에서는 다시 시도하지 않는다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,480,5);assert.equal(q.step,3);
 const initial=q.changes;feed(q,1000/60,17500,5);assert.equal(q.changes,initial);
 while(q.step===3)q.sample(1000/60,true,5);
 const began=q.elapsed;feed(q,33,8,28);assert.equal(q.step,3);assert.ok(q.elapsed-began<300);
 const changes=q.changes;feed(q,1000/60,36000,5);
 assert.equal(q.step,3);assert.equal(q.changes,changes);
 assert.ok(q.snapshot().blockedSteps.some(row=>row.step===2&&row.sessionLocked));
 q.setViewport('1440x900@1');q.setViewport('1280x800@1');assert.equal(q.step,0);
 assert.equal(q.snapshot().blockedSteps.length,0);
});
test('지속적인 AO 병목은 최초 하향 후 5분 대기·재시험 1회로 제한된다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,480,5);
 const start=q.changes;
 for(let i=0;i<24000;i++)q.sample(q.settings.ao?25:1000/60,true,5);
 const decisions=q.snapshot().decisions.filter(row=>row.index>start);
 const probes=decisions.filter(row=>row.to===2);
 assert.equal(probes.length,1);assert.ok(probes[0].atMs>=312000);
 assert.equal(q.changes-start,2);
});
test('CPU만 가벼워도 GPU 등으로 실제 간격이 느리면 복귀하지 않는다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,640,2);feed(q,25,2400,2);
 assert.equal(q.step,4);
 feed(q,1000/60,3600,16);assert.equal(q.step,4);
});
test('목표 근처 흔들림과 단발 정지는 단계를 왕복시키지 않는다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,320,5);assert.equal(q.step,2);
 const changes=q.changes;
 for(let i=0;i<3600;i++)q.sample(i%2?18:19,true,5);
 assert.equal(q.changes,changes);
 q.setCap(2);q.sample(600,true,5);feed(q,1000/60,500,5);assert.equal(q.step,0);
});
test('진단 상태는 단계 변화와 원본 프레임·AO 프레임 수를 보존한다',()=>{
 const q=new AdaptiveQuality(2);feed(q,25,480,5);
 const start=q.snapshot();feed(q,1000/60,22000,5);const end=q.snapshot();
 assert.ok(end.changes-start.changes>=1);assert.equal(end.totalFrames-start.totalFrames,22000);
 assert.ok(end.aoFrames-start.aoFrames<22000);assert.ok(end.step<3);
 assert.ok(end.lastWindow.workMeanMs<6);
 const copy=q.snapshot();copy.decisions[0].to=99;assert.notEqual(q.snapshot().decisions[0].to,99);
});
test('AO 집계는 설정값 대신 실제 렌더링 상태와 작업 시간을 쓴다',()=>{
 const q=new AdaptiveQuality(2);q.sample(16.7,true,4,false);q.sample(16.7,true,9,true);
 assert.equal(q.snapshot().aoFrames,1);assert.deepEqual(q.snapshot().aoWork,{on:{frames:1,ms:9},off:{frames:1,ms:4}});
});
test('변환된 인스턴스 경계와 절두체·거리 컬링',()=>{
 const geometry=new BoxGeometry(2,2,2),material=new MeshBasicMaterial();
 const mesh=new InstancedMesh(geometry,material,2);mesh.setMatrixAt(0,new Matrix4().makeTranslation(0,0,-10));mesh.setMatrixAt(1,new Matrix4().makeTranslation(5,0,-10));mesh.position.x=2;
 const box=chunkBounds(mesh);assert.equal(box.min.x,1);assert.equal(box.max.x,8);
 const camera=new PerspectiveCamera(60,1,.1,100),culler=createChunkCuller();culler.update(camera);
 assert.equal(culler.visible(box,camera),true);assert.equal(culler.visible(box,camera,5),false);
 const behind=new Mesh(geometry,material);behind.position.z=10;assert.equal(culler.visible(chunkBounds(behind),camera),false);
 geometry.dispose();material.dispose();
});
