// 첫 모금 연출(moment.js)·소리 약속(audio.js)·금연 기록 도장(profile.js) 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';

const bus=new EventTarget();
globalThis.window=globalThis;
globalThis.addEventListener=bus.addEventListener.bind(bus);globalThis.removeEventListener=bus.removeEventListener.bind(bus);globalThis.dispatchEvent=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
const fire=(type,detail)=>dispatchEvent(new CustomEvent(type,{detail}));

const mods=await import('../src/lounge/moment.js');
const {momentPlan,envelope,overlayBackground,createMoment,MAX_ALPHA,MOMENT_SECONDS}=mods;
const {SOUND_NAMES,exhaleLen,sizzleGain,createLoungeAudio}=await import('../src/lounge/audio.js');
const {recordCig,todayCigs,cigWon,attachRecord,DEFAULT_PROFILE}=await import('../src/lounge/profile.js');

// ── A3 첫 모금 연출
test('첫 내뿜기만 연출하고, 불투명도는 0.25 이하이며 멘솔은 파랑이 섞인다',()=>{
 const base={id:'me',state:'exhale',first:true,quality:'sweet',kind:'mild'};
 const p=momentPlan(base);assert.ok(p);assert.equal(p.secs,1.5);assert.equal(MOMENT_SECONDS,1.5);
 assert.ok(p.zoom>0&&p.duck<1&&p.warm>0&&p.cool===0&&p.shake===0);
 const m=momentPlan({...base,kind:'menthol'});assert.ok(m.cool>0&&m.warm+m.cool<=MAX_ALPHA);assert.ok(p.warm+p.cool<=MAX_ALPHA);
 assert.match(overlayBackground(m.warm,m.cool),/120,196,255/);
 assert.equal(momentPlan({...base,first:false}),null,'두 번째 모금은 연출 없음');
 assert.equal(momentPlan({...base,id:'npc-mina'}),null,'NPC는 연출 없음');
 assert.equal(momentPlan({...base,state:'inhale'}),null);
});
test('기침은 색·줌 없이 작은 흔들림만',()=>{
 const p=momentPlan({id:'me',state:'exhale',first:false,quality:'cough',kind:'mild'});
 assert.deepEqual([p.shake,p.warm,p.cool,p.zoom,p.duck],[1,0,0,0,1]);
 const f=momentPlan({id:'me',state:'exhale',first:true,quality:'cough',kind:'mild'});assert.equal(f.warm,0,'첫 모금이 기침이면 따뜻한 연출은 하지 않음');
});
test('카메라는 다가갔다가 사용자가 돌린 값은 그대로 두고 처음 위치로 돌아온다',()=>{
 const cam={dist:3.2,yaw:1,pitch:.28},calls=[];
 const L={cam,setCam(o){calls.push(o);Object.assign(cam,o);}};
 const ducks=[];const style={};
 const doc={createElement:()=>({style,setAttribute(){},remove(){}}),body:{appendChild(){}}};
 const mo=createMoment({audio:{duck:(k,s)=>ducks.push([k,s])},lounge:()=>L,doc});
 fire('lounge:smoke',{id:'me',state:'exhale',first:true,quality:'sweet',kind:'mild'});
 assert.equal(mo.active,true);assert.deepEqual(ducks,[[.35,1.5]]);
 let minDist=cam.dist,maxAlpha=0;
 for(let i=0;i<30;i++){mo.update(.05);minDist=Math.min(minDist,cam.dist);maxAlpha=Math.max(maxAlpha,mo.alpha);
  if(i===8)cam.dist+=.5; // 중간에 사용자가 휠로 멀어짐
 }
 assert.ok(minDist<3.2-.2,`가까워짐 ${minDist}`);assert.ok(maxAlpha<=MAX_ALPHA&&maxAlpha>.1,`alpha ${maxAlpha}`);
 mo.update(.05);assert.equal(mo.active,false);
 assert.ok(Math.abs(cam.dist-3.7)<1e-9,`사용자 줌 유지: ${cam.dist}`);assert.equal(cam.yaw,1);assert.equal(style.opacity,'0');
 mo.dispose();
});
test('기침 흔들림은 아주 작고 끝나면 제자리',()=>{
 const cam={dist:3,yaw:0,pitch:.3},L={cam,setCam(o){Object.assign(cam,o);}};
 const mo=createMoment({audio:{},lounge:()=>L,doc:null});
 fire('lounge:smoke',{id:'me',state:'exhale',first:false,quality:'cough',kind:'strong'});
 let maxYaw=0;for(let i=0;i<40&&mo.active;i++){mo.update(.04);maxYaw=Math.max(maxYaw,Math.abs(cam.yaw));}
 assert.ok(maxYaw>0&&maxYaw<=.005,`yaw ${maxYaw}`);assert.ok(Math.abs(cam.yaw)<1e-12&&Math.abs(cam.pitch-.3)<1e-12&&cam.dist===3);
 mo.dispose();
 assert.ok(envelope(0)===0&&envelope(1)===0&&envelope(.5)>.99);
});
test('움직임 줄이기 설정이면 카메라는 안 움직인다',()=>{
 const cam={dist:3,yaw:0,pitch:.3},L={cam,setCam(o){Object.assign(cam,o);}};
 const mo=createMoment({audio:{},lounge:()=>L,doc:null,reduced:true});
 fire('lounge:smoke',{id:'me',state:'exhale',first:true,quality:'sweet',kind:'mild'});
 for(let i=0;i<10;i++)mo.update(.05);assert.equal(cam.dist,3);mo.dispose();
});
test('카메라 쪽으로 내뿜으면 화면이 잠깐 뿌옇고, 등지고 뿜거나 기침·NPC면 안 뿌옇다',()=>{
 const {hazePlan,HAZE_MAX,HAZE_SECONDS}=mods;
 const d={id:'me',state:'exhale',quality:'sweet',kind:'mild',amount:1};
 assert.equal(hazePlan(d,1,1),null,'카메라를 등지면(heading=camYaw) 없음');
 const face=hazePlan(d,1+Math.PI,1);assert.ok(face&&face.alpha>0&&face.alpha<=HAZE_MAX);
 assert.ok(hazePlan({...d,amount:2},1+Math.PI,1).alpha>face.alpha,'시가처럼 연기가 많으면 더 진함');
 assert.equal(hazePlan({...d,quality:'cough'},1+Math.PI,1),null);
 assert.equal(hazePlan({...d,id:'npc-mina'},1+Math.PI,1),null);
 const cam={dist:3,yaw:0,pitch:.3},L={cam,player:{heading:Math.PI},setCam(o){Object.assign(cam,o);}};
 const mo=createMoment({audio:{},lounge:()=>L,doc:null});
 fire('lounge:smoke',d);let peak=0;
 for(let t=0;t<HAZE_SECONDS+.2;t+=.05){mo.update(.05);peak=Math.max(peak,mo.hazeAlpha);}
 assert.ok(peak>.1,`peak ${peak}`);assert.equal(mo.hazeAlpha,0,'끝나면 맑아짐');mo.dispose();
});

