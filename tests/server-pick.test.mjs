// 서버 고르기 창(src/server-pick.js, 2026-11-08) 단위 시험. 화면 없이(doc 없음) 상태·콜백·5초 갱신을 보고,
// 실제 서버(정원 2)의 /health를 읽어 인원·꽉 참이 맞는지 본다. 화면 모양은 scripts/verify-server-pick.mjs(두 브라우저·세 화면 크기).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SERVERS,SERVER_MAX,findServer,serverRoomName} from '../src/multi-protocol.js';
import {healthUrl,serverPickMode,pickRows,pickTotals,rowLabel,createServerPick,cleanPickName,NAME_KEY,REFRESH_MS,PICK_LABELS} from '../src/server-pick.js';
import {startServer} from '../server/multi-server.mjs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const memStore=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};};
// 가짜 타이머: run()으로 걸린 것 하나씩 실행
function fakeTimers(){const q=new Map();let n=0;return {set:(fn,ms)=>{q.set(++n,{fn,ms});return n;},clear:id=>q.delete(id),
 get pending(){return [...q.values()];},async runRefresh(){const e=[...q.entries()].find(([,v])=>v.ms===REFRESH_MS);if(!e)return false;q.delete(e[0]);await e[1].fn();return true;}};}
const HEALTH=(h=3,s=1,max=20)=>({ok:true,total:h+s,servers:{hiking:[{id:'1',name:'관악산 1서버',count:h,max}],smoking:[{id:'1',name:'옥상 1서버',count:s,max}]}});
const okFetch=body=>{const calls=[];const f=async(url)=>{calls.push(url);const b=typeof body==='function'?body():body;return {ok:true,status:200,json:async()=>b};};f.calls=calls;return f;};

