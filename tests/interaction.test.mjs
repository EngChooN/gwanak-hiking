import test from 'node:test';
import assert from 'node:assert/strict';
import {INTERACTION_SITES} from '../assets/realistic/interaction-sites.js';
import {STAMPS,PAGES,BOARD_PAGES,LANDMARKS,LANDMARK_OBSERVER,ACTIONS,RULES,NOT_SIGN_NOTICE,STONE_NOTICE,CARD_NOTICE,CHIP_LABEL,STREAM_SPOTS} from '../src/interaction-data.js';
import {bearingToDirection,directionToBearing,headingToBearing,bearingToHeading,initialBearing,greatCircle,elevationDeg,landmarkAt,classifyLandmarks,stackLabels,arrowAngle,pickCandidate,markerCandidates,emptyProgress,loadProgress,saveProgress,addStamp,stampCount,hasAllStamps,notebookSlots,cardData,applyStamina,wrap180,landmarksEnabled,weatherVisibility,PROGRESS_KEY} from '../src/interaction-logic.js';
import {createInteraction,actionPose} from '../src/interaction-controller.js';
import {KEY_COMMANDS,commandFor,interactKeyId} from '../src/input.js';
import {geographicToLocal} from '../src/route.js';
import {facilityBlocks,SUMMIT_BLOCKERS,SUMMIT_BODY} from '../src/summit.js';

