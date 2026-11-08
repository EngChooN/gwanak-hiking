// 산 고르기 첫 화면 닉네임 칸(2026-11-08, 대표 추가 지시). 저장값은 서버 고르기 창과 같은 NAME_KEY 'gwanak-multi-name'.
// mountain-pick.js는 CSS를 불러와 node에서 import할 수 없어 소스·CSS를 읽어 보고, 저장·미리 채우기는 server-pick.js로 본다.
// 화면 흐름(단축키 막기·키보드·세 화면 크기)은 scripts/capture-mountain-nick.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServerPick,loadPickName,savePickName,NAME_KEY,PICK_LABELS} from '../src/server-pick.js';
import {NET} from '../src/multi-protocol.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const memStore=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};};

test('저장값 읽기·쓰기: 같은 키, 12자로 자르고 공백 정리, 저장소가 막혀도 멈추지 않음',()=>{
 assert.equal(NAME_KEY,'gwanak-multi-name');assert.equal(NET.nameMax,12);
 const st=memStore();
 assert.equal(savePickName('  산  타는 곰  ',st),'산 타는 곰');assert.equal(st.map.get(NAME_KEY),'산 타는 곰');
 assert.equal(loadPickName(st),'산 타는 곰');
 assert.equal([...savePickName('가나다라마바사아자차카타파하',st)].length,12);
 assert.equal(savePickName('',st),'');assert.equal(st.map.get(NAME_KEY),'','비운 것도 저장(→ 서버가 등산객XXXX)');
 const broken={getItem(){throw new Error('막힘');},setItem(){throw new Error('막힘');}};
 assert.equal(loadPickName(broken),'');assert.equal(savePickName('곰',broken),'곰');
 assert.equal(loadPickName(memStore()),'');
});
test('산 고르기에서 넣은 이름이 서버 고르기 창에 미리 채워지고, 혼자 걷기를 골라도 남는다',async()=>{
 const st=memStore();let joined=null,solo=null;
 const p=createServerPick({experience:'hiking',serverUrl:null,storage:st,doc:null,onJoin:d=>{joined=d;},onSolo:d=>{solo=d;}});
 savePickName('바위다람쥐',st);            // 창을 만든 뒤에 산 고르기에서 이름을 바꿈
 await p.open({closable:false});assert.equal(p.state.name,'바위다람쥐','열 때 저장값을 다시 읽음');
 p.solo();assert.deepEqual(solo,{left:false});assert.equal(st.map.get(NAME_KEY),'바위다람쥐','혼자 걷기도 저장');
 savePickName('산타는곰',st);               // 나중에 👋 함께 걷기로 들어갈 때
 await p.open({closable:true});p.join('1');assert.equal(joined.name,'산타는곰');
 savePickName('',st);await p.open();assert.equal(p.state.name,'','비우면 빈 이름 → 서버가 등산객XXXX');
 p.close();
});
test('흡연장: 저장값이 비어 있으면 로비 닉네임(기본값)을 그대로 쓴다',async()=>{
 const st=memStore({[NAME_KEY]:''});
 const q=createServerPick({experience:'smoking',serverUrl:null,storage:st,doc:null,defaultName:'옥상고양이'});
 await q.open();assert.equal(q.state.name,'옥상고양이');q.close();
});
test('산 고르기 소스: 닉네임 칸·저장·단축키 막기·키보드 대응·출발할 때 저장',()=>{
 const s=read('../src/mountain-pick.js');
 assert.match(s,/import \{loadPickName,savePickName,PICK_LABELS\} from '\.\/server-pick\.js'/);
 assert.match(s,/maxlength="\$\{NET\.nameMax\}"/);assert.match(s,/placeholder="\$\{esc\(PICK_LABELS\.hiking\.anon\)\}"/);
 assert.equal(PICK_LABELS.hiking.anon,'등산객XXXX');
 assert.match(s,/nickFieldHTML\(loadPickName\(\)\)/,'다시 들어오면 마지막 이름');
 assert.match(s,/for\(const ev of \['keydown','keyup','keypress'\]\)[^\n]*e\.stopPropagation\(\)/,'입력 중 단축키 막기');
 assert.match(s,/addEventListener\('input',\(\)=>\{savePickName\(input\.value,storage\)/,'치는 대로 저장');
 assert.match(s,/visualViewport/);assert.match(s,/scrollIntoView\(\{block:'center'/);assert.match(s,/classList\.add\('pk-typing'\)/);
 const go=s.slice(s.indexOf('function go(){'),s.indexOf('root.addEventListener(\'click\''));
 assert.ok(go.indexOf('savePickName(nick.value)')>=0&&go.indexOf('savePickName(nick.value)')<go.indexOf('hikingServerPick()'),'서버 창을 열기 전에 저장');
});
test('산 고르기 모양: 수첩 토큰, 칸 44px 이상·16px(iOS 확대 방지), 키보드 동안 스크롤',()=>{
 const css=read('../src/free-settings.css');
 assert.match(css,/\.pk-nick input\{[^}]*min-height:44px[^}]*font:800 16px/);
 assert.match(css,/\.pk-nick\{[^}]*background:var\(--paper\)[^}]*color:var\(--ink\)/);
 assert.match(css,/#mountain-pick\.pk-typing\{overflow:auto;padding-bottom:calc\(var\(--sb,0px\) \+ var\(--kb,0px\)/);
 assert.match(css,/max-height:540px\)\{[^]*\.pk-nick\{width:auto/,'가로 휴대폰 왼쪽 열에 맞춤');
});
test('서버 고르기 창: 고치는 대로 같은 저장값에, 열 때 저장값 다시 읽기',()=>{
 const s=read('../src/server-pick.js');
 assert.match(s,/input\.addEventListener\('input',\(\)=>\{name=savePickName\(input\.value,storage\);\}\)/);
 assert.match(s,/name=loadPickName\(storage\)\|\|cleanPickName\(defaultName\)/);
});
