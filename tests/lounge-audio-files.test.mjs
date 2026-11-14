// 흡연장 녹음 소리 연결(11-13, audio.js): 소리 이름 → 파일 매핑, 못 불러오면 합성으로 대체, 소리 꺼짐, 캔·라이터 타이밍, 버퍼 한 번만.
// 가짜 AudioContext로 어떤 버퍼가 언제 몇 배속으로 시작했는지 기록한다(실제 소리는 브라우저에서 확인).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const bus=new EventTarget();
globalThis.window??=globalThis;
globalThis.addEventListener??=bus.addEventListener.bind(bus);globalThis.removeEventListener??=bus.removeEventListener.bind(bus);globalThis.dispatchEvent??=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
globalThis.performance??={now:()=>Date.now()};

const {LOUNGE_FILES,CAN_SEQ,LIGHTER_LEAD,PITCH_SPREAD,fileCues,burnGain,createLoungeAudio}=await import('../src/lounge/audio.js');
const {DROP}=await import('../src/lounge/spots.js');

// ── 가짜 Web Audio
const param=v=>({value:v,setValueAtTime(x){this.value=x;},linearRampToValueAtTime(x){this.value=x;},exponentialRampToValueAtTime(x){this.value=x;},setTargetAtTime(x){this.value=x;}});
function fakeContext(log){
 const node=extra=>({connect(d){return d;},disconnect(){},...extra});
 return class FakeContext{
  constructor(){this.state='running';this.currentTime=10;this.sampleRate=8000;this.destination=node();log.ctx=this;}
  resume(){this.state='running';}close(){this.state='closed';}
  createGain(){return node({gain:param(1)});}
  createDynamicsCompressor(){return node({threshold:param(0),ratio:param(1)});}
  createBiquadFilter(){return node({type:'',frequency:param(0),Q:param(1)});}
  createStereoPanner(){return node({pan:param(0)});}
  createOscillator(){return node({type:'',frequency:param(0),start(){log.osc++;},stop(){}});}
  createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d,length:n};}
  createBufferSource(){const s=node({buffer:null,loop:false,playbackRate:param(1),start(t=0){if(s.buffer?.file)log.started.push({file:s.buffer.file,t,rate:s.playbackRate.value,loop:s.loop,src:s});},stop(){}});return s;}
  decodeAudioData(bytes){log.decoded++;return Promise.resolve({file:bytes.file,duration:1});}
 };
}
function setup({fail=[],muted=false}={}){
 const log={started:[],osc:0,decoded:0,fetched:[]};
 globalThis.AudioContext=fakeContext(log);
 const load=url=>{log.fetched.push(url);const f=url.split('/').pop();return fail.includes(f)?Promise.reject(new Error('404')):Promise.resolve({file:f});};
 const a=createLoungeAudio({muted,base:'/base/sounds/lounge/',load,random:()=>1});
 return {a,log};
}
const fire=(type,detail)=>dispatchEvent(new CustomEvent(type,{detail}));
const filesOf=log=>log.started.filter(s=>!s.loop).map(s=>s.file);

test('파일 목록이 실제 파일·소리목록 문서와 맞는다',()=>{
 for(const f of Object.values(LOUNGE_FILES))assert.ok(existsSync(new URL(`../public/sounds/lounge/${f}`,import.meta.url)),f);
 const doc=readFileSync(new URL('../docs/흡연장/소리목록-2026-11-13.md',import.meta.url),'utf8');
 for(const f of Object.values(LOUNGE_FILES))assert.ok(doc.includes(f),`문서에 ${f}`);
});

test('매핑: 라이터 open→strike, 들숨, quality별 날숨, 캔 button→drop→open',()=>{
 assert.deepEqual(fileCues('lighter').map(c=>c[0]),['lighter-open','lighter-strike']);
 assert.deepEqual(fileCues('inhale').map(c=>c[0]),['inhale']);
 assert.equal(fileCues('exhale','light')[0][0],'exhale-short');
 assert.equal(fileCues('exhale','sweet')[0][0],'exhale-mid');
 assert.equal(fileCues('exhale','deep')[0][0],'exhale-long');
 assert.equal(fileCues('exhale',null)[0][0],'exhale-short','quality 모르면 짧게');
 assert.deepEqual(fileCues('can').map(c=>c[0]),['vending-button','can-drop','can-open']);
 for(const n of ['ash','cough','ring','stamp','chat','drop'])assert.equal(fileCues(n),null,`${n}은 합성 그대로`);
 for(const n of ['lighter','inhale','can'])for(const [f,,g] of fileCues(n))assert.ok(f in LOUNGE_FILES&&g>0&&g<=1,f);
});

test('타이밍: 캔 덜컹은 캔이 닿는 순간, 따기는 손에 온 뒤 / 라이터 화는 불꽃 순간',async()=>{
 const land=DROP.fall*.75; // spots.js holdCan: k=.75에서 바닥에 닿음
 assert.ok(Math.abs(CAN_SEQ.drop-land)<.08,`덜컹 ${CAN_SEQ.drop} vs 닿음 ${land}`);
 assert.ok(CAN_SEQ.open>=DROP.fall+DROP.wait+DROP.fly,'캔을 손에 쥔 뒤 딴다');
 const strike=fileCues('lighter')[1][1];
 assert.ok(Math.abs(strike+.12-LIGHTER_LEAD)<.03,'strike 파일의 화(.12초)가 LIGHTER_LEAD에 온다');
 const {FLAME_AT}=await import('../src/lounge/smoke.js');
 assert.ok(FLAME_AT-LIGHTER_LEAD>.25,'라이터를 올리기 시작한(.25) 뒤에 소리를 부른다');
});

