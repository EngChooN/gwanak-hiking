// 서버 주소를 늘 주소에 붙이기(src/server-link.js, 2026-11-08)
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveServerParam,pinServerParam,withServer,rememberedServer,SERVER_KEY} from '../src/server-link.js';

const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
const fakeLoc=(search,pathname='/gwanak-hiking/hiking/',hash='')=>({search,pathname,hash});
const fakeHist=()=>({state:null,url:null,replaceState(s,_t,u){this.url=u;}});

test('?server=가 있으면 기억하고 주소는 그대로', ()=>{
 const st=mem();
 assert.deepEqual(resolveServerParam('?server=wss://a.trycloudflare.com',{storage:st}),{server:'wss://a.trycloudflare.com',add:false});
 assert.equal(rememberedServer(st),'wss://a.trycloudflare.com');
});
test('?server=off는 기억하지 않는다', ()=>{
 const st=mem();resolveServerParam('?server=off',{storage:st});
 assert.equal(st.m.has(SERVER_KEY),false);
});
test('?server=가 없으면 빌드 변수 → 기억한 값 순으로 주소창에 붙인다', ()=>{
 const st=mem();st.setItem(SERVER_KEY,'wss://saved.example');
 const h1=fakeHist();
 assert.equal(pinServerParam({loc:fakeLoc('?multi=관악산-1','/gwanak-hiking/hiking/','#x'),hist:h1,storage:st}),'wss://saved.example');
 assert.equal(h1.url,'/gwanak-hiking/hiking/?multi=%EA%B4%80%EC%95%85%EC%82%B0-1&server=wss://saved.example#x');
 const h2=fakeHist();
 pinServerParam({loc:fakeLoc(''),hist:h2,storage:st,envUrl:'wss://env.example'});
 assert.equal(h2.url,'/gwanak-hiking/hiking/?server=wss://env.example');
});
test('붙일 서버가 없으면 주소를 바꾸지 않는다', ()=>{
 const h=fakeHist();
 assert.equal(pinServerParam({loc:fakeLoc(''),hist:h,storage:mem()}),'');
 assert.equal(h.url,null);
});
test('허브 카드 주소에 서버를 붙인다', ()=>{
 assert.equal(withServer('/gwanak-hiking/smoking/','wss://a.example'),'/gwanak-hiking/smoking/?server=wss://a.example');
 assert.equal(withServer('/x/?pick=on','wss://a.example'),'/x/?pick=on&server=wss://a.example');
 assert.equal(withServer('/x/?server=wss://b','wss://a.example'),'/x/?server=wss://b');
 assert.equal(withServer('/x/',''),'/x/');
});
