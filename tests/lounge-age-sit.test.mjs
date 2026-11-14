// 흡연장 11-13: 입장 안내·태어난 해(profile.js·age-gate.js)와 벤치 앉기 자세(spots.js createPoser — 내 몸·같이 피우는 사람·NPC가 같은 코드).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {parseBirthYear,isAdultYear,agePassed,saveAgeCheck,loadAgeCheck,AGE_KEY} from '../src/lounge/profile.js';
import {ageCardHtml,ageGate,AGE_TEXT} from '../src/lounge/age-gate.js';
import {createPoser,newPoseState,SEAT_PAD,SIT} from '../src/lounge/spots.js';

const memStore=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};

test('태어난 해: 숫자 4자리·1900~올해만, 연 나이 19 이상이면 성인(2026년 = 2007년생까지)',()=>{
 assert.equal(parseBirthYear('1995',2026),1995);
 for(const bad of ['95','19955','abcd','1899','2027','',null,' 20 '])assert.equal(parseBirthYear(bad,2026),null,String(bad));
 assert.ok(isAdultYear(2007,2026));assert.ok(!isAdultYear(2008,2026));assert.ok(!isAdultYear(2012,2026));
});

test('성인만 저장하고(lounge.age 하나, {y,ok,at}), 미성년은 저장하지 않아 다시 묻는다',()=>{
 const st=memStore(),now=new Date('2026-11-13T03:00:00Z');
 assert.equal(saveAgeCheck(2012,st,now),false);assert.equal(st.getItem(AGE_KEY),null);assert.ok(!agePassed(st,2026));
 assert.equal(saveAgeCheck(2000,st,now),true);
 assert.deepEqual(JSON.parse(st.getItem(AGE_KEY)),{y:2000,ok:true,at:'2026-11-13'});
 assert.equal([...st.m.keys()].length,1,'다른 것은 저장하지 않음');
 assert.ok(agePassed(st,2026));assert.ok(agePassed(st,2030),'해가 바뀌어도 성인은 계속 성인');
 st.setItem(AGE_KEY,'{"y":2000,"ok":false}');assert.equal(loadAgeCheck(st),null);
 st.setItem(AGE_KEY,'깨진 값');assert.equal(loadAgeCheck(st),null);
});

test('한 번 확인했으면 안내를 띄우지 않고, 점검 브라우저는 ?age=on일 때만 띄운다',async()=>{
 const st=memStore();saveAgeCheck(1990,st);
 assert.deepEqual(await ageGate({query:new URLSearchParams(''),webdriver:false,store:st,host:{}}),{shown:false});
 assert.deepEqual(await ageGate({query:new URLSearchParams(''),webdriver:true,store:memStore(),host:{}}),{shown:false});
});

