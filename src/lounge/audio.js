// 흡연장 소리. 외부 파일 없이 전부 Web Audio로 합성한다(런타임 외부 접속 없음).
// 효과음: 라이터 딸깍·불꽃, 들이마시기, 내뿜기, 재 털기, 꽁초 톡, 매너 도장 쿵, 채팅 톡 + 은은한 도심 배경음(차 소리 웅웅·가끔 지나가는 차·바람).
// 온라인 등산처럼 첫 사용자 입력(터치·클릭·키) 전에는 AudioContext를 만들지 않는다(아이폰 사파리 제한 → 입력 전에는 소리 없음).
// play(name,{at:{x,z},gain}) — at을 주면 내 아바타와의 거리만큼 작게·좌우로(NPC 담배 소리).

// v2(기획서 A4): 지포 뚜껑 철컥(cap)·휠 드르륵(wheel)·치이익(update의 draw로 계속 변함)·길게 내쉬는 숨(exhale, quality별)·기침(cough)·링(ring)·캔 따는 소리(can, lounge:spot vending use)
export const SOUND_NAMES=Object.freeze(['lighter','click','cap','wheel','flame','inhale','exhale','ash','drop','stamp','chat','pop','cough','ring','can']);
const HEAR_RADIUS=9; // NPC 소리가 들리는 거리(m)
// 내쉬는 숨 길이(초): quality가 sweet·deep이면 길게 "하아…". light는 짧게.
export const EXHALE_LEN=Object.freeze({light:{hold:.3,release:.8},sweet:{hold:.8,release:1.7},deep:{hold:1.3,release:2.3},cough:{hold:.2,release:.5}});
export const exhaleLen=q=>EXHALE_LEN[q]??EXHALE_LEN.light;
// 치이익 크기(0~.06, 배경에 깔리는 정도): 많이 들이마실수록(draw 0~1) 커진다. 안 들이마시면 0.
export const sizzleGain=draw=>draw>.02?Math.min(.06,.012+.048*Math.min(1,draw)):0;

// 거리 → 크기(0~1). 1m 안은 그대로, 반경 밖은 0, 사이는 제곱으로 줄인다.
export function distanceGain(d,radius=HEAR_RADIUS){if(!Number.isFinite(d))return 1;if(d<=1)return 1;if(d>=radius)return 0;const k=1-(d-1)/(radius-1);return k*k;}