const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg??''} ${a} ≠ ${b} (±${tol})`);

// ── 방위 변환: 진북 시계방향 → 앱 좌표(동 +x, 남 +z) ──
test('진북 방위 ↔ 앱 방향: 북 −z, 동 +x, 남 +z, 서 −x',()=>{
 const d=b=>bearingToDirection(b);
 near(d(0).x,0,1e-9);near(d(0).z,-1,1e-9);near(d(90).x,1,1e-9);near(d(90).z,0,1e-9);near(d(180).x,0,1e-9);near(d(180).z,1,1e-9);near(d(270).x,-1,1e-9);
 for(const b of [0,10,45,90,135,200,271,359])near(directionToBearing(d(b).x,d(b).z),b,1e-9,`왕복 ${b}`);
});
test('카메라 heading(앞=(-sin h,-cos h)) ↔ 진북 방위: heading 0은 북, 오른쪽(음의 h)으로 돌면 동',()=>{
 near(headingToBearing(0),0,1e-9);near(headingToBearing(-Math.PI/2),90,1e-9);near(headingToBearing(Math.PI/2),270,1e-9);
 for(const h of [-2,-.5,0,.7,3]){const f={x:-Math.sin(h),z:-Math.cos(h)},b=bearingToDirection(headingToBearing(h));near(f.x,b.x,1e-9);near(f.z,b.z,1e-9);near(wrap180(headingToBearing(bearingToHeading(77))-77),0,1e-9);}
});
test('랜드마크 방위: 위경도 계산이 자료 표(§③)와 0.2° 이내, 앱 좌표(geographicToLocal)로 본 방위도 일치',()=>{
 const doc={'lm-63':345.6,'lm-hangang-1':355.9,'lm-hangang-2':12.2,'lm-yeouido':339.3,'lm-namsan':10.2,'lm-bugak':5.4,'lm-bukhan':6.1,'lm-dobong':9.0,'lm-lotte':58.5,'lm-cheonggye':115.8,'lm-gwanggyo':151.1,'lm-namhan':81.4,'lm-suri':224.6,'lm-gyeyang':298.7,'lm-songdo':256.6,'lm-incheon-bridge':264.5,'lm-airport':272.7};
 const o=geographicToLocal(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,0);
 for(const lm of LANDMARKS){
  near(initialBearing(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,lm.lat,lm.lon),doc[lm.id],.2,lm.name);
  const l=geographicToLocal(lm.lat,lm.lon,0),b=directionToBearing(l.x-o.x,l.z-o.z);
  near(wrap180(b-doc[lm.id]),0,.45,`${lm.name} 앱 좌표 방위`);
 }
});
test('랜드마크 거리·고각이 자료 표와 맞다',()=>{
 const doc={'lm-63':[8.56,-2.5],'lm-namsan':[11.98,-.9],'lm-bugak':[17.97,-1.1],'lm-bukhan':[24.11,.3],'lm-dobong':[28.53,.1],'lm-cheonggye':[7.58,-.3],'lm-gwanggyo':[12.76,-.4],'lm-suri':[12.26,-.8],'lm-gyeyang':[25.04,-.7]};
 for(const lm of LANDMARKS){const d=greatCircle(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,lm.lat,lm.lon);if(!doc[lm.id])continue;
  near(d/1000,doc[lm.id][0],.06,`${lm.name} 거리`);near(elevationDeg(d,lm.topAlt,LANDMARK_OBSERVER.alt),doc[lm.id][1],.25,`${lm.name} 고각`);}
});
test('랜드마크 17곳, 인천 쪽 3곳은 방향만, 시선 가림 미확인 4곳은 추정, 남한산 높이 줄 없음',()=>{
 assert.equal(LANDMARKS.length,17);assert.equal(new Set(LANDMARKS.map(l=>l.id)).size,17);
 assert.deepEqual(LANDMARKS.filter(l=>l.far).map(l=>l.name.split(' ')[0]).sort(),['송도국제도시','인천국제공항','인천대교']);
 assert.deepEqual(LANDMARKS.filter(l=>l.blocked).map(l=>l.name).sort(),['광교산','남한산','수리산','청계산']);
 assert.equal(LANDMARKS.find(l=>l.id==='lm-namhan').height,'');
});
test('classifyLandmarks: 띠 ±25°, 시야 안, 가장자리 알약 최대 2개, 가운데 맞춤 ±1.2°',()=>{
 const p={x:0,z:0,elevation:654.5},mk=(lm,b)=>({...lm,bearing:b,km:10,seeable:true,directionOnly:!!lm.far,elev:0});
 const rows=[mk(LANDMARKS[0],8),mk(LANDMARKS[1],9),mk(LANDMARKS[2],15),mk(LANDMARKS[3],20),mk(LANDMARKS[4],40),mk(LANDMARKS[14],7.5)];
 const c=classifyLandmarks(rows,8,{halfFov:3.5});
 assert.equal(c.tape.length,5);assert.deepEqual(c.inView.map(r=>r.bearing).sort(),[7.5,8,9]); // 방향만(far) 대상도 시야 안에 들면 목록에 든다(점 없는 점선 알약으로 그린다)
 assert.equal(c.edges.length,2);assert.equal(c.focus.bearing,8);
 assert.equal(classifyLandmarks(rows,200,{halfFov:3.5}).tape.length,0);
 near(wrap180(350-10),-20,1e-9);
});
test('이름표 겹침은 위로 계단식(최대 3줄)',()=>{
 const out=stackLabels([{x:100,name:'북한산'},{x:110,name:'도봉산'},{x:120,name:'남산'},{x:700,name:'멀리'}]);
 assert.deepEqual(out.map(o=>o.row),[0,1,2,0]);
});
test('날씨 가시거리: 맑음 25km, 안개 1.5km. 정상 부근에서만 이름표',()=>{
 assert.equal(weatherVisibility('clear'),25);assert.equal(weatherVisibility('fog'),1.5);
 const lm=landmarkAt(LANDMARKS[0],{x:0,z:-8560},{x:0,z:0,elevation:654},weatherVisibility('fog'));assert.equal(lm.seeable,false);assert.equal(lm.hazyNow,true);
 assert.equal(landmarksEnabled('summit',100),true);assert.equal(landmarksEnabled('route',300),false);assert.equal(landmarksEnabled('route',600),true);
});

// ── 이정표 화살표(내가 보는 방향 기준) ──
test('이정표 화살표: 북쪽을 보고 있으면 동쪽 판은 오른쪽(시계방향 90°), 뒤쪽 판은 아래',()=>{
 const east=Math.PI/2,south=0;// 월드 각 a: 벡터 (sin a, cos a). 동 = π/2, 남 = 0
 near(arrowAngle(east,0),Math.PI/2,1e-9);near(Math.abs(arrowAngle(south,0)),Math.PI,1e-9);near(arrowAngle(-east,0),-Math.PI/2,1e-9);
 near(arrowAngle(east,-Math.PI/2),0,1e-9); // 동쪽을 보고 있으면 동쪽 판은 정면(위)
});

// ── 후보 선택·알약 규칙 ──
const P=(x,z,heading=0)=>({x,z,heading});
test('알약: 4m(정상석·스탬프 6m) 안 + 시선 ±70°에서 나타나고 6.5m 밖에서 사라진다',()=>{
 const sign={id:'a',x:0,z:-3.9,showRadius:4},stamp={id:'s',x:0,z:-5.9,showRadius:6},far={id:'f',x:0,z:-4.5,showRadius:4};
 assert.equal(pickCandidate([sign],P(0,0))?.primary.id,'a');assert.equal(pickCandidate([far],P(0,0)),null);assert.equal(pickCandidate([stamp],P(0,0))?.primary.id,'s');
 assert.equal(pickCandidate([sign],P(0,0,Math.PI)),null,'뒤돌아 있으면 안 보임'); // 시선 반대
 assert.equal(pickCandidate([sign],P(0,0,Math.PI),'a')?.primary.id,'a','이미 보이는 후보는 6.5m 안에서 유지'); // 깜빡임 방지
 assert.equal(pickCandidate([{...sign,z:-6.6}],P(0,0),'a'),null,'6.5m 밖으로 나가면 사라짐');
 assert.equal(pickCandidate([{...sign,x:4,z:0}],P(0,0)),null,'옆(90°)은 안 보임');
});
test('후보가 여럿이면 거리+시선 점수로 하나만, 같은 자리 행동은 아래 줄로 쌓인다',()=>{
 const a={id:'a',x:0,z:-3,showRadius:4,group:'g1'},b={id:'b',x:2,z:-2.5,showRadius:4,group:'g1'},c={id:'c',x:0,z:-2,showRadius:4,group:'g2'};
 const r=pickCandidate([a,b,c],P(0,0));assert.equal(r.primary.id,'c');assert.equal(r.stack.length,0);
 const r2=pickCandidate([a,b],P(0,0));assert.equal(r2.primary.id,'a');assert.deepEqual(r2.stack.map(x=>x.id),['b']);
});
test('15m 마커: 15m 안 가까운 순, 이미 한 곳은 뺀다',()=>{
 const l=[{id:'a',x:0,z:-14},{id:'b',x:0,z:-16},{id:'c',x:0,z:-3}];
 assert.deepEqual(markerCandidates(l,P(0,0)).map(o=>o.c.id),['c','a']);assert.deepEqual(markerCandidates(l,P(0,0),{done:c=>c.id==='c'}).map(o=>o.c.id),['a']);
 assert.equal(RULES.marker,15);assert.equal(RULES.hide,6.5);assert.equal(RULES.showStamp,6);
});

// ── 자료·문구 ──
test('이정표 11곳·해설판 3곳·정상판, 스탬프 6곳이 배치 자료와 안내판 자료에 모두 있다',()=>{
 const signs=INTERACTION_SITES.filter(s=>s.kind==='trailSign'&&!s.existing),info=INTERACTION_SITES.filter(s=>s.kind==='infoBoard'),sum=INTERACTION_SITES.filter(s=>s.kind==='summitBoard');
 assert.equal(signs.length,11);assert.equal(info.length,3);assert.equal(sum.length,1);
 for(const s of INTERACTION_SITES.filter(x=>x.kind==='infoBoard'||x.kind==='summitBoard'))for(const k of BOARD_PAGES[s.id])assert.ok(PAGES[k],`${s.id} → ${k}`);
 for(const s of signs.filter(x=>x.contentId))assert.ok(PAGES[s.contentId],s.contentId);
 assert.deepEqual(STAMPS.map(s=>s.id),INTERACTION_SITES.filter(s=>s.kind==='stampBox').map(s=>s.id));
 assert.equal(STAMPS.length,6);assert.equal(STREAM_SPOTS.length,3);
});
test('안내판 쪽마다 칩(확인됨/전해지는 이야기/추정)·출처가 있고, 돌 문구·완등 카드 고정 문구가 자료에 있다',()=>{
 for(const [k,p] of Object.entries(PAGES)){assert.ok(p.chips.length>=1&&p.chips.every(c=>CHIP_LABEL[c.kind]),k);assert.ok(p.source&&p.body.length,k);}
 assert.equal(NOT_SIGN_NOTICE,'직접 정리한 설명이며 현장 안내판 글이 아닙니다');assert.equal(STONE_NOTICE,'게임 속 돌이에요. 실제 산에서는 돌을 옮기지 않아요');assert.equal(CARD_NOTICE,'온라인 체험 기록 · 실제 등산 기록이 아닙니다');
 assert.ok(PAGES['연주대'].chips.some(c=>c.kind==='lore')&&PAGES['정상석'].chips.some(c=>c.kind==='est'));
 assert.ok(!/먹어도 되는|식수로/.test(JSON.stringify(ACTIONS)+JSON.stringify(PAGES)),'약수터는 식수 표현 금지');
});

// ── 저장·수첩·카드 ──
const memStorage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
test('스탬프 저장·복원: 한 번만 찍히고 새로고침해도 유지, 깨진 값은 무시',()=>{
 const st=memStorage(),p=emptyProgress();
 assert.equal(addStamp(p,'stamp-2',{at:1000,km:1.3,elev:144,weather:'맑음'}),true);assert.equal(addStamp(p,'stamp-2',{at:2000,km:9,elev:9}),false);assert.equal(p.stamps['stamp-2'].at,1000);assert.equal(addStamp(p,'nope',{at:1}),false);
 p.stones=3;saveProgress(st,p);const q=loadProgress(st);assert.equal(stampCount(q),1);assert.equal(q.stamps['stamp-2'].weather,'맑음');assert.equal(q.stones,3);
 st.setItem(PROGRESS_KEY,'{깨짐');assert.equal(stampCount(loadProgress(st)),0);
 st.setItem(PROGRESS_KEY,JSON.stringify({stamps:{'stamp-1':{at:'x'},'stamp-3':{at:5}},stones:-4}));const r=loadProgress(st);assert.deepEqual(Object.keys(r.stamps),['stamp-3']);assert.equal(r.stones,0);
});
test('수첩 칸: 찍은 칸 기록, 못 찍은 칸은 "다음"과 앞 칸에서의 거리',()=>{
 const p=emptyProgress();addStamp(p,'stamp-1',{at:1,km:0,elev:99});addStamp(p,'stamp-2',{at:2,km:1.3,elev:144});
 const s=notebookSlots(p);assert.equal(s.filter(x=>x.got).length,2);assert.equal(s[2].next,true);near(s[2].ahead,1.08,.01);assert.equal(s[3].next,false);assert.equal(hasAllStamps(p),false);
});
test('완등 카드 값: 거리·시간·오른 높이·스탬프 수가 게임 상태 그대로',()=>{
 const p=emptyProgress();for(const s of STAMPS)addStamp(p,s.id,{at:Date.UTC(2026,10,4,3,0),km:s.km,elev:s.elev});
 const d=cardData({elapsed:9668,distance:5093.4,ascent:573.6},p,{now:Date.UTC(2026,10,4,3,0),weatherLabel:'맑음'});
 assert.equal(d.elapsed,'02:41:08');assert.equal(d.distanceKm,'5.09 km');assert.equal(d.ascent,'+574 m');assert.equal(d.stampText,'6 / 6');assert.equal(d.nickname,'산길 손님');assert.equal(d.stamps.filter(s=>s.got).length,6);
});
test('체력 회복은 100을 넘지 않고, 30 이상이면 달리기 탈진을 푼다',()=>{
 const st={stamina:92,runExhausted:true};near(applyStamina(st,15),8,1e-9);assert.equal(st.stamina,100);
 const e={stamina:20,runExhausted:true};applyStamina(e,15);assert.equal(e.stamina,35);assert.equal(e.runExhausted,false);
});

// ── 키 ──
test('키 배정: F는 알약이 있을 때만 실행, 없으면 정면 보기. Q/E 회전·기존 키·멀티 키(G·K)와 겹치지 않는다',()=>{
 assert.equal(interactKeyId('KeyF',commandFor('KeyF'),true),'interact');assert.equal(interactKeyId('KeyF',commandFor('KeyF'),false),'face-forward');assert.equal(interactKeyId('KeyR','auto',true),'auto');
 assert.equal(KEY_COMMANDS.KeyJ,'stamps-toggle');assert.equal(KEY_COMMANDS.KeyN,'labels-toggle');assert.equal(KEY_COMMANDS.KeyZ,'stretch');assert.equal(KEY_COMMANDS.KeyX,'emote-menu');
 assert.equal(KEY_COMMANDS.Digit2,'choice-2');assert.equal(KEY_COMMANDS.KeyE,undefined,'E는 회전 그대로');assert.equal(KEY_COMMANDS.KeyG,undefined);assert.equal(KEY_COMMANDS.KeyK,undefined);
 const ids=Object.values(KEY_COMMANDS);for(const id of ['face-forward','auto','escape','view','sit','tea','map-toggle','help-toggle','hud-toggle','binoculars','phone'])assert.ok(ids.includes(id),id);
 assert.equal(commandFor('KeyJ','phone'),'stamps-toggle');assert.equal(commandFor('KeyY','phone'),'selfie');
});

// ── 컨트롤러(가짜 화면·소리) ──
function fakeUI(){
 const u={pill:null,board:null,book:null,card:null,toasts:[],stamp:null,action:null,markers:[],wheel:false,bino:null,boardOpen:false,bookOpen:false,cardOpen:false,boardPages:0,frame:false};
 Object.assign(u,{setPill:v=>{u.pill=v;},setMarkers:m=>{u.markers=m;},setAction:a=>{u.action=a;},toast:t=>{u.toasts.push(t);},stampToast:m=>{u.stamp=m;},
  openBoard:m=>{u.board=m;u.boardOpen=true;u.boardPages=m.pages.length;},closeBoard:()=>{u.boardOpen=false;u.boardPages=0;},stepBoard:d=>u.boardPages>1,
  openBook:m=>{u.book=m;u.bookOpen=true;},closeBook:()=>{u.bookOpen=false;},openCard:d=>{u.card=d;u.cardOpen=true;},closeCard:()=>{u.cardOpen=false;},
  setBino:m=>{u.bino=m;},showWheel:()=>{u.wheel=true;},hideWheel:()=>{u.wheel=false;},setFrame:on=>{u.frame=on;}});
 return u;
}
function setup(o={}){
 const state={stamina:50,runExhausted:false,pose:'stand',paused:false,auto:false,gadget:'none',elapsed:100,distance:2000,ascent:300,...o.state},ui=fakeUI(),pl={x:0,z:0,heading:0,zone:'route',elevation:200,...o.player};
 const sounds=[],sound={play:n=>sounds.push(n),playAction:n=>sounds.push('action:'+n),cancel:()=>sounds.push('cancel')},storage=memStorage();
 const sites=o.sites??[{id:'spring',kind:'spring',x:0,y:0,z:-2,title:'약수터'},{id:'sign-518',kind:'trailSign',x:3,y:0,z:-60,yaw:0,boards:[{text:'연주대',angle:0},{text:'입구',angle:Math.PI}],contentId:'바위:모자봉'},{id:'stamp-2',kind:'stampBox',x:0,y:0,z:-30,number:2}];
 const c=createInteraction({state,sites,streams:o.streams??[],player:()=>pl,ui,sound,storage,now:()=>Date.UTC(2026,10,4,2,0),courseKm:()=>1340,weather:()=>({kind:'clear',label:'맑음'}),geo:(la,lo)=>geographicToLocal(la,lo,0),projectDir:()=>({x:960,y:540,visible:true}),projectWorld:(x,y,z)=>({x:500+x,y:300,visible:true}),cameraInfo:()=>({fov:65,aspect:16/9,zoom:8}),multi:()=>o.multi??null});
 return {c,state,ui,pl,sounds,storage,tick:(sec,cmd={},speed=0)=>{for(let t=0;t<sec;t+=.1)c.update(.1,{cmd,started:true,speed});}};
}
test('약수 한 모금: 알약이 뜨고 F로 시작해 끝까지 서 있으면 체력 +15, 20초 쿨다운',()=>{
 const t=setup();t.tick(.2);
 assert.equal(t.c.view.rows[0].label,'약수 한 모금');assert.equal(t.c.view.rows[0].key,'F');assert.ok(t.ui.pill.rows[0]);
 assert.equal(t.c.handle('interact'),true);t.tick(1);assert.ok(t.c.action);assert.ok(t.ui.action.progress>0&&t.ui.action.progress<1);
 t.tick(ACTIONS.drink.total);assert.equal(t.c.action,null);assert.equal(t.state.stamina,65);assert.equal(t.c.progress.drinks,1);
 t.tick(.2);assert.equal(t.c.view.rows[0].state,'lock');assert.match(t.c.view.rows[0].reason,/초 뒤에/);
 t.c.handle('interact');assert.equal(t.c.action,null,'쿨다운 중엔 시작 안 함');
});
test('이동하면 행동이 취소되고 효과가 지급되지 않는다(소리 예약도 취소)',()=>{
 const t=setup();t.tick(.2);t.c.handle('interact');t.tick(1);assert.ok(t.c.action);
 t.tick(.2,{forward:1});assert.equal(t.c.action,null);assert.equal(t.state.stamina,50);assert.ok(t.sounds.includes('cancel'));assert.equal(t.ui.action,null);
});
test('알약이 새로 뜰 때 아주 작은 틱 소리(재표시 쿨다운 1.5초)',()=>{
 const t=setup();t.tick(.2);assert.equal(t.sounds.filter(n=>n==='tick').length,1);t.pl.z=-40;t.tick(.2);t.pl.z=0;t.tick(.2);assert.equal(t.sounds.filter(n=>n==='tick').length,1,'1.5초 안에 다시 뜨면 울리지 않음');
});
test('앉으면 알약이 숨고, 달리는 속도(2.2m/s 초과)에서도 숨는다',()=>{
 const t=setup();t.tick(.2);assert.ok(t.c.view);t.state.pose='sit';t.tick(.2);assert.equal(t.c.view,null);t.state.pose='stand';t.tick(.2,{},3);assert.equal(t.c.view,null);t.tick(.2,{},1);assert.ok(t.c.view);
});
test('스트레칭(Z): 어디서나 시작, 끝나면 체력 +10, 이동하면 취소',()=>{
 const t=setup({sites:[]});t.c.handle('stretch');t.tick(1);assert.ok(t.c.action&&t.ui.action.breath);t.tick(ACTIONS.stretch.total);assert.equal(t.state.stamina,60);
 const u=setup({sites:[]});u.c.handle('stretch');u.tick(.5,{side:1});assert.equal(u.state.stamina,50);
});
test('돌 올리기: 문구를 보이고(알약 부제·진행 안내) 효과는 없고 돌 개수만 센다',()=>{
 const t=setup({sites:[{id:'cairn',kind:'cairnField',x:0,y:0,z:-3}]});t.tick(.2);
 assert.match(t.c.view.rows[0].sub,/게임 속 돌이에요\. 실제 산에서는 돌을 옮기지 않아요/);
 t.c.handle('interact');t.tick(1);assert.match(t.ui.action.hint,/실제 산에서는 돌을 옮기지 않아요/);t.tick(ACTIONS.cairn.total);
 assert.equal(t.state.stamina,50);assert.equal(t.c.progress.stones,1);assert.match(t.ui.toasts.at(-1),/오늘 내 돌 1개/);
});
test('돌탑 공터: 스탬프(F) 아래 돌 올리기(숫자 2)가 쌓인다',()=>{
 const t=setup({sites:[{id:'stamp-4',kind:'stampBox',x:0,y:0,z:-5,number:4},{id:'cairn',kind:'cairnField',x:2,y:0,z:-4}]});t.tick(.2);
 assert.deepEqual(t.c.view.rows.map(r=>r.key),['F','2']);assert.match(t.c.view.rows[0].label,/스탬프/);assert.equal(t.c.view.rows[1].label,'돌 올리기');
 t.c.handle('choice-2');t.tick(.5);assert.equal(t.c.action.id,'cairn');
});
test('계곡 손 담그기: 체력 +5, 계곡 지점에서 알약',()=>{
 const t=setup({sites:[],streams:[{id:'stream-1',x:0,z:-2}]});t.tick(.2);assert.equal(t.c.view.rows[0].label,'손 담그기');t.c.handle('interact');t.tick(ACTIONS.dip.total+.5);assert.equal(t.state.stamina,55);
});
test('스탬프: 6m 안에서 F로 한 번만, 저장되고 알림이 뜬다. 6/6이면 알림 대신 완등 카드',async()=>{
 const t=setup();t.pl.z=-26;t.tick(.2);
 assert.equal(t.c.view.rows[0].label,'스탬프 찍기 · 인공폭포');t.c.handle('interact');
 assert.equal(t.ui.stamp.count,1);assert.equal(t.ui.stamp.stamp.glyph,'瀑');assert.ok(JSON.parse(t.storage.getItem(PROGRESS_KEY)).stamps['stamp-2']);
 t.tick(.2);assert.equal(t.c.view.rows[0].state,'done');t.c.handle('interact');assert.match(t.ui.toasts.at(-1),/이미 찍은/);assert.equal(t.c.progress.stamps['stamp-2'].at,Date.UTC(2026,10,4,2,0));
 const p=t.c.progress;for(const s of STAMPS.slice(0,5))addStamp(p,s.id,{at:1,km:s.km,elev:s.elev});
 const f=setup({sites:[{id:'stamp-6',kind:'stampBox',x:0,y:0,z:-3,number:6}]});for(const s of STAMPS.slice(0,5))addStamp(f.c.progress,s.id,{at:1,km:s.km,elev:s.elev});
 f.tick(.2);f.c.handle('interact');assert.equal(f.ui.stamp,null,'6/6이면 알림 없음');await new Promise(r=>setTimeout(r,1000));assert.equal(f.ui.cardOpen,true);assert.equal(f.ui.card.stampText,'6 / 6');assert.ok(f.c.progress.certifiedAt);
});
test('안내판: 이정표는 화살표 행(내 시선 기준)과 바위 쪽, 걸으면 닫힌다. 해설판 문구에 현장 안내판 아님 표시',()=>{
 const t=setup({sites:[{id:'sign-518',kind:'trailSign',x:0,y:0,z:-2,yaw:0,boards:[{text:'연주대',angle:0},{text:'입구',angle:Math.PI}],contentId:'바위:모자봉'}]});t.tick(.2);
 assert.equal(t.c.view.rows[0].label,'이정표 읽기');t.c.handle('interact');assert.equal(t.ui.boardOpen,true);assert.equal(t.ui.board.pages.length,2);
 const rows=t.ui.board.pages[0].rows;assert.equal(rows.length,2);near(Math.abs(rows[0].angle),Math.PI,1e-6,'남쪽 판을 북쪽 보며 보면 아래');assert.equal(t.ui.board.notice,'직접 정리한 설명이며 현장 안내판 글이 아닙니다');
 t.tick(.3,{forward:1});assert.equal(t.ui.boardOpen,false);
 const b=setup({sites:[{id:'board-summit',kind:'summitBoard',x:0,y:0,z:-2,title:'관악산 정상 · 연주대',contentId:'정상석'}]});b.tick(.2);b.c.handle('interact');assert.equal(b.ui.board.pages.map(p=>p.title).join('|'),'정상석 · 629m|연주대');
});
test('F를 다시 누르거나 패널 닫기 명령으로 안내판이 닫히고, Esc 역할(panel-close)이 우선',()=>{
 const t=setup({sites:[{id:'board-valley',kind:'infoBoard',x:0,y:0,z:-2,title:'관악산 계곡',contentId:'계곡'}]});t.tick(.2);t.c.handle('interact');assert.equal(t.c.anyPanel(),true);t.c.handle('panel-close');assert.equal(t.ui.boardOpen,false);
 t.c.handle('interact');t.c.handle('interact');assert.equal(t.ui.boardOpen,false);
});
test('수첩(J)과 이름표(N): 켜고 끈다, 멀티가 있으면 이름표 상태를 함께 넘긴다',()=>{
 const calls=[],multi={setTags:on=>calls.push(on),doGesture:k=>calls.push(k),selfieKey:()=>calls.push('selfie')};
 const t=setup({sites:[],multi});t.c.handle('stamps-toggle');assert.equal(t.ui.bookOpen,true);assert.equal(t.ui.book.count,0);assert.equal(t.ui.book.canCard,false);t.c.handle('stamps-toggle');assert.equal(t.ui.bookOpen,false);
 t.c.handle('labels-toggle');assert.deepEqual(calls,[false]);assert.equal(t.c.tagsOn,false);t.c.handle('labels-toggle');assert.equal(t.c.tagsOn,true);
});
test('인사 메뉴: X를 짧게 누르면 바로 인사, 누르고 있으면 메뉴, 숫자로 고른다(멀티 전용)',()=>{
 const calls=[],multi={setTags:()=>{},doGesture:k=>calls.push(k),selfieKey:()=>calls.push('selfie')};
 const t=setup({sites:[],multi});t.c.handle('emote-menu','down');t.tick(.1);t.c.handle('emote-menu','up');assert.deepEqual(calls,['hello']);
 t.c.handle('emote-menu','down');t.tick(.4);assert.equal(t.c.wheel(),true);assert.equal(t.ui.wheel,true);t.c.handle('choice-2');assert.deepEqual(calls,['hello','wave']);assert.equal(t.ui.wheel,false);
 t.c.handle('emote-menu','down');t.tick(.4);t.c.handle('choice-3');assert.equal(calls.at(-1),'selfie');
 const solo=setup({sites:[]});solo.c.handle('emote-menu','down');solo.c.handle('emote-menu','up');assert.match(solo.ui.toasts.at(-1),/함께 걷기/);
});
test('가까운 사람 4m 안이면 알약 "인사하기"',()=>{
 const calls=[],multi={nearest:r=>({player:{x:0,z:-3,name:'하늘'},distance:3}),doGesture:k=>calls.push(k)};
 const t=setup({sites:[],multi});t.tick(.2);assert.equal(t.c.view.rows[0].label,'인사하기');t.c.handle('interact');assert.deepEqual(calls,['hello']);
});
test('쌍안경: 정상 부근에서 방위 띠·이름표·가운데 맞춤 F, 이름표 끄면 띠만',()=>{
 const o=geographicToLocal(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,0);
 const lm=LANDMARKS.find(l=>l.id==='lm-namsan'),target=initialBearing(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,lm.lat,lm.lon);
 const t=setup({sites:[],state:{gadget:'binoculars'},player:{x:o.x,z:o.z,zone:'summit',elevation:654,heading:bearingToHeading(target)}});
 t.tick(.2);const b=t.ui.bino;assert.ok(b.tape.some(m=>m.short==='N서울타워(남산)'));assert.ok(b.labels.length>=1);assert.equal(b.focus.name,'N서울타워(남산)');
 assert.equal(t.c.view.kind,'bino');t.c.handle('interact');assert.equal(t.ui.boardOpen,true);assert.match(t.ui.board.pages[0].title,/남산/);assert.equal(t.ui.board.notice,'직접 계산한 값이며 현장 안내판 글이 아닙니다');
 t.c.handle('panel-close');t.c.handle('labels-toggle');t.tick(.2);assert.equal(t.ui.bino.labels.length,0);assert.equal(t.ui.bino.focus,null);assert.ok(t.ui.bino.tape.length>0);
 const low=setup({sites:[],state:{gadget:'binoculars'},player:{x:0,z:0,zone:'route',elevation:300}});low.tick(.2);assert.equal(low.ui.bino.labels.length,0);assert.match(low.ui.bino.note,/정상 부근/);
});
test('쌍안경: 인천 쪽은 방향만(점·거리 없음), 안개면 흐림 표시',()=>{
 const o=geographicToLocal(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,0),lm=LANDMARKS.find(l=>l.id==='lm-incheon-bridge'),b=initialBearing(LANDMARK_OBSERVER.lat,LANDMARK_OBSERVER.lon,lm.lat,lm.lon);
 const t=setup({sites:[],state:{gadget:'binoculars'},player:{x:o.x,z:o.z,zone:'summit',elevation:654,heading:bearingToHeading(b)}});t.tick(.2);
 assert.ok(t.ui.bino.tape.find(m=>m.short==='인천대교')?.directionOnly);{const dl=t.ui.bino.labels.filter(l=>l.directionOnly);assert.ok(dl.length>=1&&dl.every(l=>/방향만/.test(l.sub)),'방향만 대상은 거리 대신 "방향만" 표기');assert.ok(t.ui.bino.labels.every(l=>!l.directionOnly||!/km/.test(l.sub)));}assert.match(t.ui.bino.focus.lines.join(' '),/방향만/);
});
test('휴대폰 인증샷 틀: 정상석 6m 안에서만 알약, 켜면 저장 사진에 구워 넣는다',()=>{
 const t=setup({sites:[{id:'stamp-6',kind:'stampBox',x:0,y:0,z:-3,number:6}],state:{gadget:'phone'},player:{zone:'summit',elevation:629}});
 const doc=globalThis.document;globalThis.document={querySelector:()=>({getBoundingClientRect:()=>({left:0,top:0,width:800,height:400})})};
 try{t.tick(.2);assert.equal(t.c.view.kind,'frame');assert.equal(t.c.frameOn,false);t.c.handle('interact');assert.equal(t.c.frameOn,true);t.tick(.2);assert.equal(t.ui.frame,true);
  let drew=0;assert.equal(t.c.bakeFrame({},100,100,()=>{drew++;}),true);assert.equal(drew,1);}finally{globalThis.document=doc;}
 const far=setup({sites:[{id:'stamp-6',kind:'stampBox',x:0,y:0,z:-9,number:6}],state:{gadget:'phone'},player:{zone:'summit'}});far.tick(.2);assert.equal(far.c.view,null);
});
test('구간 이동: reset이 진행 중 행동·패널을 모두 정리한다',()=>{
 const t=setup();t.tick(.2);t.c.handle('interact');t.tick(1);assert.ok(t.c.action);t.c.handle('stamps-toggle');
 t.c.reset();assert.equal(t.c.action,null);assert.equal(t.ui.bookOpen,false);assert.equal(t.c.view,null);
});
test('행동 연출: 약수·손 담그기는 숙이고, 스트레칭은 올려다보며, 가장자리에서 서서히',()=>{
 assert.ok(actionPose('drink',1.5,3.4).pitch<-.2);assert.ok(actionPose('stretch',2,4).pitch>0);near(actionPose('drink',0,3.4).pitch,0,1e-9);assert.equal(actionPose('cairn',3,3).drop+0,0);
});

// ── 정상 소품 피할 반경 ──
test('정상 구역: 소품 피할 반경(collisionRadius+여유+몸)만큼 파고들 수 없고 바깥으로는 나올 수 있다',()=>{
 for(const id of ['stamp-6','board-summit','board-eungjinjeon'])assert.ok(SUMMIT_BLOCKERS[id]>0,id);
 const stamp={id:'stamp-6',x:10,z:10,supportRadius:.25},board={id:'board-summit',x:20,z:10,supportRadius:.8};
 const r=s=>s.supportRadius+SUMMIT_BLOCKERS[s.id]+SUMMIT_BODY;
 assert.equal(facilityBlocks([stamp],{x:10+r(stamp)+.5,z:10},{x:10+r(stamp)-.05,z:10}),'stamp-6');
 assert.equal(facilityBlocks([stamp],{x:10+r(stamp)+.5,z:10},{x:10+r(stamp)+.4,z:10}),null);
 assert.equal(facilityBlocks([board],{x:20+r(board)+.2,z:10},{x:20+r(board)-.1,z:10}),'board-summit');
 assert.equal(facilityBlocks([stamp],{x:10.2,z:10},{x:10.5,z:10}),null,'안쪽에서 바깥으로는 나올 수 있다');
});
