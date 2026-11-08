// 관악산 FM 소리(Web Audio). 잡음은 파일 없이 만들고(분홍 잡음 2초 반복 + 필터 + 가끔 찌직), 방송은 같은 출처 assets/radio/ 파일을 <audio>로 흘려 받아
// MediaElementSource로 섞는다(긴 곡을 통째로 풀지 않아 휴대폰 메모리를 아낀다). 섞는 공식은 src/radio-stations.js mixAt(radio-design §3-2).
// AudioContext는 만들지 않는다: 발소리·환경음과 같은 context·마스터(main.js가 사용자 입력 때 만든 것)를 쓰고, '소리 꺼짐'이면 버스가 0이다.
// 전원을 끄면 0.2초 뒤 모든 노드를 떼고 <audio>의 src를 비워 연결·메모리를 돌려준다. 외부 주소에는 접속하지 않는다.
import {mixAt,FM_CHANNELS} from './radio-stations.js';
import {playlistAt,natureLayers,pickGuideLine,captionSeconds} from './radio-tracks.js';

export const RADIO_MAX=.7;      // 라디오 버스 최대(발소리 마스터의 약 70%)
const TAU=.03;                   // 음량 바꾸기 시간 상수(약 0.08초 안에 따라감)
const clamp01=v=>Math.max(0,Math.min(1,v));

// 분홍 잡음 버퍼(Paul Kellet 방식)
export function pinkNoise(ctx,seconds=2){
 const n=Math.floor(ctx.sampleRate*seconds),buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);
 let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
 for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;}
 return buf;
}

// 파일 여러 개를 차례로, 끝나기 xfade초 전에 다음 파일과 겹쳐 이어 트는 재생기(<audio> 둘을 번갈아 씀).
// files = [{url,duration}], start = {index,offset}. 상태는 onState('loading'|'playing'|'error', 지금 곡 index)로 알린다.
function createDeck(ctx,out,files,{start={index:0,offset:0},xfade=1.5,level=1,onState=()=>{},doc=document}={}){
 const els=[0,1].map(()=>{const el=doc.createElement('audio');el.preload='auto';el.playsInline=true;el.setAttribute('playsinline','');const src=ctx.createMediaElementSource(el),g=ctx.createGain();g.gain.value=0;src.connect(g).connect(out);return {el,src,g,index:-1};});
 let cur=0,idx=start.index%files.length,stopped=false,timer=0,state='loading',errors=0;
 const set=s=>{if(s!==state){state=s;onState(s,idx);}};
 function play(slot,i,offset=0,fadeIn=.3){
  const s=els[slot];s.index=i;s.el.src=files[i].url;
  const t=ctx.currentTime;s.g.gain.cancelScheduledValues(t);s.g.gain.setValueAtTime(0,t);
  const go=()=>{if(stopped)return;try{if(offset>0&&offset<(s.el.duration||files[i].duration)-1)s.el.currentTime=offset;}catch{}
   s.el.play().then(()=>{if(stopped)return;const t2=ctx.currentTime;s.g.gain.setTargetAtTime(level,t2,fadeIn/3);},()=>fail());};
  if(s.el.readyState>=1)go();else s.el.addEventListener('loadedmetadata',go,{once:true});
  s.el.onplaying=()=>{if(slot===cur){errors=0;set('playing');}};
  s.el.onerror=()=>fail();
  // 겹치기 전에 끝나 버리면(길이를 잘못 읽은 파일 등) 바로 다음 파일로
  s.el.onended=()=>{if(!stopped&&slot===cur)advance(.3);};
 }
 function advance(fade){
  const s=els[cur],next=1-cur;idx=(idx+1)%files.length;play(next,idx,0,fade);
  const t=ctx.currentTime;s.g.gain.cancelScheduledValues(t);s.g.gain.setTargetAtTime(0,t,fade/3);
  const old=s;setTimeout(()=>{if(!stopped&&old!==els[cur]){old.el.pause();}},fade*1000+400);
  cur=next;
 }
 // 못 받으면 다음 파일로 넘어가 보고, 모두 실패하면 'error'(화면: 방송이 끊겼어요, 소리: 잡음만)
 function fail(){if(stopped)return;errors++;if(errors>=files.length){set('error');return;}idx=(idx+1)%files.length;cur=1-cur;play(cur,idx,0);}
 function step(){
  // 길이는 manifest 값을 먼저 쓴다(헤더가 틀린 MP3는 브라우저가 길이를 잘못 읽음: healing.mp3 실제 378초를 크롬은 520초로 봄)
  if(stopped)return;const s=els[cur],d=files[s.index]?.duration||s.el.duration||0;
  // 다음 파일을 다른 쪽에서 틀고, 지금 것은 xfade초 동안 줄인다
  if(state==='playing'&&d&&s.el.currentTime>=d-xfade&&!s.el.paused)advance(xfade);
 }
 play(cur,idx,start.offset);timer=setInterval(step,200);
 return {
  get state(){return state;},get index(){return els[cur].index;},
  // 시험용: 지금 곡을 끝 몇 초 앞으로 옮겨 이어지는 곳을 듣는다
  seekNearEnd(sec=4){const s=els[cur],d=files[s.index].duration||s.el.duration;try{s.el.currentTime=Math.max(0,d-sec);}catch{}},
  current:()=>({index:els[cur].index,time:els[cur].el.currentTime,duration:els[cur].el.duration,paused:els[cur].el.paused}),
  stop(){stopped=true;clearInterval(timer);for(const s of els){try{s.el.pause();}catch{}s.el.removeAttribute('src');try{s.el.load();}catch{}try{s.g.disconnect();s.src.disconnect();}catch{}}}
 };
}

