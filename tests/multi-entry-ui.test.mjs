import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statusView,cleanRoom,cleanName,installMultiEntry,DEFAULT_ROOM,NAME_MAX,roomLabel,currentServerId,NAME_KEY} from '../src/multi-entry-ui.js';
import {sanitizeRoom} from '../server/rooms.mjs';

// 함께 걷기 HUD 입구 이벤트 계약(산디자인, 2026-11-08). 연결 쪽(main.js·multi-client.js)과는 window 이벤트로만 만난다.
const STATES=['connecting','online','reconnecting','offline','full'];
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('상태 5가지 + 내 컴퓨터 모드가 모두 칩 모양을 가진다', () => {
 for(const s of STATES){const v=statusView({state:s,room:'관악산-1',count:3,transport:'server'});assert.ok(v&&v.text&&v.ic&&v.tone,s);}
 const local=statusView({state:'online',room:'x',count:2,transport:'local'});
 assert.equal(local.tone,'local');assert.match(local.text,/내 컴퓨터 모드/);
 assert.equal(statusView({state:'online',room:'x',count:3,transport:'server'}).text,'연결됨 · 3명');
 assert.equal(statusView({state:'nope'}),null);assert.equal(statusView(),null);
});
test('꽉 참은 서버 다시 고르기(action other, 방금 꽉 찼어요), 끊김은 다시 시도(retry)', () => {
 const full=statusView({state:'full',room:'a',count:20,transport:'server'});assert.equal(full.action,'other');assert.equal(full.text,'방금 꽉 찼어요');
 assert.equal(statusView({state:'offline',room:'a',count:0,transport:'server'}).action,'retry');
 assert.equal(statusView({state:'reconnecting',room:'a',count:0,transport:'server'}).action,null);
 assert.match(statusView({state:'reconnecting'}).sub,/혼자 걷기/);   // 끊겨도 혼자 걷기는 계속된다는 말
});
test('방 이름: 기본 관악산-1, 서버 규칙(sanitizeRoom)과 같다', () => {
 assert.equal(cleanRoom(''),DEFAULT_ROOM);assert.equal(cleanRoom('  <>  '),DEFAULT_ROOM);
 for(const raw of ['관악산-2','Room 1!','가'.repeat(40),'a_b-c','🙂🙂']){const c=cleanRoom(raw);assert.ok([...c].length<=24);assert.equal(sanitizeRoom(c),c);}
 assert.equal([...cleanRoom('가'.repeat(40))].length,24);
});
test('닉네임은 12자까지, 비우면 빈 글자(연결 쪽이 등산객XXXX를 붙임)', () => {
 assert.equal(cleanName(''),'');assert.equal(cleanName('   '),'');
 assert.equal([...cleanName('가나다라마바사아자차카타파하')].length,NAME_MAX);
 assert.equal(cleanName('  산타   곰 '),'산타 곰');
});
test('DOM이 없으면 설치하지 않고 null (실제 동작은 scripts/capture-multi-entry.mjs로 본다)', () => {
 assert.equal(installMultiEntry({doc:{body:null,getElementById:()=>null,querySelector:()=>null},win:{}}),null);
});
test('칩에는 방 이름 대신 서버 이름(관악산 1서버), 옛 방은 방 이름', () => {
 assert.equal(roomLabel('관악산'),'관악산 1서버');assert.equal(roomLabel('관악산-1'),'관악산 1서버');
 assert.equal(roomLabel('우리끼리'),'방 우리끼리');assert.equal(roomLabel(''),'');
 assert.equal(statusView({state:'online',room:'관악산',count:2,transport:'server'}).sub,'관악산 1서버');
 assert.equal(currentServerId('관악산'),'1');assert.equal(currentServerId('우리끼리'),null);
 assert.equal(NAME_KEY,'gwanak-multi-name');   // 예전 카드에서 쓰던 닉네임 저장값을 그대로 읽는다
});
test('방 이름 칸이 없고 👋 버튼·상태 칩은 서버 고르기 창을 연다, full이면 나가고 창을 다시 띄운다', () => {
 const ui=read('../src/multi-entry-ui.js');
 assert.ok(!/name="room"/.test(ui),'방 이름 입력 칸이 없어야 한다');
 assert.match(ui,/serverPick\?\.open\(\{current:/);
 assert.match(ui,/d\.state==='full'\)\{emit\('hiking:multi-leave'\);openPick\('full'\)/);
});
test('이벤트 이름·모양이 main.js와 multi-client.js의 약속과 같다', () => {
 const ui=read('../src/multi-entry-ui.js'),main=read('../src/main.js'),client=read('../src/multi-client.js');
 for(const name of ['hiking:multi-join','hiking:multi-leave'])assert.ok(ui.includes(`'${name}'`)&&main.includes(`'${name}'`),name);
 assert.ok(ui.includes("'hiking:multi-status'")&&client.includes("'hiking:multi-status'"));
 assert.match(main,/installMultiEntry\?\.\(/);
 const pick=read('../src/hiking-server-pick.js');assert.ok(pick.includes("'hiking:multi-join'")&&pick.includes("'hiking:multi-leave'"));
 assert.match(main,/installMultiEntry\?\.\(\{serverUrl:multiServer,serverPick:hikingServerPick\(\)\}\)/);
 assert.match(main,/window\.__hikingMultiJoin/);   // main.js가 듣기 전에 고른 참가도 처리
 assert.match(client,/detail=\{state:netState,room,count:[^}]*transport:/);
});
test('칩은 44px 이상, 안전 영역을 쓴다(입력·단추 크기는 server-pick.test.mjs)', () => {
 const css=read('../src/multi-entry-ui.css');
 assert.match(css,/\.me-chip\{[^}]*min-height:44px/);
 assert.ok(css.includes('safe-area-inset-bottom')&&css.includes('safe-area-inset-top'));
 assert.match(css,/\.me-chip\{[^}]*z-index:45/);              // multi-toast(40)보다 위
});
