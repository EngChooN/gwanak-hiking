// 서버 주소 고르기(src/server-link.js, 2026-11-11 공개 파일 multi-server.json) + multi:up·공개 파일 도우미
import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseServer,parseServerFile,serverFileUrl,fetchServerFile,rememberedServer,setChoice,currentServer,dropStaleServerParam,SERVER_KEY} from '../src/server-link.js';
import {multiServerUrl} from '../src/multi-transport.js';
import {serverFileBody} from '../scripts/multi-publish.mjs';
import {tunnelUrlIn,wssOf} from '../scripts/multi-up.mjs';

const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
const ON=url=>async()=>({state:'on',url}),OFF=async()=>({state:'off'}),NONE=async()=>null;
const fail=()=>{throw new Error('파일을 받으면 안 됨');};

test('고르는 순서: ?server= → 빌드 변수 → 공개 파일 → 기억한 값', async()=>{
 const st=mem();st.setItem(SERVER_KEY,'wss://old.trycloudflare.com');
 assert.deepEqual(await chooseServer({search:'?server=wss://lan.example:8787',envUrl:'wss://env.example',storage:st,fetchFile:fail}),{server:'wss://lan.example:8787',source:'query'});
 assert.equal(rememberedServer(st),'wss://lan.example:8787','?server=는 기억한다');
 assert.deepEqual(await chooseServer({envUrl:'wss://env.example',storage:st,fetchFile:fail}),{server:'wss://env.example',source:'env'});
 assert.deepEqual(await chooseServer({storage:st,fetchFile:ON('wss://new.trycloudflare.com')}),{server:'wss://new.trycloudflare.com',source:'file'});
 assert.deepEqual(await chooseServer({storage:mem(),fetchFile:NONE}),{server:'',source:'none'});
});
test('공개 파일이 기억한 옛 터널 주소보다 앞서고, 받은 주소를 기억한다', async()=>{
 const st=mem();st.setItem(SERVER_KEY,'wss://old.trycloudflare.com');
 const c=await chooseServer({storage:st,fetchFile:ON('wss://new.trycloudflare.com')});
 assert.equal(c.server,'wss://new.trycloudflare.com');
 assert.equal(rememberedServer(st),'wss://new.trycloudflare.com');
});
test('공개 파일이 꺼짐이면 기억한 옛 주소로 내려가지 않는다', async()=>{
 const st=mem();st.setItem(SERVER_KEY,'wss://old.trycloudflare.com');
 assert.deepEqual(await chooseServer({storage:st,fetchFile:OFF}),{server:'',source:'file-off'});
});
test('공개 파일을 못 받으면(없음·시간 초과) 기억한 값', async()=>{
 const st=mem();st.setItem(SERVER_KEY,'wss://saved.example');
 assert.deepEqual(await chooseServer({storage:st,fetchFile:NONE}),{server:'wss://saved.example',source:'remembered'});
});
test('?server=가 옛 Quick Tunnel 주소면 공개 파일의 켜진 주소를 쓴다(예전에 복사해 보낸 링크)', async()=>{
 const st=mem();
 const c=await chooseServer({search:'?server=wss://old.trycloudflare.com',storage:st,fetchFile:ON('wss://new.trycloudflare.com')});
 assert.deepEqual(c,{server:'wss://new.trycloudflare.com',source:'file',stale:'wss://old.trycloudflare.com'});
 assert.equal(rememberedServer(st),'wss://new.trycloudflare.com');
 // 같은 주소이거나 파일이 꺼짐·없음이면 ?server= 그대로
 assert.equal((await chooseServer({search:'?server=wss://new.trycloudflare.com',storage:mem(),fetchFile:ON('wss://new.trycloudflare.com')})).source,'query');
 assert.equal((await chooseServer({search:'?server=wss://old.trycloudflare.com',storage:mem(),fetchFile:OFF})).source,'query');
 // 터널이 아닌 주소(LAN·직접 연 서버)는 파일을 받지 않는다
 assert.equal((await chooseServer({search:'?server=ws://192.168.0.5:8787',storage:mem(),fetchFile:fail})).source,'query');
});
test('?server=off·local은 기억하지 않고 파일도 받지 않는다', async()=>{
 const st=mem();
 assert.deepEqual(await chooseServer({search:'?server=off',storage:st,fetchFile:fail}),{server:'off',source:'query'});
 assert.equal(st.m.has(SERVER_KEY),false);
});
test('공개 파일 모양 읽기', ()=>{
 assert.deepEqual(parseServerFile({state:'on',url:'wss://a.trycloudflare.com',updated:'x'}),{state:'on',url:'wss://a.trycloudflare.com'});
 assert.deepEqual(parseServerFile({url:'ws://127.0.0.1:8787'}),{state:'on',url:'ws://127.0.0.1:8787'});
 assert.deepEqual(parseServerFile({state:'off',url:''}),{state:'off'});
 assert.deepEqual(parseServerFile({url:''}),{state:'off'});
 assert.equal(parseServerFile({url:'https://a.example'}),null,'ws(s)://만');
 assert.equal(parseServerFile({url:'javascript:alert(1)'}),null);
 assert.equal(parseServerFile(null),null);
 assert.equal(parseServerFile('wss://a'),null);
});
test('공개 파일 주소에 캐시 무력화 쿼리를 붙이고, 못 받으면 null', async()=>{
 assert.equal(serverFileUrl('/ai-office-world/',123),'/ai-office-world/multi-server.json?t=123');
 assert.equal(serverFileUrl('/x',5),'/x/multi-server.json?t=5');
 const seen=[];
 const ok=await fetchServerFile({base:'/ai-office-world/',now:7,fetchImpl:async(u,o)=>{seen.push([u,o.cache]);return {ok:true,json:async()=>({state:'on',url:'wss://z.trycloudflare.com'})};}});
 assert.deepEqual(ok,{state:'on',url:'wss://z.trycloudflare.com'});
 assert.deepEqual(seen,[['/ai-office-world/multi-server.json?t=7','no-store']]);
 assert.equal(await fetchServerFile({fetchImpl:async()=>({ok:false,status:404})}),null);
 assert.equal(await fetchServerFile({fetchImpl:async()=>{throw new TypeError('network');}}),null);
 assert.equal(await fetchServerFile({fetchImpl:async()=>({ok:true,json:async()=>{throw new SyntaxError('html');}})}),null);
 // 시간 초과: 타이머가 abort를 부르면 null
 const r=await fetchServerFile({timeoutMs:1,setTimer:fn=>{fn();return 0;},clearTimer:()=>{},fetchImpl:(_u,{signal})=>new Promise((_,no)=>{if(signal.aborted)no(new Error('abort'));signal.addEventListener('abort',()=>no(new Error('abort')));})});
 assert.equal(r,null);
});
test('multiServerUrl은 ?server=·빌드 변수가 없으면 고른 값을 쓴다', ()=>{
 setChoice({server:'wss://file.trycloudflare.com',source:'file'});
 try{
  assert.equal(currentServer(),'wss://file.trycloudflare.com');
  assert.equal(multiServerUrl('',''),'wss://file.trycloudflare.com/');
  assert.equal(multiServerUrl('','wss://env.example'),'wss://env.example/');
  assert.equal(multiServerUrl('?server=off',''),null);
 }finally{setChoice({server:'',source:'none'});}
 assert.equal(multiServerUrl('',''),null);
});
test('옛 ?server=를 바꿨으면 주소창에서 뺀다(다른 옵션·해시는 그대로)', ()=>{
 let url=null;const hist={state:null,replaceState(_s,_t,u){url=u;}};
 assert.equal(dropStaleServerParam({loc:{pathname:'/ai-office-world/hiking/',search:'?server=wss://old.trycloudflare.com&season=winter',hash:'#a'},hist}),true);
 assert.equal(url,'/ai-office-world/hiking/?season=winter#a');
 assert.equal(dropStaleServerParam({loc:{pathname:'/p/',search:'',hash:''},hist}),false);
});
test('multi:up — 터널 주소 찾기·wss 바꾸기·공개 파일 내용', ()=>{
 const log='2026-11-11T07:00:00Z INF |  https://quiet-river-1234.trycloudflare.com                                  |';
 assert.equal(tunnelUrlIn(log),'https://quiet-river-1234.trycloudflare.com');
 assert.equal(tunnelUrlIn('INF Requesting new quick Tunnel on trycloudflare.com...'),null);
 assert.equal(wssOf('https://a-b.trycloudflare.com'),'wss://a-b.trycloudflare.com');
 const now=new Date('2026-11-11T07:00:00Z');
 const on=JSON.parse(serverFileBody('wss://a.trycloudflare.com',now));
 assert.deepEqual(on,{state:'on',url:'wss://a.trycloudflare.com',updated:'2026-11-11T07:00:00.000Z'});
 assert.deepEqual(parseServerFile(on),{state:'on',url:'wss://a.trycloudflare.com'});
 const off=JSON.parse(serverFileBody('',now));
 assert.equal(off.state,'off');assert.deepEqual(parseServerFile(off),{state:'off'});
 assert.deepEqual(JSON.parse(serverFileBody('off',now)),off);
});