test('서버 목록 표: 체험마다 1서버, 정원 20, 서버 쪽 방 이름은 기존 규칙(끝 -1 뗌)',()=>{
 assert.deepEqual(SERVERS.hiking,[{id:'1',name:'관악산 1서버',room:'관악산-1'}]);
 assert.deepEqual(SERVERS.smoking,[{id:'1',name:'옥상 1서버',room:'옥상-1'}]);
 assert.equal(SERVER_MAX,20);assert.ok(Object.isFrozen(SERVERS.hiking));
 assert.equal(serverRoomName('관악산-1'),'관악산');assert.equal(serverRoomName('관악산-2'),'관악산-2');
 for(const r of ['관악산-1','관악산','관악산-3'])assert.equal(findServer('hiking',r)?.id,'1',r);
 assert.equal(findServer('hiking','옥상-1'),null,'체험이 다르면 없음');assert.equal(findServer('smoking','옥상')?.name,'옥상 1서버');
 assert.equal(findServer('hiking','우리끼리'),null);assert.equal(findServer('hiking',''),null);
});
test('/health 주소: ws→http, wss→https, 경로·쿼리는 /health로',()=>{
 assert.equal(healthUrl('ws://127.0.0.1:8787/'),'http://127.0.0.1:8787/health');
 assert.equal(healthUrl('wss://abc.trycloudflare.com'),'https://abc.trycloudflare.com/health');
 assert.equal(healthUrl('wss://x.fly.dev/ws?a=1#b'),'https://x.fly.dev/health');
 assert.equal(healthUrl(null),null);assert.equal(healthUrl('nope'),null);
});
test('창을 띄울지: 옛 주소 ?multi=는 건너뛰고 바로 1서버, 점검 스크립트는 건너뜀(?serverpick=on으로 켬)',()=>{
 assert.equal(serverPickMode('',false),'show');
 assert.equal(serverPickMode('?multi=관악산-1',false),'legacy');assert.equal(serverPickMode('?multi=옥상-1&serverpick=on',true),'legacy');
 assert.equal(serverPickMode('',true),'skip');assert.equal(serverPickMode('?serverpick=on',true),'show');
 assert.equal(serverPickMode('?serverpick=off',false),'skip');assert.equal(serverPickMode('?server=off',false),'show');
});
test('서버 줄: n / 20명, 꽉 차면 full, 인원을 모르면 null',()=>{
 assert.deepEqual(pickRows('hiking',HEALTH(3)),[{id:'1',name:'관악산 1서버',room:'관악산-1',count:3,max:20,full:false}]);
 assert.equal(pickRows('hiking',HEALTH(20))[0].full,true);assert.equal(pickRows('hiking',HEALTH(2,0,2))[0].full,true,'정원은 서버가 준 max');
 assert.equal(pickRows('hiking',null)[0].count,null);assert.equal(pickRows('hiking',{servers:{hiking:[]}})[0].count,0,'서버가 줄을 안 주면 0명');
 assert.deepEqual(rowLabel(pickRows('hiking',HEALTH(3))[0]),{n:'3 / 20명',tag:'',state:'open'});
 assert.deepEqual(rowLabel(pickRows('hiking',HEALTH(20))[0]),{n:'20 / 20명',tag:'꽉 참',state:'full'});
 assert.equal(rowLabel(pickRows('hiking',HEALTH(3))[0],{current:'1'}).tag,'지금 여기');
 assert.equal(rowLabel(pickRows('hiking',null)[0],{local:true}).state,'local');
 assert.equal(rowLabel(pickRows('hiking',null)[0]).state,'wait');
});
test('합계: 지금 접속 = 이 체험 서버 합, 전체 = /health total(없으면 모든 체험 합)',()=>{
 assert.deepEqual(pickTotals('hiking',HEALTH(3,5)),{here:3,total:8});
 assert.deepEqual(pickTotals('smoking',HEALTH(3,5)),{here:5,total:8});
 const noTotal=HEALTH(4,6);delete noTotal.total;assert.deepEqual(pickTotals('hiking',noTotal),{here:4,total:10});
 assert.deepEqual(pickTotals('hiking',null),{here:null,total:null});
});
test('닉네임: 12자, 저장값(gwanak-multi-name)을 다시 쓰고 고를 때 저장, 없으면 기본값(흡연장 로비 닉네임)',async()=>{
 assert.equal([...cleanPickName('가나다라마바사아자차카타파하')].length,12);assert.equal(cleanPickName('  산  타 '),'산 타');
 const st=memStore({[NAME_KEY]:'산타는곰'});let joined=null;
 const p=createServerPick({experience:'hiking',serverUrl:null,storage:st,doc:null,onJoin:d=>{joined=d;}});
 await p.open();assert.equal(p.state.name,'산타는곰');
 p.join('1');assert.deepEqual(joined,{server:'1',room:'관악산-1',name:'산타는곰',serverName:'관악산 1서버'});
 const q=createServerPick({experience:'smoking',serverUrl:null,storage:memStore(),doc:null,defaultName:'옥상고양이'});assert.equal(q.state.name,'옥상고양이');
 assert.equal(PICK_LABELS.smoking.solo,'혼자 피우기');assert.equal(PICK_LABELS.hiking.solo,'혼자 걷기');
});
test('서버 주소 없음: /health를 받지 않고(화면은 연결할 수 없어요 카드 + 혼자 하기만) 상태는 local',async()=>{
 const f=okFetch(HEALTH());const p=createServerPick({experience:'hiking',serverUrl:null,fetchImpl:f,doc:null,storage:memStore()});
 await p.open();assert.equal(p.state.net,'local');assert.equal(f.calls.length,0);assert.equal(p.state.rows[0].count,null);
});
test('공개 파일이 꺼짐이면 서버 카드에 \'서버가 꺼져 있어요\'(등산·흡연장 모두 serverOff를 넘김)',()=>{
 const sp=read('../src/server-pick.js');
 assert.match(sp,/serverOff\?'서버가 꺼져 있어요':'서버 주소가 없어요'/);assert.match(sp,/지금은 서버가 꺼져 있어요/);
 for(const f of ['../src/hiking-server-pick.js','../src/lounge/multi-ui.js'])assert.match(read(f),/serverOff:currentChoice\(\)\.source==='file-off'/,f);
});
test('서버 모드: 열면 /health를 받고 5초마다 다시, 닫으면 멈춘다',async()=>{
 let n=3;const f=okFetch(()=>HEALTH(n++));const tm=fakeTimers();
 const p=createServerPick({experience:'hiking',serverUrl:'wss://srv.example/',fetchImpl:f,doc:null,storage:memStore(),setTimer:tm.set,clearTimer:tm.clear});
 await p.open();assert.equal(f.calls[0],'https://srv.example/health');assert.equal(p.state.net,'ok');assert.equal(p.state.rows[0].count,3);assert.deepEqual(p.state.totals,{here:3,total:4});
 assert.ok(tm.pending.some(t=>t.ms===REFRESH_MS),'5초 뒤 다시 받기 예약');
 await tm.runRefresh();assert.equal(p.state.rows[0].count,4);assert.equal(f.calls.length,2);
 p.close();assert.equal(p.isOpen,false);assert.equal(await tm.runRefresh(),false,'닫으면 예약이 없다');
});
test('서버에 연결이 안 되면 error: 혼자 걷기만(줄은 인원 모름)',async()=>{
 const tm=fakeTimers();const bad=async()=>{throw new Error('ECONNREFUSED');};
 const p=createServerPick({experience:'hiking',serverUrl:'ws://127.0.0.1:9/',fetchImpl:bad,doc:null,storage:memStore(),setTimer:tm.set,clearTimer:tm.clear});
 await p.open();assert.equal(p.state.net,'error');assert.equal(p.state.rows[0].count,null);
 const p2=createServerPick({experience:'hiking',serverUrl:'ws://x/',fetchImpl:async()=>({ok:false,status:502,json:async()=>({})}),doc:null,storage:memStore(),setTimer:tm.set,clearTimer:tm.clear});
 await p2.open();assert.equal(p2.state.net,'error','HTTP 오류도 연결 안 됨');
 const p3=createServerPick({experience:'hiking',serverUrl:'ws://x/',fetchImpl:okFetch({ok:true,rooms:0}),doc:null,storage:memStore(),setTimer:tm.set,clearTimer:tm.clear});
 await p3.open();assert.equal(p3.state.net,'error','servers가 없는 옛 서버는 고를 수 없음');
});
test('들어간 뒤 다시 열기: 지금 서버 표시, 혼자 단추는 나가기(left:true), full 알림',async()=>{
 const solos=[];const p=createServerPick({experience:'smoking',serverUrl:null,doc:null,storage:memStore(),onSolo:d=>solos.push(d)});
 await p.open({current:'1',closable:true});assert.equal(p.state.current,'1');assert.equal(p.state.closable,true);
 p.solo();assert.deepEqual(solos,[{left:true}]);assert.equal(p.isOpen,false);
 await p.open({note:'full'});assert.equal(p.state.note,'full');assert.equal(p.state.closable,false,'첫 창(현재 서버 없음)은 고를 때까지 닫지 않는다');
 p.solo();assert.deepEqual(solos[1],{left:false});
});
test('실제 서버(정원 2): 창이 읽는 /health로 인원과 꽉 참이 맞다',async()=>{
 const s=startServer({PORT:'0',HOST:'127.0.0.1',DATA_DIR:mkdtempSync(join(tmpdir(),'sp-test-')),MAX_PER_ROOM:'2'},{quiet:true});const port=await s.ready,url=`ws://127.0.0.1:${port}/`;
 const socks=[];const hello=(room,exp)=>new Promise(ok=>{const w=new WebSocket(url);socks.push(w);w.onmessage=e=>ok(JSON.parse(e.data));w.onopen=()=>w.send(JSON.stringify({t:'hello',exp,room,name:''}));});
 try{
  const p=createServerPick({experience:'hiking',serverUrl:url,doc:null,storage:memStore()});
  await p.open();assert.deepEqual(p.state.rows[0],{id:'1',name:'관악산 1서버',room:'관악산-1',count:0,max:2,full:false});
  assert.equal((await hello('관악산-1','hiking')).t,'welcome');await p.refresh();assert.equal(p.state.rows[0].count,1);
  assert.equal((await hello('관악산-1','hiking')).t,'welcome');assert.equal((await hello('옥상-1','smoking')).t,'welcome');
  await p.refresh();assert.equal(p.state.rows[0].full,true);assert.deepEqual(p.state.totals,{here:2,total:3});
  assert.deepEqual(await hello('관악산-1','hiking'),{t:'full',reason:'full'},'3번째는 꽉 참');
  p.close();
 }finally{for(const w of socks)try{w.close();}catch{}await s.close();}
});
test('모양: 줄·단추·닫기 44px 이상, 입력 16px(iOS 확대 방지), 안전 영역, 가로 휴대폰 두 칸',()=>{
 const css=read('../src/server-pick.css');
 assert.match(css,/\.sp-row\{[^}]*min-height:92px/);assert.match(css,/\.sp-go\{[^}]*min-height:44px/);assert.match(css,/data-mode=entry\]\{[^}]*background:var\(--paper2/); // 서버 카드(허브 카드 모양)·입장 전 불투명 전체 화면
 assert.match(css,/\.sp-solo\{[^}]*min-height:48px/);
 assert.match(css,/\.sp-x\{[^}]*width:44px;height:44px/);assert.match(css,/\.sp-name input\{[^}]*min-height:44px[^}]*font:700 16px/);
 for(const side of ['top','right','bottom','left'])assert.ok(css.includes(`safe-area-inset-${side}`),side);
 assert.match(css,/orientation:landscape\) and \(max-height:540px\)\{[^]*grid-template-areas/);
 for(const t of ['--paper','--ink','--stamp','--go','--low'])assert.ok(css.includes(`var(${t}`),t); // 수첩 토큰(낮·노을·밤)을 따른다
});
test('연결: 등산은 산 고르기 다음·HUD 👋, 흡연장은 👥 단추·로딩 뒤, 옛 주소는 건너뜀',()=>{
 const pick=read('../src/mountain-pick.js'),hp=read('../src/hiking-server-pick.js'),lui=read('../src/lounge/multi-ui.js'),lmain=read('../src/lounge/main.js');
 assert.match(pick,/hikingPickMode\(\)==='show'\)serverReady\.then\(\(\)=>hikingServerPick\(\)\.open\(\{closable:false\}\)\)/); // 서버 주소(공개 파일)를 고른 뒤 연다
 assert.match(lmain,/await serverReady;\nconst multi=createLoungeMulti/);
 assert.match(hp,/experience:'hiking'/);assert.match(hp,/__hikingMultiJoin=detail/);
 assert.match(lui,/createServerPick\(\{experience:'smoking'/);assert.ok(!/name="room"/.test(lui),'흡연장 방 이름 칸 없음');
 assert.match(lmain,/serverPickMode\(location\.search,!!navigator\.webdriver\)/);assert.match(lmain,/multiUi\.open\(\{closable:false\}\)/);
});
test('입장 카드: 서버마다 카드 하나(그림·이름·n/정원·꽉 참), 입장 전은 entry 모드, 게임 안·full 거절은 카드 화면 복귀',()=>{
 const src=read('../src/server-pick.js');
 assert.match(src,/ART\[L\.art\]/);assert.match(src,/class="sp-go"/);assert.match(src,/data-mode/);
 assert.match(src,/!current&&\(!closable\|\|note==='full'\)\?'entry':'switch'/);
 const lmain=read('../src/lounge/main.js');
 assert.ok(!/afterIntro\(\(\)=>\{if\(!multi\.joined\)multiUi\.open/.test(lmain),'흡연장은 로비 카드보다 먼저 서버 카드');
});
