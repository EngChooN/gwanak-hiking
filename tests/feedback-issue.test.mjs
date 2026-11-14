// 의견 보내기(공용 src/feedback.js): GitHub 이슈 주소·라벨·제목, 개인정보 제외, 길이 자르기, 등산·흡연장 연결
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIssueUrl,buildIssueTitle,buildIssueBody,buildIssueLabels,buildIssueText,collectInfo,cleanPath,browserName,MAX_BODY,REPO_URL,KINDS} from '../src/feedback.js';

const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const fakeWin=(over={})=>({
 location:{pathname:'/smoking/',search:'?multi=옥상-1&name=철수&time=dusk&server=wss://example.test'},
 navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
 innerWidth:390,innerHeight:844,devicePixelRatio:3,matchMedia:q=>({matches:q==='(pointer:coarse)'}),...over});
const parse=url=>{const u=new URL(url);return {u,title:u.searchParams.get('title'),body:u.searchParams.get('body'),labels:u.searchParams.get('labels')};};

test('주소는 ai-office-world 저장소의 새 이슈 페이지이고 title·body·labels를 미리 채운다',()=>{
 const url=buildIssueUrl({exp:'smoking',kind:'bug',text:'담배가 안 켜져요',info:[['체험','smoking']]});
 const {u,title,body,labels}=parse(url);
 assert.equal(`${u.origin}${u.pathname}`,'https://github.com/EngChooN/ai-office-world/issues/new');
 assert.equal(REPO_URL,'https://github.com/EngChooN/ai-office-world');
 assert.deepEqual([...u.searchParams.keys()],['title','body','labels']);
 assert.equal(title,'[흡연장] 🐞 담배가 안 켜져요');
 assert.equal(labels,'feedback,bug,smoking');
 assert.match(body,/담배가 안 켜져요/);
 assert.match(body,/- 체험: smoking/);
});

test('라벨: feedback + 종류(bug·idea, 한마디는 없음) + 체험',()=>{
 assert.deepEqual(buildIssueLabels({exp:'hiking',kind:'bug'}),['feedback','bug','hiking']);
 assert.deepEqual(buildIssueLabels({exp:'hiking',kind:'idea'}),['feedback','idea','hiking']);
 assert.deepEqual(buildIssueLabels({exp:'smoking',kind:'talk'}),['feedback','smoking']);
 assert.deepEqual(buildIssueLabels({exp:'모름',kind:'모름'}),['feedback','hiking'],'모르는 값은 기본(등산·한마디)');
 assert.deepEqual(Object.keys(KINDS),['bug','idea','talk']);
});

test('제목 형식: [체험] 아이콘 내용 앞 40자(넘으면 …), 줄바꿈은 한 칸, 비면 종류 이름',()=>{
 assert.equal(buildIssueTitle({exp:'hiking',kind:'idea',text:'정상에서\n\n사진   찍기'}),'[등산] 💡 정상에서 사진 찍기');
 const long='가'.repeat(60);
 assert.equal(buildIssueTitle({exp:'smoking',kind:'talk',text:long}),`[흡연장] 💬 ${'가'.repeat(40)}…`);
 assert.equal(buildIssueTitle({exp:'smoking',kind:'talk',text:'가'.repeat(40)}),`[흡연장] 💬 ${'가'.repeat(40)}`);
 assert.equal(buildIssueTitle({exp:'hiking',kind:'bug',text:'  '}),'[등산] 🐞 고장·이상해요');
 // 이모지는 반으로 잘리지 않는다
 assert.equal(buildIssueTitle({exp:'hiking',kind:'talk',text:'😀'.repeat(41)}),`[등산] 💬 ${'😀'.repeat(40)}…`);
});