// ── A4 소리
test('소리 이름과 내쉬는 숨·치이익 크기',()=>{
 for(const n of ['cap','wheel','lighter','exhale','ash','cough','ring','can','stamp'])assert.ok(SOUND_NAMES.includes(n),n);
 const t=q=>{const l=exhaleLen(q);return l.hold+l.release;};
 assert.ok(t('sweet')>t('light')*1.5&&t('deep')>t('sweet'),'sweet·deep은 길게 내쉼');
 assert.equal(sizzleGain(0),0);assert.ok(sizzleGain(.2)<sizzleGain(.6)&&sizzleGain(.6)<sizzleGain(1)&&sizzleGain(1)<=.16,'draw가 커질수록 커짐');
});
test('오디오: 입력 전에는 소리 없이 이벤트를 받고, duck이 있다',()=>{
 const a=createLoungeAudio();
 assert.equal(typeof a.duck,'function');
 fire('lounge:smoke',{id:'me',state:'exhale',quality:'deep'});
 fire('lounge:spot',{spot:'vending',state:'use'});
 assert.equal(a.status().skipped,1,'캔 소리는 요청됐지만 입력 전이라 건너뜀');
 assert.equal(a.play('can'),false);a.update(.1,{draw:.5});a.dispose();
});

// ── B7 금연 기록
const mkProfile=(o={})=>({...structuredClone(DEFAULT_PROFILE),status:'quit',quitDate:'2026-10-01',...o});
test('한 개비 값은 한 갑 값÷20, 오늘·누적이 쌓이고 날짜가 바뀌면 오늘만 0부터',()=>{
 const p=mkProfile();assert.equal(cigWon(p),225);assert.equal(cigWon({packPrice:5000}),250);
 const d1=Date.parse('2026-11-08T10:00:00+09:00'),d2=Date.parse('2026-11-09T09:00:00+09:00');
 let r=recordCig(p,d1);assert.deepEqual(r,{date:'2026-11-08',today:1,total:1,savedWon:225});
 p.stats.record=r;r=recordCig(p,d1);assert.deepEqual([r.today,r.total,r.savedWon],[2,2,450]);
 p.stats.record=r;assert.equal(todayCigs(p,d1),2);assert.equal(todayCigs(p,d2),0);
 r=recordCig(p,d2);assert.deepEqual([r.today,r.total,r.savedWon],[1,3,675]);
});
test('내 담배가 finished 되면 기록·lounge:record·도장, 다른 상태·NPC·비흡연자는 무시',()=>{
 const profile=mkProfile(),saved=[],records=[],stamps=[];
 const off=attachRecord({profile,save:p=>Object.assign(profile,p),dispatch:(t,d)=>{saved.push(t);records.push(d);},onStamp:s=>stamps.push(s)});
 fire('lounge:smoke',{id:'me',state:'smoking'});fire('lounge:smoke',{id:'npc-mina',state:'finished'});fire('lounge:smoke',{id:'me',state:'dispose'});
 assert.equal(stamps.length,0);
 fire('lounge:smoke',{id:'me',state:'finished'});
 assert.equal(stamps.length,1);assert.equal(stamps[0].won,225);assert.equal(stamps[0].total,1);
 assert.deepEqual(records[0],{today:1,total:1,savedWon:225,won:225});assert.equal(saved[0],'lounge:record');
 assert.equal(profile.stats.record.total,1,'저장됨');assert.equal(profile.stats.cigs,0,'다른 통계는 그대로');
 fire('lounge:smoke',{id:'me',state:'finished'});assert.equal(profile.stats.record.total,2);assert.equal(profile.stats.record.savedWon,450);
 profile.status='never';fire('lounge:smoke',{id:'me',state:'finished'});assert.equal(profile.stats.record.total,2,'비흡연자는 기록 안 함');
 off();profile.status='quit';fire('lounge:smoke',{id:'me',state:'finished'});assert.equal(profile.stats.record.total,2,'해제 후엔 무시');
});