export function createLoungeAudio({muted=false}={}){
 let ctx=null,master=null,sfx=null,amb=null,noise=null,brown=null,unlocked=false;
 const listener={x:0,z:0,yaw:0};
 const stats={played:0,skipped:0,byName:{}};
 const amb$={nodes:null,nextCar:4,nextWind:2,level:0,duck:1,duckTo:1,duckLeft:0,sizzle:null,tick:0};
 let lastQuality=null; // 가장 최근 lounge:smoke의 quality(내쉬는 숨 길이를 정한다)
 // 이벤트로 받는 소리: 담배 내뿜기 quality, 자판기 캔 따기(lounge:spot {spot:'vending',state:'use'})
 const onSmoke=e=>{const d=e.detail??{};if(d.isPlayer!==false&&d.state==='exhale'&&d.quality)lastQuality=d.quality;}; // NPC(isPlayer:false)는 무시. play에 quality를 직접 주면 그 값이 먼저
 const onSpot=e=>{const d=e.detail??{};if(d.spot==='vending'&&d.state==='use')play('can');};
 window.addEventListener('lounge:smoke',onSmoke);window.addEventListener('lounge:spot',onSpot);

 // ── 첫 입력 때 만든다
 const unlockEvents=['pointerdown','keydown','touchend'];
 function unlock(){
  if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
   ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:1;
   // 너무 큰 소리를 막는 부드러운 압축
   const comp=ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=3;master.connect(comp).connect(ctx.destination);
   sfx=ctx.createGain();sfx.gain.value=.9;sfx.connect(master);amb=ctx.createGain();amb.gain.value=0;amb.connect(master);
   noise=makeNoise('white');brown=makeNoise('brown');startAmbient();}
  if(ctx.state==='suspended')ctx.resume();
  unlocked=true;
 }
 for(const e of unlockEvents)window.addEventListener(e,unlock,{passive:true});

 function makeNoise(kind){const n=ctx.sampleRate*2,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);let last=0;
  for(let i=0;i<n;i++){const w=Math.random()*2-1;if(kind==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}return b;}
 // ── 합성 도우미
 const now=()=>ctx.currentTime;
 function noiseSrc(buf=noise,{rate=1,loop=true}={}){const s=ctx.createBufferSource();s.buffer=buf;s.loop=loop;s.playbackRate.value=rate;s.start(now(),Math.random()*1.5);return s;}
 function filt(type,freq,q=1){const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;return f;}
 function env(g,t0,a,peak,hold,release){g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(peak,t0+a);g.gain.setValueAtTime(peak,t0+a+hold);g.gain.exponentialRampToValueAtTime(.0001,t0+a+hold+release);return t0+a+hold+release;}
 function out(dest,pan){if(!pan||!ctx.createStereoPanner)return dest;const p=ctx.createStereoPanner();p.pan.value=pan;p.connect(dest);return p;}
 const stopAt=(nodes,t)=>{for(const n of nodes)try{n.stop(t+.05);}catch{}};
 // 쉿 소리(노이즈 → 필터 → 엔벨로프)
 function hiss(dest,t0,{type='bandpass',freq=1200,q=1,to=null,a=.02,peak=.3,hold=0,release=.2,rate=1}={}){
  const s=noiseSrc(noise,{rate}),f=filt(type,freq,q),g=ctx.createGain();s.connect(f).connect(g).connect(dest);
  if(to)f.frequency.exponentialRampToValueAtTime(to,t0+a+hold+release);const end=env(g,t0,a,peak,hold,release);stopAt([s],end);return {f,g,end};}
 function tone(dest,t0,{type='sine',freq=440,to=null,a=.005,peak=.2,hold=0,release=.1}={}){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t0);if(to)o.frequency.exponentialRampToValueAtTime(to,t0+a+hold+release);
  o.connect(g).connect(dest);o.start(t0);const end=env(g,t0,a,peak,hold,release);stopAt([o],end);return end;}
 // 종이 타는 지직(아주 작은 톡톡)
 function crackle(dest,t0,dur,density=18,peak=.08){const n=Math.round(dur*density);for(let i=0;i<n;i++){const t=t0+Math.random()*dur;hiss(dest,t,{type:'highpass',freq:3500+Math.random()*3000,q:.7,a:.001,peak:peak*(.4+Math.random()*.6),release:.012+Math.random()*.015});}}

 // ── 효과음 표
 const SFX={
  click(d,t){hiss(d,t,{type:'highpass',freq:2500,q:.8,a:.001,peak:.55,release:.025});tone(d,t,{type:'square',freq:2200,to:1400,peak:.06,release:.02});
   hiss(d,t+.05,{type:'bandpass',freq:4200,q:2,a:.001,peak:.35,release:.03});}, // 부싯돌 휠 딸깍 + 스파크
  flame(d,t){hiss(d,t,{type:'bandpass',freq:1000,q:.5,a:.012,peak:.3,hold:.02,release:.2}); // "화악" 노이즈 버스트(빠른 어택, 떨림 없음)
   hiss(d,t+.04,{type:'lowpass',freq:520,q:.4,a:.06,peak:.09,hold:.3,release:.55}); // 낮은 "쉬이" 꼬리
   tone(d,t,{type:'sine',freq:110,to:70,peak:.07,a:.01,hold:.05,release:.3});}, // 훅 하고 붙는 낮은 울림
  cap(d,t){for(const [f,pk,rel] of [[2900,.07,.12],[4100,.05,.09],[5400,.03,.06]])tone(d,t,{type:'sine',freq:f,peak:pk,a:.001,release:rel}); // 지포 뚜껑 금속 "칭"
   hiss(d,t,{type:'highpass',freq:3500,q:.8,a:.001,peak:.12,release:.015});},
  wheel(d,t){hiss(d,t,{type:'bandpass',freq:2300,to:4200,q:1.2,a:.02,peak:.17,hold:.06,release:.1}); // 휠 "츠륵"
   for(let i=0;i<3;i++)hiss(d,t+.03+i*.04,{type:'bandpass',freq:3000+i*500,q:1.6,a:.001,peak:.1,release:.015});},
  lighter(d,t){SFX.cap(d,t);SFX.wheel(d,t+.14);SFX.flame(d,t+.32);},
  inhale(d,t){hiss(d,t,{type:'bandpass',freq:300,to:900,q:.9,a:.4,peak:.3,hold:.4,release:.28}); // 입으로 들이마시는 "스으읍"
   hiss(d,t+.05,{type:'lowpass',freq:700,q:.4,a:.35,peak:.1,hold:.4,release:.25});crackle(d,t+.2,.7,10,.025);},
  exhale(d,t,o={}){const q=o.quality??lastQuality,L=exhaleLen(q);
   hiss(d,t,{type:'bandpass',freq:1200,to:800,q:.7,a:.12,peak:.34,hold:L.hold,release:L.release}); // 중음 "후우~"
   hiss(d,t,{type:'bandpass',freq:2000,to:1300,q:.9,a:.15,peak:.1,hold:L.hold*.8,release:L.release*.7});
   hiss(d,t,{type:'bandpass',freq:600,q:.8,a:.12,peak:.1,hold:L.hold*.9,release:L.release*.8});
   if(q==='sweet'||q==='deep')tone(d,t+.05,{type:'sine',freq:520,to:380,peak:.02,a:.12,hold:L.hold,release:L.release*.7});
   if(!o.far)duck(.35,L.hold+L.release*.6);}, // 내쉬는 동안 배경 소리를 줄인다(내 담배만)
  cough(d,t){for(const [dt,f] of [[0,1],[.17,.9],[.34,.8]]){tone(d,t+dt,{type:'sawtooth',freq:170*f,to:110*f,peak:.07,a:.004,release:.1});
   hiss(d,t+dt,{type:'bandpass',freq:1100*f,to:500,q:.9,a:.004,peak:.3,release:.12});}},
  ring(d,t){hiss(d,t,{type:'bandpass',freq:900,to:500,q:1.4,a:.04,peak:.12,hold:.06,release:.25});tone(d,t,{freq:420,to:300,peak:.03,a:.03,release:.2});}, // 링 "후~"
  can(d,t){tone(d,t,{type:'square',freq:1900,to:1300,peak:.06,a:.001,release:.025});hiss(d,t,{type:'highpass',freq:3500,q:.7,a:.001,peak:.4,release:.025}); // 따는 딸깍
   hiss(d,t+.06,{type:'highpass',freq:2600,to:5200,q:.6,a:.02,peak:.32,hold:.18,release:.3}); // 치익
   crackle(d,t+.18,.7,26,.05);tone(d,t+.5,{type:'triangle',freq:700,to:560,peak:.02,release:.15});},
  ash(d,t){for(const dt of [0,.12]){tone(d,t+dt,{freq:210,to:120,peak:.18,release:.06});hiss(d,t+dt,{type:'lowpass',freq:1600,a:.001,peak:.12,release:.04});}},
  drop(d,t){tone(d,t,{freq:520,to:300,peak:.08,release:.05});hiss(d,t,{type:'highpass',freq:2000,a:.001,peak:.06,release:.03});},
  stamp(d,t){tone(d,t,{freq:140,to:48,peak:.6,a:.004,release:.28});hiss(d,t,{type:'lowpass',freq:500,a:.002,peak:.4,release:.12});hiss(d,t+.005,{type:'bandpass',freq:2400,q:1.5,a:.001,peak:.12,release:.05});}, // 도장 쿵
  chat(d,t){tone(d,t,{freq:880,to:1320,peak:.12,a:.004,release:.09});tone(d,t+.07,{freq:1320,to:1500,peak:.06,a:.004,release:.07});}, // 톡
  pop(d,t){tone(d,t,{freq:660,to:990,peak:.08,release:.06});},
 };

 function play(name,{at=null,gain=1,quality=null}={}){
  const f=SFX[name];if(!f)return false;
  if(!unlocked||!ctx||ctx.state!=='running'||muted){stats.skipped++;return false;}
  let g=gain,pan=0;
  if(at){const dx=at.x-listener.x,dz=at.z-listener.z;g*=distanceGain(Math.hypot(dx,dz));if(g<.01){stats.skipped++;return false;}
   // 듣는 사람(카메라는 몸 뒤) 기준 좌우: 오른쪽 벡터 = (cos yaw, -sin yaw)
   const d=Math.hypot(dx,dz)||1;pan=Math.max(-.8,Math.min(.8,(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/d*.8));}
  const bus=ctx.createGain();bus.gain.value=g;bus.connect(sfx);f(out(bus,pan),now()+.005,{quality,far:!!at});setTimeout(()=>bus.disconnect(),4000);
  stats.played++;stats.byName[name]=(stats.byName[name]??0)+1;return true;
 }

 // ── 도심 배경음: 멀리서 웅웅거리는 차 소리(갈색 노이즈 저역) + 높은 바람 + 가끔 지나가는 차·먼 경적
 function startAmbient(){
  const rumble=noiseSrc(brown),rf=filt('lowpass',260,.4),rg=ctx.createGain();rg.gain.value=.5;rumble.connect(rf).connect(rg).connect(amb);
  const wind=noiseSrc(noise,{rate:.5}),wf=filt('bandpass',500,.5),wg=ctx.createGain();wg.gain.value=.02;wind.connect(wf).connect(wg).connect(amb);
  amb$.nodes={rumble,rf,rg,wind,wf,wg};
  // 종이 타는 치이익: 늘 돌아가지만 소리는 0, 들이마시는 동안(update의 draw)만 커진다. 주변 소리를 줄여도(duck) 안 줄어든다.
  const sz=noiseSrc(noise,{rate:1.3}),sf=filt('bandpass',3000,.8),sg=ctx.createGain();sg.gain.value=0;sz.connect(sf).connect(sg).connect(sfx);
  amb$.sizzle={sf,sg};
 }
 // 주변 소리 작게: 처음 모금 연출 등. k=0~1 배율, sec초 동안 유지한 뒤 천천히 돌아온다.
 function duck(k=.4,sec=1.5){amb$.duckTo=Math.max(0,Math.min(1,k));amb$.duckLeft=sec;}
 function carPass(){const t=now(),dur=3+Math.random()*3,pan=Math.random()<.5?-1:1;
  const d=out(amb,0),s=noiseSrc(brown,{rate:1.4}),f=filt('bandpass',300,.9),g=ctx.createGain(),p=ctx.createStereoPanner?.();
  s.connect(f).connect(g);if(p){g.connect(p).connect(d);p.pan.setValueAtTime(-pan*.7,t);p.pan.linearRampToValueAtTime(pan*.7,t+dur);}else g.connect(d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.35,t+dur*.5);g.gain.linearRampToValueAtTime(0,t+dur);f.frequency.setValueAtTime(380,t);f.frequency.linearRampToValueAtTime(240,t+dur);stopAt([s],t+dur);}
 function farHorn(){const t=now(),d=amb;for(const [k,fr] of [[0,330],[.02,415]])tone(d,t+k,{type:'sawtooth',freq:fr,peak:.012,a:.03,hold:.25,release:.15});}

 // draw: 내 담배 들이마신 정도 0~1(smoker.status().draw). 클수록 치이익이 커진다.
 function update(dt,{env,player,draw=0}={}){
  if(player){listener.x=player.x??listener.x;listener.z=player.z??listener.z;listener.yaw=player.heading??listener.yaw;}
  if(amb$.duckLeft>0){amb$.duckLeft-=dt;if(amb$.duckLeft<=0)amb$.duckTo=1;}
  amb$.duck+=(amb$.duckTo-amb$.duck)*Math.min(1,dt*(amb$.duckTo<amb$.duck?6:1.2)); // 빨리 작아지고 천천히 돌아온다
  if(!ctx||!amb$.nodes||ctx.state!=='running')return;
  const night=env?.night??0;
  if(amb$.sizzle){const g=muted?0:sizzleGain(draw);amb$.sizzle.sg.gain.setTargetAtTime(g,now(),.06);amb$.sizzle.sf.frequency.setTargetAtTime(2800+draw*1000,now(),.1);
   if(g>0&&draw>.15){amb$.tick-=dt;if(amb$.tick<=0){amb$.tick=.06+Math.random()*.1;crackle(sfx,now(),.05,20,.02+.02*draw);}}}
  // 밤에는 차 소리가 줄고 바람이 조금 커진다
  const want=muted?0:.55*amb$.duck;amb$.level+=(want-amb$.level)*Math.min(1,dt*(amb$.duck<1?6:.8)); // 처음에는 천천히 들어온다
  amb.gain.setTargetAtTime(amb$.level,now(),.3);
  amb$.nodes.rg.gain.setTargetAtTime(.5*(1-.45*night),now(),.5);amb$.nodes.wg.gain.setTargetAtTime(.02+.02*night,now(),.5);
  amb$.nodes.wf.frequency.setTargetAtTime(450+Math.sin(performance.now()/3100)*120,now(),.4);
  amb$.nextCar-=dt;if(amb$.nextCar<=0){amb$.nextCar=(6+Math.random()*12)*(1+night*1.5);carPass();}
  amb$.nextWind-=dt;if(amb$.nextWind<=0){amb$.nextWind=25+Math.random()*40;if(night<.5&&Math.random()<.5)farHorn();}
 }

 function setMuted(b){muted=!!b;if(master)master.gain.setTargetAtTime(muted?0:1,now(),.05);}

 return {play,setMuted,update,unlock,resume:unlock,duck,
  get muted(){return muted;},
  status(){return {context:ctx?.state??'입력 대기',muted,unlocked,ambient:+amb$.level.toFixed(2),...stats,byName:{...stats.byName}};},
  dispose(){for(const e of unlockEvents)window.removeEventListener(e,unlock);window.removeEventListener('lounge:smoke',onSmoke);window.removeEventListener('lounge:spot',onSpot);ctx?.close();}};
}