test('붙는 정보: 경로에서 name·multi(닉네임·방 이름)를 지우고 화면·기기·방향·브라우저·빌드·시각을 넣는다',()=>{
 const rows=collectInfo({exp:'smoking',win:fakeWin(),now:Date.UTC(2026,10,8,6,30)});
 const m=Object.fromEntries(rows);
 assert.deepEqual(Object.keys(m),['체험','주소','화면','기기','브라우저','빌드','시각']);
 assert.equal(m['체험'],'smoking');
 assert.equal(m['주소'],'/smoking/?time=dusk&server=wss%3A%2F%2Fexample.test');
 assert.equal(m['화면'],'390×844 @3x');
 assert.equal(m['기기'],'휴대폰 · 세로');
 assert.equal(m['브라우저'],'Safari · iPhone');
 assert.equal(m['빌드'],'개발','노드에서는 빌드 날짜 대신 「개발」');
 assert.equal(m['시각'],'2026-11-08 15:30 (서울)');
 const pc=Object.fromEntries(collectInfo({win:fakeWin({innerWidth:1920,innerHeight:1080,navigator:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'},matchMedia:()=>({matches:false})})}));
 assert.equal(pc['기기'],'PC · 가로');assert.equal(pc['브라우저'],'Chrome · Mac');
 assert.equal(cleanPath('/hiking/','?name=a&multi=b'),'/hiking/');
 assert.equal(browserName('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36'),'삼성 인터넷 · Android');
});

test('체험 상태는 선택: 있으면 붙고, 닉네임·채팅·방 이름·위치 같은 이름은 들어가지 않는다',()=>{
 const state=()=>({시간대:'노을',날씨:'맑음',닉네임:'철수',nickname:'철수',name:'철수',채팅:'안녕 비밀',chat:'안녕 비밀',방:'옥상-1',위치:'1,2',ip:'1.2.3.4'});
 const rows=collectInfo({exp:'hiking',win:fakeWin({location:{pathname:'/hiking/',search:'?multi=관악산-1&name=철수'}}),state});
 const m=Object.fromEntries(rows);
 assert.equal(m['시간대'],'노을');assert.equal(m['날씨'],'맑음');
 const url=buildIssueUrl({exp:'hiking',kind:'bug',text:'멈췄어요',info:rows});
 const all=decodeURIComponent(url)+buildIssueText({exp:'hiking',kind:'bug',text:'멈췄어요',info:rows});
 for(const bad of ['철수','안녕 비밀','옥상-1','관악산-1','1.2.3.4','name=','multi='])assert.ok(!all.includes(bad),`${bad}가 들어가면 안 됨`);
 // 상태 함수가 터져도 카드는 열린다
 assert.doesNotThrow(()=>collectInfo({win:fakeWin(),state:()=>{throw new Error('x');}}));
});

test('본문은 6000자 안: 내용이 길면 내용만 자르고 정보는 남긴다, 주소도 그만큼만 길어진다',()=>{
 const info=[['체험','hiking'],['빌드','2026-11-08']];
 const body=buildIssueBody({kind:'bug',text:'가'.repeat(9000),info});
 assert.ok(body.length<=MAX_BODY,`본문 ${body.length}자`);
 assert.equal(MAX_BODY,6000);
 assert.match(body,/…\(잘림\)/);
 assert.match(body,/- 빌드: 2026-11-08/);
 const short=buildIssueBody({kind:'bug',text:'짧아요',info});
 assert.ok(!short.includes('잘림'));
 const {body:b2}=parse(buildIssueUrl({exp:'hiking',kind:'bug',text:'나'.repeat(9000),info}));
 assert.ok(b2.length<=MAX_BODY);
 // 정보가 지나치게 많아도 6000자를 넘지 않는다
 assert.ok(buildIssueBody({text:'x',info:Array.from({length:500},(_,i)=>[`k${i}`,'v'.repeat(30)])}).length<=MAX_BODY);
});

test('복사 글 = 제목 + 본문(올리기 주소와 같은 내용)',()=>{
 const o={exp:'smoking',kind:'idea',text:'재떨이 하나 더',info:[['체험','smoking']]};
 const t=buildIssueText(o),{title,body}=parse(buildIssueUrl(o));
 assert.equal(t,`${title}\n\n${body}`);
});

test('연결: 공용 모듈 한 벌, 등산 설정 시트·흡연장 설정 창·「상황」 패널, 사용자 클릭 때만 새 탭(noopener)',()=>{
 const fb=read('src/feedback.js');
 assert.match(fb,/win\.open\(url,'_blank','noopener'\)/);
 assert.equal((fb.match(/win\.open\(/g)||[]).length,1,'window.open은 올리기 단추 한 곳에서만');
 assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(fb),'게임이 몰래 보내지 않는다');
 assert.match(fb,/clipboard\.writeText/);assert.match(fb,/fb-fallback/);assert.match(fb,/\.select\(\)/);
 assert.match(fb,/addEventListener\('keydown',onKey,true\)/,'열린 동안 키를 잡기 단계에서 막는다');
 const nb=read('src/hud-notebook.js');
 assert.match(nb,/installFeedback\(\{exp:'hiking',openEvent:'hiking:feedback-open'/);
 assert.match(nb,/💌<\/em><span>의견 보내기/);
 assert.match(nb,/dispatchEvent\(new CustomEvent\('hiking:feedback-open'\)\)/,'등산은 이벤트로 연다');
 const hud=read('src/lounge/hud.js'),sp=read('src/lounge/spots.js');
 assert.match(hud,/installFeedback\(\{exp:'smoking',openEvent:'lounge:feedback-open'/);
 assert.match(hud,/data-a="feedback">💌 의견 보내기/);
 assert.match(sp,/data-sp="feedback">💌 의견 보내기/);
 assert.match(read('src/input.js'),/read:\(\)=>feedbackOpen\(\)\?\{forward:0,side:0/,'등산 조이스틱·키 이동 멈춤');
 assert.match(read('src/lounge/input.js'),/if\(feedbackOpen\(\)\)return \{forward:0,side:0/,'흡연장 조이스틱·키 이동 멈춤');
 // CSS는 한 벌(사본 금지), 새 색 없이 토큰만
 const css=read('src/feedback.css');
 assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css.replace(/#fff\b/gi,'')),'흰 글자 말고는 새 색 없음');
});
