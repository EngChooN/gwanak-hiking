// 즐길거리 효과음(src/trail-sound.js): '소리 꺼짐'이면 하나도 재생하지 않고, 켜짐이면 발소리 마스터로 파일을 낸다. 라디오 18m 거리 감쇠.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrailSound,radioLevel,dbGain,sfxRate} from '../src/trail-sound.js';
import {TRAIL_SFX} from '../src/trail-lines.js';

// 가짜 AudioContext: 만든 노드·재생 호출을 기록한다.
function fakeContext(){
 const log={started:[],stopped:[],connections:[]};
 const param=v=>({value:v,cancelScheduledValues(){},setValueAtTime(x){this.value=x;},linearRampToValueAtTime(x){this.value=x;},setTargetAtTime(x){this.value=x;}});
 const node=kind=>({kind,connect(n){log.connections.push([kind,n.kind]);return n;},disconnect(){}});
 const ctx={state:'running',currentTime:0,log,
  createGain(){return {...node('gain'),gain:param(1)};},
  createBufferSource(){const s={...node('source'),buffer:null,loop:false,playbackRate:param(1),onended:null,start(){log.started.push(s);},stop(){log.stopped.push(s);}};return s;},
  decodeAudioData:async bytes=>({duration:1,bytes})};
 return ctx;
}
const flush=()=>new Promise(r=>setTimeout(r,0));
function setup(on=true){const ctx=fakeContext(),master={kind:'master'},state={on},loads=[];
 const sound=createTrailSound({context:()=>ctx,destination:()=>master,enabled:()=>state.on,base:'B/',load:async url=>{loads.push(url);return url;},random:()=>.5});
 return {ctx,sound,state,loads};}

test('효과음: 표의 14개를 모두 파일로 연결하고 경로는 BASE_URL/sounds/trail/', async()=>{
 const {sound,loads}=setup();sound.sync();await flush();
 const names=Object.keys(TRAIL_SFX);assert.equal(names.length,14);
 for(const n of names.filter(n=>n!=='radio'))assert.ok(loads.includes('B/'+TRAIL_SFX[n].file),n);
 assert.ok(!loads.includes('B/'+TRAIL_SFX.radio.file),'라디오는 산스장 모형을 만들 때 받는다');
 sound.prepareRadio();await flush();assert.ok(loads.includes('B/'+TRAIL_SFX.radio.file));
});
test("효과음: '소리 꺼짐'이면 어떤 소리도 재생을 시작하지 않고 버스 게인은 0", async()=>{
 const {ctx,sound}=setup(false);sound.sync();sound.prepareRadio();await flush();await flush();
 for(const n of Object.keys(TRAIL_SFX))sound.play(n);
 for(let i=0;i<5;i++)sound.radio(2);
 await flush();
 assert.equal(ctx.log.started.length,0);const s=sound.snapshot();assert.equal(s.busGain,0);assert.equal(s.played,0);assert.ok(s.muted>=11);
});
test('효과음: 켜짐이면 파일 소리가 효과음 버스 → 발소리 마스터로 나가고, 끄는 순간 모두 멈춘다', async()=>{
 const {ctx,sound,state}=setup(true);sound.sync();await flush();await flush();
 const v=sound.play('meow');assert.ok(v);assert.equal(ctx.log.started.length,1);
 assert.ok(ctx.log.connections.some(([a,b])=>a==='gain'&&b==='master'),'버스가 마스터에 붙음');
 assert.ok(Math.abs(v.g.gain.value-dbGain(TRAIL_SFX.meow.db))<1e-9);
 assert.ok(v.src.playbackRate.value>=TRAIL_SFX.meow.rate[0]&&v.src.playbackRate.value<=TRAIL_SFX.meow.rate[1]);
 state.on=false;sound.sync();assert.equal(sound.snapshot().busGain,0);assert.ok(ctx.log.stopped.includes(v.src));
 assert.equal(sound.play('caw'),null);assert.equal(ctx.log.started.length,1);
});
test('효과음: 사용자 입력 전(AudioContext 없음)에는 소리를 내지 않는다(아이폰 사파리 제한)', ()=>{
 const sound=createTrailSound({context:()=>null,destination:()=>null,enabled:()=>true,load:async()=>{throw new Error('불림');}});
 assert.equal(sound.play('squeak'),null);assert.equal(sound.radio(1),0);assert.equal(sound.snapshot().locked,1);
});
test('라디오: 18m 안에서만 들리고 가까울수록 크며, 반복 재생하다 멀어지면 멈춘다', async()=>{
 assert.equal(radioLevel(18),0);assert.equal(radioLevel(30),0);assert.equal(radioLevel(null),0);assert.equal(radioLevel(0),1);
 assert.ok(radioLevel(3)>radioLevel(9)&&radioLevel(9)>radioLevel(15)&&radioLevel(15)>0);
 const {ctx,sound}=setup(true);sound.sync();sound.prepareRadio();await flush();await flush();
 assert.equal(sound.radio(25),0);assert.equal(ctx.log.started.length,0);
 sound.radio(5);const src=ctx.log.started.find(s=>s.loop);assert.ok(src,'반복 재생');
 assert.ok(Math.abs(sound.snapshot().radio-dbGain(TRAIL_SFX.radio.db)*radioLevel(5))<1e-4);
 sound.radio(null);assert.ok(ctx.log.stopped.includes(src),'모형을 떼면 멈춤');assert.equal(sound.snapshot().radio,0);
});
test('쥐 뒹굴기 소리: stop은 0.1초 페이드로 그 소리만 멈춘다', async()=>{
 const {ctx,sound}=setup(true);sound.sync();await flush();await flush();
 const roll=sound.play('roll'),meow=sound.play('meow');assert.equal(sound.stop('roll',.1),1);
 assert.ok(ctx.log.stopped.includes(roll.src));assert.ok(!ctx.log.stopped.includes(meow.src));assert.equal(roll.g.gain.value,0);
 assert.equal(sfxRate(null),1);assert.equal(sfxRate([1,2],()=>.5),1.5);
});
test('즐길거리는 자기 AudioContext·합성음을 만들지 않는다(소리 꺼짐을 지나치지 않게)', async()=>{
 const {readFileSync}=await import('node:fs');
 for(const f of ['src/trail-world.js','src/toon/hiker-acts.js']){const t=readFileSync(f,'utf8');
  assert.ok(!/AudioContext|createOscillator|\.destination\b/.test(t),f);}
 const main=readFileSync('src/main.js','utf8');assert.ok(/createTrailSound\(\{context:\(\)=>audio\.context,destination:\(\)=>audio\.master,enabled:\(\)=>audio\.enabled/.test(main),'main이 발소리 마스터를 넘김');
});