test('담배 타는 지직 크기는 draw로 커지고, 안 들이마시면 0',()=>{
 assert.equal(burnGain(0),0);assert.equal(burnGain(.01),0);
 assert.ok(burnGain(.2)<burnGain(.6)&&burnGain(.6)<burnGain(1)&&burnGain(1)<=.15);
});

test('unlock 뒤 BASE_URL 기준으로 한 번만 불러오고, 다 불러오면 파일로 재생한다',async()=>{
 const {a,log}=setup();
 assert.equal(a.play('lighter'),false,'입력 전엔 소리 없음');assert.equal(log.fetched.length,0,'입력 전엔 불러오지 않음');
 a.unlock();a.unlock();await a.ready();
 assert.equal(log.fetched.length,Object.keys(LOUNGE_FILES).length,'파일마다 한 번만');
 assert.ok(log.fetched.every(u=>u.startsWith('/base/sounds/lounge/')));
 assert.equal(log.decoded,Object.keys(LOUNGE_FILES).length,'버퍼도 한 번만');
 assert.equal(a.status().files.loaded,10);
 const before=log.osc;
 assert.equal(a.play('lighter'),true);
 assert.deepEqual(filesOf(log),['lighter-open.mp3','lighter-strike.mp3']);
 const [o,s]=log.started.filter(x=>!x.loop);assert.ok(Math.abs(s.t-o.t-.2)<1e-9,'뚜껑 .2초 뒤 휠');
 assert.equal(log.osc,before,'파일일 때는 합성 안 함');
 fire('lounge:spot',{spot:'vending',state:'use'});
 const can=log.started.slice(-3);assert.deepEqual(can.map(x=>x.file),['vending-button.mp3','can-drop.mp3','can-open.mp3']);
 assert.ok(Math.abs(can[1].t-can[0].t-CAN_SEQ.drop)<1e-9&&Math.abs(can[2].t-can[0].t-CAN_SEQ.open)<1e-9);
 a.play('exhale',{quality:'deep'});assert.equal(log.started.at(-1).file,'exhale-long.mp3');
 const st=a.status();assert.equal(st.file,3);assert.equal(st.synth,0);assert.equal(st.played,3);
 a.dispose();
});

test('같은 소리를 다시 내면 음높이를 ±3% 안에서 바꾼다',async()=>{
 const {a,log}=setup();a.unlock();await a.ready();
 a.play('inhale');a.play('inhale');
 const [r1,r2]=log.started.filter(x=>x.file==='inhale.mp3').map(x=>x.rate);
 assert.equal(r1,1);assert.ok(r2!==1&&Math.abs(r2-1)<=PITCH_SPREAD+1e-9,`두 번째 ${r2}`);
 a.dispose();
});

test('불러오기 전·실패하면 합성 소리로 대체하고 횟수를 센다',async()=>{
 const {a,log}=setup({fail:['can-drop.mp3']});a.unlock();
 assert.equal(a.play('lighter'),true,'불러오기 전');assert.equal(a.status().synth,1);assert.ok(log.osc>0,'합성 소리');
 await a.ready();
 assert.match(a.status().files.errors[0],/can-drop\.mp3/);
 fire('lounge:spot',{spot:'vending',state:'use'});
 assert.ok(!filesOf(log).includes('vending-button.mp3'),'캔 묶음 중 하나라도 없으면 합성 캔 소리');
 assert.equal(a.status().synth,2);
 a.play('lighter');assert.equal(a.status().file,1,'다른 소리는 파일');
 a.dispose();
});

test('소리 꺼짐이면 파일·합성 모두 0건, 지직도 0',async()=>{
 const {a,log}=setup({muted:true});a.unlock();await a.ready();
 for(const n of ['lighter','inhale','exhale','can','cough'])assert.equal(a.play(n),false);
 fire('lounge:spot',{spot:'vending',state:'use'});
 a.update(.1,{draw:1});
 const st=a.status();assert.equal(st.played,0);assert.equal(st.file+st.synth,0);assert.equal(st.files.burn,0);
 assert.equal(filesOf(log).length,0);
 a.setMuted(false);a.update(.1,{draw:1});assert.ok(a.status().files.burn>0,'켜면 지직');
 a.setMuted(true);a.update(.1,{draw:1});assert.equal(a.status().files.burn,0);
 a.dispose();
});

test('지직은 cig-burn 반복 하나를 draw로 키우고 줄인다',async()=>{
 const {a,log}=setup();a.unlock();await a.ready();
 const loops=log.started.filter(x=>x.loop);assert.equal(loops.length,1);assert.equal(loops[0].file,'cig-burn.flac');
 a.update(.1,{draw:0});assert.equal(a.status().files.burn,0);
 a.update(.1,{draw:.8});assert.equal(a.status().files.burn,+burnGain(.8).toFixed(3));
 a.update(.1,{draw:0});assert.equal(a.status().files.burn,0);
 assert.equal(log.started.filter(x=>x.loop).length,1,'반복 소스는 하나뿐');
 a.dispose();
});

test('NPC 소리는 거리로 줄고, 멀면 건너뛴다',async()=>{
 const {a,log}=setup();a.unlock();await a.ready();
 a.update(.1,{player:{x:0,z:0,heading:0}});
 assert.equal(a.play('exhale',{at:{x:20,z:0},quality:'sweet'}),false,'반경 밖');
 assert.equal(a.play('exhale',{at:{x:3,z:0},quality:'sweet'}),true);assert.equal(log.started.at(-1).file,'exhale-mid.mp3');
 a.dispose();
});
