import test from 'node:test';
import assert from 'node:assert/strict';
import {createPoseController,poleStep,createHikingProps,SIT_SECONDS,TEA_SECONDS,SEATED_EYE_HEIGHT} from '../src/hiker-interactions.js';
test('앉기·일어나기는 0.8초에 도달하고 반전해도 높이가 연속이다',()=>{
 const p=createPoseController();assert.equal(p.setPose('sit'),true);let v;
 for(let i=0;i<4;i++)v=p.update(.1);assert.ok(Math.abs(v.sit-.5)<1e-8);
 p.setPose('stand');v=p.update(0);assert.ok(Math.abs(v.sit-.5)<1e-8);
 for(let i=0;i<4;i++)v=p.update(.1);assert.equal(v.sit,0);
 p.setPose('sit');for(let i=0;i<8;i++)v=p.update(SIT_SECONDS/8);
 assert.ok(v.sit>.9999);assert.equal(v.eyeHeight,SEATED_EYE_HEIGHT);
});
test('앉아야 차를 시작하며 3초 후 내려놓고, 서기 입력으로 취소한다',()=>{
 const p=createPoseController();assert.equal(p.setPose('tea'),false);assert.equal(p.setPose('bad'),false);
 p.setPose('sit');for(let i=0;i<8;i++)p.update(.1);assert.equal(p.setPose('tea'),true);
 let v;for(let i=0;i<15;i++)v=p.update(.1);assert.equal(v.drink,1);
 for(let i=0;i<15;i++)v=p.update(.1);assert.equal(v.pose,'sit');assert.equal(v.drink,0);
 p.setPose('tea');p.update(.1);p.setPose('stand');assert.equal(p.update(.1).drink,0);assert.equal(TEA_SECONDS,3);
});
test('외부 차 진행률과 정지 dt=0을 따르고 잘못된 dt로 오염되지 않는다',()=>{
 const p=createPoseController();p.setPose('sit');for(let i=0;i<8;i++)p.update(.1);p.setPose('tea');
 assert.equal(p.update(0,{teaProgress:.5}).drink,1);assert.equal(p.update(0).teaProgress,.5);
 assert.ok(Number.isFinite(p.update(NaN).eyeHeight));assert.equal(p.update(0,{teaProgress:1}).pose,'sit');
});
test('스틱은 반대 발과 한 걸음 차이로 교차하고 달릴 때 진폭이 커진다',()=>{
 for(let phase=-2;phase<8;phase+=.07){const left=poleStep(phase,'Left'),right=poleStep(phase+1,'Right');assert.ok(Math.abs(left.forward-right.forward)<1e-9);assert.equal(left.planted,right.planted);if(left.planted)assert.equal(left.lift,0);}
 assert.ok(Math.abs(poleStep(.2,'Right',true).forward)>Math.abs(poleStep(.2,'Right').forward));
 assert.equal(poleStep(0,'Right').planted,true);assert.equal(poleStep(1,'Left').planted,true);
});
test('직접 만든 소품의 그립·팁 노드와 단위, 삼각형 예산',()=>{
 const props=createHikingProps();assert.equal(props.poles.length,2);let triangles=0;
 for(const p of props.poles){assert.equal(p.tip.position.y,-1.1);assert.equal(p.group.getObjectByName(`${p.group.name}.Grip`),p.grip);}
 for(const o of [...props.poles.map(p=>p.group),props.cup,props.flask])o.traverse(n=>{if(n.isMesh)triangles+=n.geometry.index.count/3;});
 assert.ok(triangles<1200);assert.equal(props.cup.name,'Tea.Cup');assert.equal(props.flask.name,'Tea.Flask');
});
