// 담배 한 대를 가짜 동동이(뼈 이름만 같은 빈 뼈대)로 실제로 돌려 본다: 꾹 모금 → 꿀모금 연기, 3초 넘기면 기침, 링, 시가.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const events=[];
const bus=new EventTarget();
globalThis.window??=globalThis;
globalThis.addEventListener??=bus.addEventListener.bind(bus);globalThis.dispatchEvent??=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
globalThis.performance??={now:()=>Date.now()};
addEventListener('lounge:smoke',e=>events.push(e.detail));
const {createSmoker}=await import('../src/lounge/smoke.js');

function fakeAvatar(){
 const model=new THREE.Group(),root=new THREE.Group();root.add(model);
 const bone=(n,parent,p)=>{const b=new THREE.Bone();b.name='mixamorig'+n;b.position.set(...p);parent.add(b);return b;};
 const spine=bone('Spine',model,[0,.45,0]),head=bone('Head',spine,[0,.25,0]);
 for(const [s,x] of [['Right',-1],['Left',1]]){const a=bone(s+'Arm',spine,[.12*x,.08,0]),f=bone(s+'ForeArm',a,[.11*x,0,0]);bone(s+'Hand',f,[.11*x,0,0]);}
 root.updateMatrixWorld(true);
 return {id:'me',root,hiker:{model},x:0,z:0};
}
function run(sm,sec,step=1/30){for(let t=0;t<sec;t+=step)sm.apply(step);}
function lit(kind){
 const world=new THREE.Group(),sm=createSmoker(fakeAvatar(),{world,isPlayer:true});
 sm.start(kind);run(sm,1);sm.light();run(sm,2.5);assert.equal(sm.state,'smoking');return {sm,world};
}
const lastExhale=()=>events.filter(e=>e.state==='exhale').at(-1);

test('꾹 1.4초 → sweet, 첫 내뿜기 first=true, 불씨가 밝아지고 연기가 5초 넘게 남는다',()=>{
 const {sm}=lit('menthol');
 sm.drawStart();run(sm,1.4);const mid=sm.status();assert.equal(mid.state,'inhale');assert.ok(mid.draw>.4&&mid.draw<.5,`draw ${mid.draw}`);assert.ok(mid.heat>.5,'불씨가 밝아짐');
 sm.drawEnd();const ex=lastExhale();
 assert.equal(ex.quality,'sweet');assert.equal(ex.kind,'menthol');assert.equal(ex.first,true);assert.equal(ex.amount,1);
 run(sm,2);const n=sm.status().smoke;assert.ok(n>=8,`뭉게 ${n}개`);
 run(sm,3.2);assert.ok(sm.status().smoke>=6,'5초 뒤에도 남아 있음');
 sm.drawStart();run(sm,.8);sm.drawEnd();assert.equal(lastExhale().first,false,'두 번째는 first 아님');
});
test('3초 넘게 누르면 놓지 않아도 기침(cough)으로 내뿜는다',()=>{
 const {sm}=lit('strong');sm.drawStart();run(sm,3.2);
 assert.equal(sm.state,'exhale');assert.equal(lastExhale().quality,'cough');sm.drawEnd();
});
test('짧게 탭하면 기본 모금(light), 내뿜는 중 짧게 탭하면 링',()=>{
 const {sm}=lit('mild');sm.drawStart();run(sm,.1);sm.drawEnd();run(sm,1.6);
 assert.equal(sm.state,'exhale');assert.equal(lastExhale().quality,'light');
 const before=sm.status().smoke;sm.drawStart();run(sm,.1);sm.drawEnd();run(sm,.05);
 assert.equal(events.at(-1).trick,'ring');assert.ok(sm.status().smoke>=before+8,'링 뭉게 8~10개');
});
test('묘기 단추: 피우는 중 코로·프렌치는 다음 내뿜기에 trick으로 실린다',()=>{
 const {sm}=lit('mild');sm.trick('nose');run(sm,1.6);assert.equal(lastExhale().trick,'nose');run(sm,3.5);
 sm.trick('french');run(sm,1.6);assert.equal(lastExhale().trick,'french');
});
test('시가는 연기 양 2.0(꿀모금), 내 담배 연기는 상한을 넘지 않는다',()=>{
 const {sm}=lit('cigar');sm.drawStart();run(sm,1.5);sm.drawEnd();assert.equal(lastExhale().amount,2);
 for(let i=0;i<4;i++){run(sm,3.5);sm.drawStart();run(sm,1.5);sm.drawEnd();}
 const st=sm.status();assert.ok(st.smoke<=st.smokeCap,`${st.smoke}/${st.smokeCap}`);assert.equal(st.kind,'cigar');
});
