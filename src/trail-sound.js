// 즐길거리 효과음(2026-11-06): src/trail-lines.js의 TRAIL_SFX 표대로 public/sounds/trail/ 파일을 재생한다.
// 발소리·환경음과 같은 AudioContext와 마스터 게인(FootstepAudio.master = 사용자 음량)을 거친다. 자기 버스 게인은 '소리 꺼짐'이면 0이고,
// 꺼진 동안에는 재생을 시작하지도 않는다(stats.muted로 센다). AudioContext는 만들지 않는다: 사용자 터치·키 입력 때 main.js가 만든 것만 쓰므로
// 아이폰 사파리의 '사용자 입력 뒤에만 소리' 제한을 그대로 따른다(입력 전에는 stats.locked).
// 라디오(산스장 18m 안)는 반복 재생, 가까울수록 크게(radioLevel), 18m 밖·산스장 모형을 떼면 멈춘다.
import {TRAIL_SFX} from './trail-lines.js';

export const dbGain=db=>10**(db/20);
// 라디오 크기: 0m = 1, near(18m) 이상 = 0. 제곱으로 줄여 가까이 가야 또렷하다.
export function radioLevel(distance,near=TRAIL_SFX.radio.near){if(!Number.isFinite(distance)||distance>=near)return 0;const k=1-Math.max(0,distance)/near;return k*k;}
// 재생 속도 흔들기(같은 소리 반복이 덜 기계적)
export const sfxRate=(range,random=Math.random)=>range?range[0]+random()*(range[1]-range[0]):1;
const fetchBytes=url=>fetch(url).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.arrayBuffer();});

export function createTrailSound({context=()=>null,destination=()=>null,enabled=()=>true,base='sounds/trail/',load=fetchBytes,random=Math.random}={}){
 let ctx=null,bus=null,on=null,radioVoice=null;
 const buffers=new Map(),pending=new Map(),voices=new Set();
 const stats={played:0,muted:0,locked:0,late:0,errors:[],byName:{}};
 // 같은 마스터에 버스를 한 번 붙인다(마스터는 사용자가 첫 입력을 한 뒤에 생긴다).
 function ready(){const c=context(),dest=destination();if(!c||!dest)return null;
  if(c!==ctx){ctx=c;bus=c.createGain();on=!!enabled();bus.gain.value=on?1:0;bus.connect(dest);preload();}return c;} // 붙는 순간 짧은 소리들을 받아 둔다
 // 켜기/끄기 동기화: 끄면 버스를 0으로 내리고 재생 중 소리를 모두 멈춘다.
 function sync(){if(!ready())return;const want=!!enabled();if(want===on)return;on=want;const t=ctx.currentTime;bus.gain.cancelScheduledValues(t);if(want)bus.gain.setTargetAtTime(1,t,.02);else{bus.gain.setValueAtTime(0,t);bus.gain.value=0;stopAll(.05);radioVoice=null;}} // 끌 때는 바로 0
 function fetchBuffer(name){const e=TRAIL_SFX[name];if(!e||!ready())return null;if(buffers.has(name))return Promise.resolve(buffers.get(name));
  if(!pending.has(name))pending.set(name,load(base+e.file).then(bytes=>ctx.decodeAudioData(bytes)).then(b=>{buffers.set(name,b);return b;},err=>{stats.errors.push(`${e.file}: ${err?.message??err}`);return null;}));
  return pending.get(name);}
 // 한 번에 받아 둘 것(라디오 제외, 모두 합쳐 약 0.8MB). 라디오는 산스장 모형을 만들 때 prepareRadio().
 const preload=()=>{for(const n of Object.keys(TRAIL_SFX))if(n!=='radio')fetchBuffer(n);};
 function start(name,buffer,{gain=1,loop=false}={}){const e=TRAIL_SFX[name],src=ctx.createBufferSource(),g=ctx.createGain();
  src.buffer=buffer;src.loop=loop;src.playbackRate.value=sfxRate(e.rate,random);g.gain.value=dbGain(e.db)*gain;src.connect(g).connect(bus);
  const v={name,src,g};voices.add(v);src.onended=()=>{voices.delete(v);src.disconnect();g.disconnect();if(radioVoice===v)radioVoice=null;};
  src.start();stats.played++;stats.byName[name]=(stats.byName[name]??0)+1;return v;}
 // 한 번 재생. 아직 못 받았으면 받는 대로 0.4초 안이면 낸다(늦으면 건너뜀).
 function play(name,opts={}){if(!TRAIL_SFX[name])return null;sync();
  if(!enabled()){stats.muted++;return null;}
  const c=ready();if(!c||c.state!=='running'){stats.locked++;return null;}
  const b=buffers.get(name);if(b)return start(name,b,opts);
  const asked=c.currentTime;fetchBuffer(name)?.then(buf=>{if(!buf)return;if(!enabled()||c.state!=='running'||c.currentTime-asked>.4){stats.late++;return;}start(name,buf,opts);});return null;}
 function stop(name,fade=.1){if(!ctx)return 0;const t=ctx.currentTime;let n=0;
  for(const v of voices)if(v.name===name&&!v.stopping){v.stopping=true;n++;v.g.gain.cancelScheduledValues(t);v.g.gain.setValueAtTime(v.g.gain.value,t);v.g.gain.linearRampToValueAtTime(0,t+fade);try{v.src.stop(t+fade+.02);}catch{}}
  if(name==='radio')radioVoice=null;return n;}
 function stopAll(fade=.1){for(const n of new Set([...voices].map(v=>v.name)))stop(n,fade);}
 // 라디오: 매 프레임 산스장까지 거리(m, 모형이 없으면 null)를 넘긴다.
 function radio(distance){sync();const level=distance==null?0:radioLevel(distance);
  if(level<=0||!enabled()){if(radioVoice)stop('radio',.4);return 0;}
  const c=ready();if(!c||c.state!=='running')return 0;
  const target=dbGain(TRAIL_SFX.radio.db)*level;
  if(!radioVoice){const b=buffers.get('radio');if(!b){fetchBuffer('radio');return 0;}radioVoice=start('radio',b,{loop:true,gain:0});}
  const g=radioVoice.g.gain;g.cancelScheduledValues(c.currentTime);g.setTargetAtTime(target,c.currentTime,.25);return level;}
 const prepareRadio=()=>fetchBuffer('radio');
 function snapshot(){return {enabled:!!enabled(),on,context:ctx?.state??'입력 대기',busGain:bus?+bus.gain.value.toFixed(4):null,playing:[...voices].filter(v=>!v.stopping).map(v=>v.name),
  radio:radioVoice?+radioVoice.g.gain.value.toFixed(4):0,loaded:[...buffers.keys()],...stats,errors:[...stats.errors],byName:{...stats.byName}};}
 return {play,stop,stopAll,radio,prepareRadio,preload,sync,snapshot,dispose(){stopAll(.05);bus?.disconnect();}};
}
