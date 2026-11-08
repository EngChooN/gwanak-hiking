import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanText,pushLog,chatRow,limitText,installHikingChat,QUICK,LOG_MAX,TEXT_MAX,BUBBLE_MS,LIMIT_TEXT} from '../src/hiking-chat-ui.js';

// 등산 채팅 HUD 이벤트 계약(산디자인, 2026-11-08). 연결 쪽(multi-client.js)과는 window 이벤트로만 만난다.
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('글 정리: 제어·방향 문자 제거, 공백 정리, 80자 자르기', () => {
 assert.equal(cleanText('  안녕 \n\t하세요 '),'안녕 하세요');
 assert.equal(cleanText('a‮b\u0007c'),'abc');
 assert.equal([...cleanText('가'.repeat(200))].length,TEXT_MAX);
 assert.equal(cleanText(null),'');
});
test('기록은 최근 30줄만 남는다', () => {
 let l=[];for(let i=0;i<45;i++)l=pushLog(l,{text:String(i)});
 assert.equal(l.length,LOG_MAX);assert.equal(l[0].text,'15');assert.equal(l.at(-1).text,'44');
});
test('받은 채팅 → 기록 줄: 이름이 비면 등산객, 글이 비면 버림, me 표시', () => {
 assert.deepEqual(chatRow({id:'a',name:'다라',text:'안녕',me:true,remote:true}),{id:'a',name:'다라',text:'안녕',me:true});
 assert.equal(chatRow({id:'a',name:'',text:'x'}).name,'등산객');
 assert.equal(chatRow({id:'a',text:'   '}),null);assert.equal(chatRow(null),null);
});
test('빠른 말 칩은 4~6개, 안내 문구', () => {
 assert.ok(QUICK.length>=4&&QUICK.length<=6);assert.ok(QUICK.every(t=>[...t].length<=TEXT_MAX));
 assert.equal(limitText('rate'),'잠깐만요, 조금 천천히');assert.equal(limitText('offline'),LIMIT_TEXT.offline);assert.equal(limitText('?'),'잠깐만요, 조금 천천히');
 assert.equal(BUBBLE_MS,4000);
});
test('설치 함수는 DOM 없이 부르면 null(node 시험에서 안전)', () => {
 assert.equal(installHikingChat({doc:{body:null},win:{}}),null);
});
test('연결 규약: 이벤트 이름이 multi-client와 같다', () => {
 const ui=read('../src/hiking-chat-ui.js'),mc=read('../src/multi-client.js');
 for(const ev of ['hiking:chat-send','hiking:chat','hiking:chat-limit','hiking:multi-status','hiking:multi-leave'])assert.ok(ui.includes(`'${ev}'`),ev);
 for(const ev of ['hiking:chat-send','hiking:chat','hiking:chat-limit'])assert.ok(mc.includes(`'${ev}'`),ev);
 assert.match(mc,/screenPos/);assert.match(ui,/screenPos/);
});
test('입력 중 단축키 막기·visualViewport·16px 입력·44px', () => {
 const ui=read('../src/hiking-chat-ui.js'),css=read('../src/hiking-chat-ui.css');
 assert.match(ui,/stopPropagation/);assert.match(ui,/visualViewport/);
 assert.match(css,/\.hc-form input\{[^}]*font:700 16px/);
 for(const sel of ['.hc-btn','.hc-x','.hc-chip','.hc-send'])assert.match(css,new RegExp(`\\${sel}\\{[^}]*(height|min-height):44px`),sel);
 assert.match(css,/\.hc-form input\{[^}]*min-height:44px/);
});
test('일시정지 없음·낮노을밤 토큰·main.js가 불러옴', () => {
 const ui=read('../src/hiking-chat-ui.js'),css=read('../src/hiking-chat-ui.css'),main=read('../src/main.js');
 assert.doesNotMatch(ui+css,/일시정지|계속하기/);
 assert.match(css,/var\(--paper/);assert.match(css,/var\(--bub/);
 assert.match(main,/hiking-chat-ui\.js/);
});