test('안내 카드 문구: 공지 3줄·금연 상담 전화 링크·19+ 도장, 막힘 화면은 입력 없이 처음으로만, 읽기 모드는 닫기만',()=>{
 const ask=ageCardHtml('ask');
 assert.match(ask,/들어가기 전에/);assert.match(ask,/실제 담배나 제품 광고가 아니에요/);assert.match(ask,/만 19세 미만은 이용할 수 없어요/);
 assert.match(ask,/href="tel:1544-9030"/);assert.match(ask,/19\+/);assert.match(ask,/inputmode="numeric"/);assert.match(ask,/위 내용을 확인했어요/);
 assert.match(ask,/data-age="enter" disabled/,'처음에는 들어가기가 꺼져 있다');
 const block=ageCardHtml('block');assert.match(block,new RegExp(AGE_TEXT.blockTitle));assert.doesNotMatch(block,/<input/);assert.match(block,/처음으로/);
 const read=ageCardHtml('read');assert.doesNotMatch(read,/<input/);assert.match(read,/data-a="close"/);assert.equal((read.match(/<li>/g)??[]).length,3);
 // 서버로 보내지 않는다: 안내 화면 코드에 네트워크 호출이 없다
 const src=readFileSync(new URL('../src/lounge/age-gate.js',import.meta.url),'utf8');assert.doesNotMatch(src,/fetch\(|WebSocket|sendBeacon|XMLHttpRequest/);
});

// 동동이 비율 그대로의 가짜 뼈(허벅지 0.065·정강이 0.062·발 0.03 — 실제 측정값, 11-13)
function fakeAvatar(){
 const root=new THREE.Group(),model=new THREE.Group();root.add(model);
 const bone=(n,parent,p)=>{const b=new THREE.Bone();b.name='mixamorig'+n;b.position.set(...p);parent.add(b);return b;};
 const hips=bone('Hips',model,[0,.23,0]),s0=bone('Spine',hips,[0,.05,0]),s1=bone('Spine1',s0,[0,.05,0]),s2=bone('Spine2',s1,[0,.06,0]);
 bone('Head',s2,[0,.12,0]);
 for(const [s,x] of [['Left',1],['Right',-1]]){
  const a=bone(s+'Arm',s2,[.1*x,.04,0]),f=bone(s+'ForeArm',a,[0,-.1,0]);bone(s+'Hand',f,[0,-.08,0]);
  const u=bone(s+'UpLeg',hips,[.06*x,-.035,0]),k=bone(s+'Leg',u,[0,-.065,0]),ft=bone(s+'Foot',k,[0,-.062,0]);bone(s+'ToeBase',ft,[0,-.01,.03]);
 }
 return {root,hiker:{model},x:0,z:0,heading:0,extra:[]};
}
test('벤치 앉기: 골반이 좌판 위, 다리를 앞으로 쭉(무릎 거의 펴짐, 발이 좌판 앞 가장자리보다 앞, 좌판 높이 근처), 등받이 쪽으로 기댐',()=>{
 // 앉으면 다리가 달랑달랑(위상 Math.random) — 시험은 위상을 0으로 고정해 늘 같은 자세를 본다.
 const rnd=Math.random;Math.random=()=>0;try{
 const av=fakeAvatar(),S=newPoseState(),seat={x:0,z:0,y:.4375,heading:0};
 const poser=createPoser({S,avatar:av,rooftop:{spots:{}},world:new THREE.Group(),auto:false});
 S.pose='sit';S.last='sit';S.spot={kind:'bench',index:0,x:0,z:.6,seat};
 const W=n=>av.hiker.model.getObjectByName('mixamorig'+n).getWorldPosition(new THREE.Vector3());
 const spine0=av.hiker.model.getObjectByName('mixamorigSpine');
 for(let i=0;i<60;i++){av.root.position.set(0,0,0);av.root.updateMatrixWorld(true);
  for(const b of av.root.getObjectsByProperty('isBone',true))b.quaternion.identity();av.root.updateMatrixWorld(true);poser.pose(1/30);}
 assert.ok(S.w>.99);
 assert.ok(Math.abs(W('Hips').y-(seat.y+SEAT_PAD))<.005,'골반 = 좌판 + 허벅지 두께');
 assert.ok(Math.abs(W('Hips').z+SIT.back)<.01&&SIT.back<0,'좌판 앞쪽으로 당겨 앉는다(신발이 앞 가장자리 밖으로)');
 for(const s of ['Left','Right']){
  const h=W(s+'UpLeg'),k=W(s+'Leg'),f=W(s+'Foot'),t=W(s+'ToeBase');
  const th=k.clone().sub(h).normalize(),sh=f.clone().sub(k).normalize(),ang=THREE.MathUtils.radToDeg(Math.acos(th.dot(sh)));
  assert.ok(th.z>.7&&th.y<0&&th.y>-.95,`${s} 허벅지는 앞으로, 수평보다 조금 아래(${th.y.toFixed(2)})`);
  assert.ok(ang<45,`${s} 무릎 거의 폄 ${ang.toFixed(0)}°`);
  const L2=h.distanceTo(k)+k.distanceTo(f);assert.ok(f.z-h.z>L2*.6,`${s} 다리 길이만큼 앞으로 뻗음 ${(f.z-h.z).toFixed(2)}/${L2.toFixed(2)}`);
assert.ok(Math.abs(f.y-(seat.y+SEAT_PAD))<.3,`${s} 발 높이 좌판 근처(${f.y.toFixed(2)})`);
  assert.ok(t.y>f.y&&t.z>f.z,`${s} 발끝이 위·앞`);
 }
 const up=new THREE.Vector3(0,1,0).applyQuaternion(spine0.getWorldQuaternion(new THREE.Quaternion()));
 assert.ok(up.z<-.1,'상체가 뒤(등받이 쪽)로 기댄다');
 }finally{Math.random=rnd;}
});

test('일어나기는 머리 위 표시가 아니라 아래 손 단추 줄(E 키), NPC도 같은 앉기 자세 코드를 쓴다',()=>{
 const sp=readFileSync(new URL('../src/lounge/spots.js',import.meta.url),'utf8');
 assert.match(sp,/if\(mine\)return null;/);
 assert.match(sp,/btn\('stand','↩','일어나기','sec stand',' title="E"'\)/);
 assert.match(sp,/btn\('stand','↩','난간에서 떨어지기','sec stand',' title="E"'\)/);
 const npc=readFileSync(new URL('../src/lounge/npc.js',import.meta.url),'utf8');
 assert.match(npc,/createPoser\(/);assert.match(npc,/a\.extra\.unshift\(poser\.pose\)/);
});