export function createRadioAudio({context=()=>null,destination=()=>null,enabled=()=>true,base='/',manifest=()=>null,onStatus=()=>{},doc=document,now=()=>Date.now(),guideState=()=>({})}={}){
 let ctx=null,nodes=null,on=false,freq=91.9,vol=.6,deck=null,deckId=null,deckState=null,trackIndex=-1,caption=null,guideTimer=0,guideHistory=[],crackleTimer=0,lastMix=null,soundOn=null;
 const status=()=>({on,freq,vol,deck:deckId,deckState,trackIndex,caption,mix:lastMix,sound:soundOn});
 const emit=()=>onStatus(status());
 function build(){
  const c=context(),dest=destination();if(!c||!dest)return false;
  ctx=c;const bus=c.createGain();soundOn=!!enabled();bus.gain.value=0;bus.connect(dest);
  const noiseSrc=c.createBufferSource();noiseSrc.buffer=pinkNoise(c);noiseSrc.loop=true;
  const hp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=280;const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3800;
  const noise=c.createGain();noise.gain.value=0;noiseSrc.connect(hp).connect(lp).connect(noise).connect(bus);noiseSrc.start();
  const bcLow=c.createBiquadFilter();bcLow.type='lowpass';bcLow.frequency.value=6000;const bc=c.createGain();bc.gain.value=0;bcLow.connect(bc).connect(bus);
  const fx=c.createGain();fx.gain.value=.5;fx.connect(bus);
  // 측정용 탭(시험·진단): 버스 뒤 소리 크기. 출력은 어디에도 잇지 않는다
  const tap=c.createAnalyser();tap.fftSize=2048;bus.connect(tap);
  nodes={bus,noiseSrc,noise,bcLow,bc,fx,tap};
  bus.gain.setTargetAtTime(soundOn?RADIO_MAX:0,c.currentTime,.1); // 켜는 순간 0.3초 페이드인
  crackle();
  return true;
 }
 // 짧은 소리(딸깍·틱·찌직)는 파일 없이 만든다
 function blip({f=1800,dur=.03,gain=.25,type='square',noise=false}={}){
  if(!ctx||!nodes)return;const t=ctx.currentTime,g=ctx.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);g.connect(nodes.fx);
  if(noise){const s=ctx.createBufferSource(),n=Math.floor(ctx.sampleRate*dur),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);s.buffer=b;s.connect(g);s.start(t);return;}
  const o=ctx.createOscillator();o.type=type;o.frequency.value=f;o.connect(g);o.start(t);o.stop(t+dur+.02);
 }
 const click=()=>blip({f:900,dur:.05,gain:.35,type:'square'});
 const tick=()=>blip({f:2600,dur:.012,gain:.05,type:'square'});
 // 가끔 찌직: 잡음이 들리는 만큼만
 function crackle(){clearTimeout(crackleTimer);if(!nodes)return;if(lastMix&&lastMix.noise>.05&&Math.random()<.6)blip({dur:.02+Math.random()*.04,gain:.12*lastMix.noise/.33,noise:true});crackleTimer=setTimeout(crackle,300+Math.random()*1400);}
 // 채널 재생기 만들기·떼기(전원이 켜져 있고 또렷함 > 0인 채널만 불러온다)
 function files(list){return list.map(t=>({url:`${base}assets/radio/${t.file}`,duration:t.duration}));}
 function startDeck(id){
  stopDeck();const m=manifest();if(!m||!nodes)return;deckId=id;deckState='loading';trackIndex=-1;
  const chm=m.channels?.[id];if(!chm){deckState='error';emit();return;}
  // 받기가 끝나면(loading → playing) 방송 음량을 다시 계산한다. 예전에는 emit만 해서 볼륨을 한 번 건드려야 소리가 났다(11-08 대표 제보)
  const onState=(s,i)=>{deckState=s;trackIndex=i;if(deckId===id)apply();else emit();};
  if(id==='calm'){const tracks=chm.tracks??[];if(!tracks.length){deckState='error';emit();return;}
   const at=playlistAt(tracks,now()/1000);deck=createDeck(ctx,nodes.bcLow,files(tracks),{start:at,xfade:chm.crossfade??1.5,onState,doc});}
  else if(id==='nature'){const layers=natureLayers(chm.tracks??[]);if(!layers.length){deckState='error';emit();return;}
   const t=now()/1000,decks=layers.map((ly,k)=>createDeck(ctx,nodes.bcLow,files(ly),{start:playlistAt(ly,t+k*37),xfade:chm.crossfade??3,level:k?.7:1,onState:k?()=>{}:onState,doc}));
   deck={get state(){return decks[0].state;},stop(){decks.forEach(d=>d.stop());},seekNearEnd(s){decks.forEach(d=>d.seekNearEnd(s));},current:()=>decks.map(d=>d.current()),layers:decks};}
  else if(id==='guide'){primeSpeech();deck=createGuide(chm);}
  emit();
 }
 // 95.5 목소리: 녹음 파일이 없으면 기기에 깔린 한국어 목소리(speechSynthesis)로 읽는다.
 // 외부 접속 금지(AGENTS.md §5): 기기 안에서 만드는 목소리(localService)만 쓴다. 크롬의 'Google 한국의' 같은 온라인 목소리는 쓰지 않는다.
 // 없으면 예전처럼 자막만. 아이폰은 사용자 입력 안에서 한 번 말해 둬야 나중에 타이머로 말할 수 있어서 다이얼을 맞출 때 빈 말을 한 번 한다.
 const speech=()=>globalThis.speechSynthesis??null;
 const koVoice=()=>{try{return speech()?.getVoices().find(v=>/^ko/i.test(v.lang)&&v.localService)??null;}catch{return null;}};
 let primed=false;
 function primeSpeech(){const s=speech();if(primed||!s||!globalThis.SpeechSynthesisUtterance)return;primed=true;try{s.getVoices();const u=new SpeechSynthesisUtterance(' ');u.volume=0;s.speak(u);}catch{}}
 function speak(text){
  const s=speech(),v=koVoice();if(!s||!v||!soundOn)return false;
  try{s.cancel();const u=new SpeechSynthesisUtterance(text);u.voice=v;u.lang=v.lang;u.rate=.95;
   // 또렷한 만큼(다이얼이 덜 맞으면 작게) × 라디오 볼륨
   u.volume=clamp01((lastMix?.broadcast??vol)*1.4);s.speak(u);return true;}catch{return false;}
 }
 const hush=()=>{try{speech()?.cancel();}catch{}};
 function stopDeck(){deck?.stop();deck=null;deckId=null;deckState=null;trackIndex=-1;caption=null;clearTimeout(guideTimer);}
 // 95.5: 녹음 파일이 있으면 그 파일, 없으면 자막 + 낮은 톤(배경). 멘트 사이 40~60초, 처음 맞추면 0.8초 뒤.
 function createGuide(chm){
  const bed=ctx.createGain();bed.gain.value=0;bed.connect(nodes.bcLow);
  const oscs=[110,164.8,220].map((f,i)=>{const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;const g=ctx.createGain();g.gain.value=[.5,.28,.12][i];o.connect(g).connect(bed);o.start();return o;});
  const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=.12;lg.gain.value=.035;lfo.connect(lg).connect(bed.gain);lfo.start();
  bed.gain.setTargetAtTime(.07,ctx.currentTime,.4);
  let voice=null,stopped=false;deckState='playing';
  const jingle=()=>{[523.3,659.3,784].forEach((f,i)=>setTimeout(()=>blip({f,dur:.35,gain:.12,type:'triangle'}),i*170));};
  function next(delay){clearTimeout(guideTimer);guideTimer=setTimeout(say,delay*1000);}
  function say(){
   if(stopped)return;const id=pickGuideLine(guideState(),guideHistory);guideHistory.push(id);if(guideHistory.length>10)guideHistory.shift();
   const line=(chm.lines??[]).find(l=>l.id===id)??(chm.lines??[])[0];if(!line)return;
   jingle();const secs=captionSeconds(line.text);caption={id:line.id,text:line.text,until:now()+secs*1000};emit();
   if(line.file){voice=doc.createElement('audio');voice.src=`${base}assets/radio/${line.file}`;const s=ctx.createMediaElementSource(voice);s.connect(nodes.bcLow);voice.play().catch(()=>{});}
   else setTimeout(()=>{if(!stopped)speak(line.text);},700); // 징글 뒤
   setTimeout(()=>{if(stopped)return;caption=null;emit();},secs*1000);
   const [a,b]=chm.gapSeconds??[40,60];next(a+Math.random()*(b-a));
  }
  next(.8);
  return {get state(){return 'playing';},stop(){stopped=true;clearTimeout(guideTimer);caption=null;hush();try{voice?.pause();}catch{}for(const o of [...oscs,lfo])try{o.stop();}catch{}try{bed.disconnect();}catch{}}};
 }
 // 다이얼·볼륨·소리 켜기 반영
 function apply(){
  if(!on||!nodes)return;const m=mixAt(freq,vol,FM_CHANNELS),t=ctx.currentTime,prev=lastMix;lastMix=m;
  const want=m.channel?.id??null;
  if(want!==deckId){if(want)startDeck(want);else stopDeck();}
  // 파일을 못 받는 채널(error)은 방송 0·잡음은 '방송 없음'처럼
  const broken=deckState==='error'||deckState==='loading';
  nodes.bc.gain.setTargetAtTime(broken?0:m.broadcast,t,TAU);
  nodes.noise.gain.setTargetAtTime(broken&&m.channel?vol*.55:m.noise,t,TAU);
  nodes.bcLow.frequency.setTargetAtTime(m.cutoff,t,TAU);
  if(prev&&!prev.locked&&m.locked)click();
  emit();
 }
 function syncSound(){if(!nodes)return;const want=!!enabled();if(want===soundOn)return;soundOn=want;if(!want)hush();nodes.bus.gain.setTargetAtTime(want?RADIO_MAX:0,ctx.currentTime,.05);emit();}
 function setOn(v){
  v=!!v;if(v===on)return on;
  if(v){if(!build())return false;on=true;click();apply();}
  else{on=false;const n=nodes,c=ctx;stopDeck();clearTimeout(crackleTimer);
   if(n){blip({f:700,dur:.05,gain:.3});n.bus.gain.setTargetAtTime(0,c.currentTime,.06);setTimeout(()=>{try{n.noiseSrc.stop();}catch{}for(const k of ['noise','bcLow','bc','fx','bus','tap'])try{n[k].disconnect();}catch{}},260);}
   nodes=null;lastMix=null;emit();}
  return on;
 }
 function setFreq(f,{silent=false}={}){const old=freq;freq=f;if(on&&!silent&&Math.round(old*10)!==Math.round(f*10))tick();apply();if(!on)emit();}
 function setVolume(v){vol=clamp01(v);apply();if(!on)emit();}
 return {setOn,setFreq,setVolume,syncSound,apply,status,get on(){return on;},get deck(){return deck;},
  // 시험용
  debug:()=>({ctx:ctx?.state,nodes:!!nodes,deck:deck?.current?.()??null,history:[...guideHistory]}),
  // 지금 라디오 버스 소리 크기(dBFS, 소리 없으면 -Infinity)
  level(){if(!nodes)return -Infinity;const a=nodes.tap,d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;const r=Math.sqrt(s/d.length);return r>0?20*Math.log10(r):-Infinity;}};
}
