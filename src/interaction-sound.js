// 상호작용 임시 합성음(WebAudio). 최종 음원이 아니며 귀 검수는 별도다. design/상호작용-시안.html의 합성 방식과 같다.
// 환경음 위에 올리는 효과음이라 호출자가 ctx와 목적지(마스터 게인)를 준다. 소리를 끄면 호출하지 않는다.
const noiseBuffers=new WeakMap();
function noiseBuffer(ctx,seconds){let b=noiseBuffers.get(ctx);if(b&&b.duration>=seconds)return b;b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;noiseBuffers.set(ctx,b);return b;}
function noise(ctx,dest,t,{type='bandpass',f=1000,f2,q=1,a=.01,d=.2,g=.2}={}){
 const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),gn=ctx.createGain();s.buffer=noiseBuffer(ctx,a+d+.2);fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+a+d);fl.Q.value=q;
 gn.gain.setValueAtTime(.0001,t);gn.gain.exponentialRampToValueAtTime(g,t+a);gn.gain.exponentialRampToValueAtTime(.0001,t+a+d);s.connect(fl).connect(gn).connect(dest);s.start(t);s.stop(t+a+d+.05);
}
function tone(ctx,dest,t,{f=440,f2,a=.005,d=.15,g=.15,type='sine'}={}){
 const o=ctx.createOscillator(),gn=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+a+d);
 gn.gain.setValueAtTime(.0001,t);gn.gain.exponentialRampToValueAtTime(g,t+a);gn.gain.exponentialRampToValueAtTime(.0001,t+a+d);o.connect(gn).connect(dest);o.start(t);o.stop(t+a+d+.05);
}
export const SOUNDS={
 tick:(c,o,t)=>tone(c,o,t,{f:880,d:.06,g:.04}),
 stamp:(c,o,t)=>{tone(c,o,t,{f:110,f2:50,d:.22,g:.35});noise(c,o,t,{type:'lowpass',f:500,d:.08,g:.25});tone(c,o,t+.14,{f:1318,d:.5,g:.12});tone(c,o,t+.26,{f:1760,d:.7,g:.1});},
 splash:(c,o,t)=>{noise(c,o,t,{f:900,f2:2600,q:.8,a:.01,d:.28,g:.25});for(let i=0;i<6;i++)tone(c,o,t+.05+i*.04,{f:600+Math.random()*900,f2:1500,d:.05,g:.05});},
 gulp:(c,o,t)=>tone(c,o,t,{f:240,f2:130,a:.01,d:.12,g:.2}),
 drop:(c,o,t)=>tone(c,o,t,{f:1500,f2:700,d:.08,g:.06}),
 breath:(c,o,t)=>noise(c,o,t,{type:'highpass',f:2500,q:.4,a:.12,d:.3,g:.08}),
 clack:(c,o,t)=>{noise(c,o,t,{f:2400,q:6,d:.04,g:.3});tone(c,o,t,{f:520,type:'triangle',d:.08,g:.1});},
 scrape:(c,o,t)=>noise(c,o,t,{f:1800,q:.8,a:.05,d:.3,g:.12}),
 inh:(c,o,t)=>noise(c,o,t,{f:1000,f2:1600,q:.5,a:1.2,d:.6,g:.1}),
 exh:(c,o,t)=>noise(c,o,t,{f:1500,f2:700,q:.5,a:.3,d:1.5,g:.1}),
 wind:(c,o,t)=>noise(c,o,t,{type:'lowpass',f:600,f2:900,q:.4,a:1.8,d:1.8,g:.04}),
 greet:(c,o,t)=>{tone(c,o,t,{f:660,d:.3,g:.1});tone(c,o,t+.14,{f:880,d:.4,g:.1});},
 done:(c,o,t)=>{tone(c,o,t,{f:988,d:.25,g:.08});tone(c,o,t+.12,{f:1318,d:.4,g:.08});},
};
// 행동별 소리 시간표(초). 설계 §⑥의 타임라인에 맞춘 임시 배치.
export const ACTION_SOUND_PLAN={
 drink:[['splash',.9],['gulp',2.1],['gulp',2.6],['breath',3.0]],
 dip:[['splash',.8],['drop',2.1],['drop',2.35],['drop',2.6]],
 cairn:[['scrape',.3],['clack',1.5],['clack',1.85],['breath',2.3]],
 stretch:[['inh',.2],['exh',2.0],['wind',.5]],
};
export function createInteractionSound({context=()=>null,destination=()=>null,enabled=()=>true}={}){
 const timers=new Set();
 function play(name,delay=0){
  if(!enabled())return false;const ctx=context(),dest=destination()??ctx?.destination;const fn=SOUNDS[name];if(!ctx||!fn||!dest)return false;
  try{fn(ctx,dest,ctx.currentTime+.02+delay);return true;}catch{return false;}
 }
 // 행동 소리를 시간표대로 타이머로 예약한다. 이동으로 행동이 취소되면 cancel()이 남은 소리를 막는다.
 function playAction(id){cancel();let n=0;for(const [name,at] of ACTION_SOUND_PLAN[id]??[]){const t=setTimeout(()=>{timers.delete(t);play(name);},at*1000);timers.add(t);n++;}return n;}
 function cancel(){for(const t of timers)clearTimeout(t);timers.clear();}
 return {play,playAction,cancel,get pending(){return timers.size;}};
}
