// 상호작용 칩(2026-11-07 모바일 피드백): 가까운 대상 하나 고르기(켜짐·꺼짐 거리 간격)와 화면 투영 자리.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CHIP_RANGE,pickChipTarget,chipScreen} from '../src/trail-chip.js';
import {trailBarView} from '../src/trail-rules.js';

test('칩 대상: on 안에서 켜지고 off 밖에서 꺼진다(사이에서는 그대로)',()=>{
 const {on,off}=CHIP_RANGE;assert.ok(on<off&&off<=6,'예전 6m보다 가깝고, 켜짐·꺼짐 간격이 있다');
 const at=d=>[{id:'cat-1',kind:'cat',d}];
 assert.equal(pickChipTarget(at(on+.1),null),null,'아직 멀다');
 assert.equal(pickChipTarget(at(on-.1),null)?.id,'cat-1','가까이 오면 켜짐');
 assert.equal(pickChipTarget(at((on+off)/2),'cat-1')?.id,'cat-1','간격 안에서는 켜진 채');
 assert.equal(pickChipTarget(at((on+off)/2),null),null,'간격 안에서는 꺼진 채');
 assert.equal(pickChipTarget(at(off+.1),'cat-1'),null,'off 밖이면 꺼짐');
 // 경계에서 앞뒤로 흔들려도 한 번만 바뀐다
 let cur=null,flips=0;for(let i=0;i<200;i++){const d=on+Math.sin(i*.7)*.4,n=pickChipTarget(at(d),cur)?.id??null;if(n!==cur)flips++;cur=n;}
 assert.equal(flips,1);
});
test('칩 대상: 여러 개가 가까우면 가장 가까운 하나, 지금 것은 swap만큼 더 가까워야 옮긴다',()=>{
 const c=[{id:'a',d:3},{id:'b',d:1.5},{id:'c',d:NaN}];
 assert.equal(pickChipTarget(c,null)?.id,'b');
 assert.equal(pickChipTarget([{id:'a',d:2},{id:'b',d:2-CHIP_RANGE.swap/2}],'a')?.id,'a','조금 더 가까운 정도로는 안 옮김');
 assert.equal(pickChipTarget([{id:'a',d:2},{id:'b',d:2-CHIP_RANGE.swap-.1}],'a')?.id,'b');
 assert.equal(pickChipTarget([{id:'a',d:5},{id:'b',d:4.1}],'a')?.id,'a','새 대상이 on 밖이면 지금 것 유지');
 assert.equal(pickChipTarget([],'a'),null);
});
test('칩 자리: 카메라 앞은 화면 좌표, 화면 밖은 가장자리 고정, 카메라 뒤는 숨김',()=>{
 const cam=new THREE.PerspectiveCamera(60,412/915,.05,500);cam.position.set(0,1.6,0);cam.lookAt(0,1.6,-10);cam.updateMatrixWorld();
 const clipOf=(x,y,z)=>{const v=new THREE.Vector4(x,y,z,1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);return {x:v.x,y:v.y,w:v.w};};
 const opt={width:412,height:915,box:{left:80,top:60,right:332,bottom:820}};
 const mid=chipScreen(clipOf(0,1.6,-5),opt);assert.equal(mid.mode,'on');assert.ok(Math.abs(mid.x-206)<.01&&Math.abs(mid.y-457.5)<.01,JSON.stringify(mid));
 // 위에 있는 점은 화면 위쪽으로(같은 거리에서 y가 작아짐), Vector3.project와 같은 자리
 const up=chipScreen(clipOf(.3,2.2,-5),opt),p=new THREE.Vector3(.3,2.2,-5).project(cam);
 assert.ok(up.y<mid.y);assert.ok(Math.abs(up.x-(p.x*.5+.5)*412)<1e-6&&Math.abs(up.y-(-p.y*.5+.5)*915)<1e-6);
 const side=chipScreen(clipOf(8,1.6,-3),opt);assert.equal(side.mode,'edge');assert.equal(side.x,332,'오른쪽 가장자리에 고정');assert.ok(side.y>=60&&side.y<=820);
 const low=chipScreen(clipOf(0,-3,-3),opt);assert.equal(low.mode,'edge');assert.equal(low.y,820,'아래 HUD 위에서 멈춤');
 assert.equal(chipScreen(clipOf(0,1.6,4),opt).mode,'off','카메라 뒤');
 assert.equal(chipScreen(null,opt).mode,'off');
 // 카메라 뒤의 점은 Vector3.project로는 화면 안처럼 뒤집혀 나올 수 있다 → w로 먼저 거른다
 const back=new THREE.Vector3(.2,1.5,3).project(cam);assert.ok(Math.abs(back.x)<1&&Math.abs(back.y)<1,'project만 쓰면 뒤가 화면 안으로 보인다');
});
test('산스장 칩은 가장 가까운 기구 하나만',()=>{
 assert.deepEqual(trailBarView({near:{id:'gym-1',kind:'gym',act:'gym-hang'}}).buttons.map(b=>b.act),['gym-hang']);
 assert.equal(trailBarView({near:{id:'gym-1',kind:'gym'}}).buttons.length,4,'기구를 모르면 예전처럼 네 개');
 assert.deepEqual(trailBarView({near:{id:'cat-1',kind:'cat',act:'gym-lift'}}).buttons.map(b=>b.act),['pet-cat'],'맞지 않는 act는 무시');
});
