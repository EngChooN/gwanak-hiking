// 등산 함께 걷기 행동 상태(act) 규칙 — 2026-11-10 '내 상호작용(앉기·차·쌍안경·휴대폰·셀카·즐길거리)이 상대에게 안 보임' 회귀 시험.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hikingAct,createActSender,remoteActPlan,remoteBody,frameFromSpot,BODY_ACTS,TEA_SECONDS} from '../src/multi-act.js';
import {sanitizeAct} from '../src/multi-protocol.js';
import {ACT_SECONDS} from '../src/toon/hiker-acts.js';

test('지금 상태 → act: 자세·기구·셀카·동작·역기 횟수, 서버 규격(sanitizeAct)을 그대로 통과', () => {
 const a=hikingAct({pose:'tea',gadget:'phone',selfie:true,trail:{name:'gym-lift',state:'hold',reps:4},action:null});
 assert.deepEqual(a,{p:'tea',g:'phone',sf:1,x:'gym-lift',v:4});
 assert.deepEqual(sanitizeAct('hiking',{...a,n:3}),{...a,n:3});
 // 산길 행동(스트레칭 등)은 즐길거리 동작이 없을 때 x로
 assert.equal(hikingAct({action:{id:'stretch'}}).x,'stretch');
 // 끝나는 중(out)인 동작은 이미 끝난 것으로
 assert.equal(hikingAct({trail:{name:'airgun',state:'out'}}).x,'');
 // 모르는 값은 기본값
 assert.deepEqual(hikingAct({pose:'fly',gadget:'drone'}),{p:'stand',g:'none',sf:0,x:'',v:0});
});

test('바뀔 때만 보내고, 동작을 새로 시작하면 n이 오른다(처음 보는 사람·재접속은 force)', () => {
 const s=createActSender();
 const st=hikingAct({});
 assert.deepEqual(s.next(st),{...st,n:0});
 assert.equal(s.next(st),null,'같으면 안 보냄');
 assert.deepEqual(s.next(st,true),{...st,n:0},'force면 다시');
 const air=hikingAct({trail:{name:'airgun',state:'in'}});
 assert.equal(s.next(air).n,1);
 assert.equal(s.next(air),null);
 assert.equal(s.next(st).n,1,'끝나도 n은 그대로');
 assert.equal(s.next(air).n,2,'같은 동작을 다시 하면 n이 오름');
 assert.equal(s.next(hikingAct({trail:{name:'choco',state:'in'}})).n,3,'다른 동작으로 바뀌어도 오름');
});

test('받는 쪽: (동작,n)이 바뀔 때만 처음부터, 멈추라고 하면 멈춤, 역기는 늘어난 만큼 누름', () => {
 let p=remoteActPlan(null,{x:'airgun',n:1});
 assert.equal(p.start,'airgun');
 const ap=p.applied;
 p=remoteActPlan(ap,{x:'airgun',n:1},'airgun');assert.equal(p.start,null);assert.equal(p.stop,false);
 p=remoteActPlan(ap,{x:'airgun',n:1},null);assert.equal(p.start,null,'혼자 끝났으면 다시 시작하지 않음');
 p=remoteActPlan(ap,{x:'airgun',n:2},null);assert.equal(p.start,'airgun','다시 한 번');
 p=remoteActPlan(ap,{x:'',n:1},'airgun');assert.equal(p.stop,true);assert.equal(p.applied,null);
 p=remoteActPlan(null,{x:'',n:1},'pant');assert.equal(p.stop,false,'내가 건 동작이 아니면 건드리지 않음');
 p=remoteActPlan(null,{x:'stretch',n:1});assert.equal(p.start,null,'몸 동작 없는 산길 행동은 재생하지 않음');
 let q=remoteActPlan(null,{x:'gym-lift',n:1,v:0});
 q=remoteActPlan(q.applied,{x:'gym-lift',n:1,v:3},'gym-lift');assert.equal(q.press,3);
 q=remoteActPlan(q.applied,{x:'gym-lift',n:1,v:3},'gym-lift');assert.equal(q.press,0);
});

test('원격 몸 자세: act가 있으면 act, 없으면 옛 FLAG.sit, 차는 받은 때부터 3초, 같이 셀카 요청자는 휴대폰 셀카', () => {
 assert.equal(remoteBody(null,{sitFlag:true}).pose,'sit');
 assert.equal(remoteBody(null,{}).pose,'stand');
 const t=remoteBody({p:'tea',g:'none',sf:0},{teaSince:10,now:11.5});
 assert.equal(t.pose,'tea');assert.equal(t.teaProgress,1.5/TEA_SECONDS);
 assert.equal(remoteBody({p:'tea'},{teaSince:10,now:20}).teaProgress,1);
 assert.deepEqual(remoteBody({p:'stand',g:'binoculars',sf:0},{}),{pose:'stand',teaProgress:0,gadget:'binoculars',selfie:false});
 assert.deepEqual(remoteBody({p:'stand',g:'none',sf:0},{session:true}),{pose:'stand',teaProgress:0,gadget:'phone',selfie:true});
 assert.equal(remoteBody({p:'stand',g:'phone',sf:1},{}).selfie,true);
});

test('동작 자리 행렬 다시 세우기: spotOf(서는 자리·방향)의 역', () => {
 const def={spot:[-.6,.35],facing:0};
 for(const yaw of [0,.7,-2.1,3]){
  const ox=12,oz=-5,c=Math.cos(yaw),s=Math.sin(yaw);
  // spotOf 정방향
  const x=ox+c*def.spot[0]+s*def.spot[1],z=oz-s*def.spot[0]+c*def.spot[1],heading=yaw+def.facing+Math.PI;
  const f=frameFromSpot(def,{x,z,heading});
  assert.ok(Math.abs(f.x-ox)<1e-9&&Math.abs(f.z-oz)<1e-9,`yaw ${yaw}`);
  assert.ok(Math.abs(Math.atan2(Math.sin(f.yaw-yaw),Math.cos(f.yaw-yaw)))<1e-9);
 }
});

test('몸 동작 목록 = hiker-acts 동작 전부', () => {
 assert.deepEqual([...BODY_ACTS].sort(),Object.keys(ACT_SECONDS).sort());
 for(const x of BODY_ACTS)assert.ok(sanitizeAct('hiking',{x}),x);
});

test('multi-client가 act를 보내고(바뀔 때·인사·재접속·숨은 탭) 받아 원격 몸에 그린다', () => {
 const src=readFileSync(new URL('../src/multi-client.js',import.meta.url),'utf8');
 assert.match(src,/function greetNew\(\)\{[^}]*sendAct\(true\)/,'처음 보는 사람에게 act');
 assert.match(src,/m\?\.t==='welcome'[^\n]*sendAct\(true\)/,'다시 접속(welcome) 때 act');
 assert.match(src,/createBackgroundTimer\([^\n]*sendAct\(\)/,'숨은 탭 타이머도 act');
 assert.match(src,/m\.t==='act'/,'act 받기');
 assert.match(src,/createHikerActs\(e\.hiker,\{[^}]*quiet:true/,'원격 동작은 말풍선·소리·도장 없이');
 assert.match(src,/drawnAct:/,'진단');
 const acts=readFileSync(new URL('../src/toon/hiker-acts.js',import.meta.url),'utf8');
 assert.match(acts,/const say=[^\n]*quiet\?undefined/);assert.match(acts,/const event=[^\n]*quiet\?undefined/);
});
