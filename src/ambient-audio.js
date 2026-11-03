import {LAYER_FILES,FILE_RMS_DB,INTERMITTENT,CROSSFADE_S,DUCK,clamp,dbGain,powerDb,ambientTargets,crossfade} from './ambient-config.js';
export class AmbientAudio{
 constructor({base,context=null,destination=null,enabled=true,volume=.7,random=Math.random,onChange=()=>{}}={}){
  Object.assign(this,{base,context,destination,enabled,random,onChange});this.volume=clamp(volume);this.buffers=new Map();this.pending=new Map();this.layers=new Map();this.active=new Set();this.errors=[];this.dropped=0;this.time=0;this.tick=0;this.paused=true;this.birdOn=false;this.birdAt=0;this.crowAt=0;this.moktakAt=0;this.hits=0;this.hitIndex=0;this.lastCrow=-1;this.model=null;this.transition=null;this.actual={};this.measuredRmsDb=-Infinity;this.footstepPeakDb=null;this.warned=new Set();if(context&&destination)this.attach(context,destination);
 }
 range(pair){return pair[0]+this.random()*(pair[1]-pair[0]);}
 attach(context,destination){if(this.bus)return;this.context=context;this.destination=destination;this.bus=context.createGain();this.bus.gain.value=0;this.duck=context.createGain();this.high=context.createBiquadFilter();this.high.type='highpass';this.high.frequency.value=60;this.analyser=context.createAnalyser();this.analyser.fftSize=1024;this.samples=new Float32Array(1024);this.bus.connect(this.duck).connect(this.high).connect(this.analyser).connect(destination);}
 async load(file){if(this.buffers.has(file))return this.buffers.get(file);if(this.pending.has(file))return this.pending.get(file);const request=(async()=>{try{const r=await fetch(this.base+file);if(!r.ok)throw new Error('HTTP '+r.status);const buffer=await this.context.decodeAudioData(await r.arrayBuffer());this.buffers.set(file,buffer);return buffer;}catch(e){const error=file+': '+e.message;this.errors.push(error);console.error('[환경음]',error);return null;}})();this.pending.set(file,request);return request;}
 ramp(param,value,seconds){const c=this.context;param.cancelScheduledValues(c.currentTime);param.setTargetAtTime(value,c.currentTime,Math.max(.003,seconds/3));}
 stopSources(delay=.15){if(!this.context)return;this.ramp(this.bus.gain,0,delay);for(const voice of this.active){try{voice.source.stop(this.context.currentTime+delay);}catch{}}this.layers.clear();}
 setEnabled(v){this.enabled=!!v;if(!v)this.stopSources();else if(this.bus)this.ramp(this.bus.gain,this.paused?0:1,.5);}
 // 사용자 볼륨은 공유 마스터에서 한 번만 곱한다.
 setVolume(v){this.volume=clamp(v);}
 setPaused(v){v=!!v;if(v===this.paused)return;this.paused=v;if(v)this.stopSources(.25);else if(this.bus)this.ramp(this.bus.gain,this.enabled?1:0,.5);}
 makeVoice(file,{loop=false,db=0,pan=0,rate=1,cutoff=9000,forest=false}={}){
  const buffer=this.buffers.get(file);if(!buffer||!this.enabled||this.paused)return null;
  const c=this.context,source=c.createBufferSource(),gain=c.createGain(),panner=c.createStereoPanner(),low=c.createBiquadFilter(),shelf=c.createBiquadFilter();source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;gain.gain.value=loop?0:dbGain(db);panner.pan.value=pan;low.type='lowpass';low.frequency.value=cutoff;shelf.type='lowshelf';shelf.frequency.value=200;shelf.gain.value=forest?-3:0;source.connect(low).connect(shelf).connect(gain).connect(panner).connect(this.bus);
  const voice={source,gain,low};this.active.add(voice);source.onended=()=>{this.active.delete(voice);source.disconnect();gain.disconnect();panner.disconnect();low.disconnect();shelf.disconnect();};source.start(0,loop?this.random()*buffer.duration:0);return voice;
 }
 oneShot(file,peakDb,options={}){if(this.active.size>=12){this.dropped++;return;}if(!this.makeVoice(file,{...options,db:peakDb-(file.startsWith('crow')?-3:-6)}))this.dropped++;}
 onStep(record){if(!record||!this.context)return;this.footstepPeakDb=record.normalizedPeakDb; if(this.model?.sumRmsDb>DUCK.minSumDb&&this.enabled&&!this.paused){const p=this.duck.gain,c=this.context;p.cancelScheduledValues(c.currentTime);p.setValueAtTime(p.value,c.currentTime);p.linearRampToValueAtTime(dbGain(DUCK.db),c.currentTime+DUCK.attackS);p.setTargetAtTime(1,c.currentTime+DUCK.attackS,DUCK.releaseS/3);}}
 update({referenceMetres=0,elevation=100,paused=false,dt=0,jump=false}={}){
  this.setPaused(paused||!!globalThis.document?.hidden);if(!this.bus||!this.enabled||this.paused||this.context.state!=='running')return;
  this.time+=Math.max(0,dt);this.tick+=Math.max(0,dt);if(this.tick<.25)return;const elapsed=this.tick;this.tick=0;
  const m=referenceMetres,h=elevation; jump=jump||(this.previousM!==undefined&&Math.abs(m-this.previousM)>30);this.previousM=m;
  const section=ambientTargets(m,h).section;
  if(section>=5)for(const file of ['wind-ridge-loop.flac','summit-crowd-loop.flac','moktak-01.flac','moktak-02.flac','moktak-03.flac'])void this.load(file);
  if(section<=5&&this.time>=this.birdAt){this.birdOn=!this.birdOn;const upper=section>=4;this.birdAt=this.time+this.range(INTERMITTENT.birds[this.birdOn?(upper?'upperOn':'on'):(upper?'upperOff':'off')]);}
  if(this.gustEnd===undefined){this.gustStart=this.time;this.gustEnd=this.time+this.range([7,14]);}
  if(this.time>=this.gustEnd){this.gustStart=this.time;this.gustEnd=this.time+this.range([7,14]);}
  const next=ambientTargets(m,h,{birds:this.birdOn,gust:Math.sin((this.time-this.gustStart)/(this.gustEnd-this.gustStart)*2*Math.PI)*2.5});
  if(next.correction<0&&!this.warned.has(section)){console.warn('[환경음] 합계 예산 보정',section,next.correction);this.warned.add(section);}
  if(!this.model||next.section!==this.model.section||jump){const from=Object.fromEntries(Object.keys(LAYER_FILES).map(k=>[k,this.actual[k]>0?20*Math.log10(this.actual[k]):null]));this.transition={from,age:0,duration:jump?CROSSFADE_S.jump:next.section===2||this.model?.section===2?CROSSFADE_S.city:next.section>=6?CROSSFADE_S.upper:CROSSFADE_S.forest};if(this.model?.section!==next.section&&globalThis.window)window.dispatchEvent(new CustomEvent('hiking:section',{detail:{from:this.model?.section??null,to:next.section,referenceMetres:m,jump}}));}
  this.model=next;
  if(this.transition){this.transition.age+=elapsed;this.actual=crossfade(this.transition.from,next.targets,this.transition.age/this.transition.duration);if(this.transition.age>=this.transition.duration)this.transition=null;}else this.actual=Object.fromEntries(Object.entries(next.targets).map(([k,v])=>[k,dbGain(v)]));
  // 경계에서 낮은 쪽 예산으로 돌아갈 때도 현재 전력합을 제한한다.
  const sum=powerDb(Object.values(this.actual).map(g=>g>0?20*Math.log10(g):null)),cap=dbGain(Math.min(0,next.budgetDb-sum));
  for(const [name,file]of Object.entries(LAYER_FILES)){
   const gain=this.actual[name]*cap;this.actual[name]=gain;let voice=this.layers.get(name);
   if(gain>0&&!voice){void this.load(file);if(this.buffers.has(file)){voice=this.makeVoice(file,{loop:true,pan:name==='stream'?-.2:0,forest:name==='forest'});if(voice)this.layers.set(name,voice);}}
   if(voice){this.ramp(voice.gain.gain,gain/dbGain(FILE_RMS_DB[name]),name==='birds'?1.5:.75);if(name==='stream')this.ramp(voice.low.frequency,Math.max(1200,9000/(1+next.distance/20)),.75);if(name==='ridge')this.ramp(voice.low.frequency,1200+2300*next.exposure,.75);if(gain===0){try{voice.source.stop(this.context.currentTime+1.5);}catch{}this.layers.delete(name);}}
  }
  if(section>=4){for(const f of ['crow-01.flac','crow-02.flac'])void this.load(f);if(this.time>=this.crowAt){this.lastCrow=1-this.lastCrow;if(this.lastCrow>1)this.lastCrow=0;this.oneShot(`crow-0${this.lastCrow+1}.flac`,-30,{rate:this.range([.94,1.06]),pan:this.range([-.6,.6]),cutoff:5000});this.crowAt=this.time+this.range(section<=5?INTERMITTENT.crow.low:INTERMITTENT.crow.high);}}
  const distance=Math.abs(m-INTERMITTENT.moktak.origin);
  if(m>=4800&&distance<=60){for(let i=1;i<=3;i++)void this.load(`moktak-0${i}.flac`);if(this.time>=this.moktakAt){if(!this.hits){this.hits=Math.floor(this.range([8,13]));this.burstCount=this.hits;}this.oneShot(`moktak-0${this.hitIndex%3+1}.flac`,(section===7?-30:-34)-20*Math.log10(Math.max(20,distance)/20),{rate:this.range([.97,1.03])});this.hitIndex++;this.hits--;const phase=(this.burstCount-this.hits-1)/Math.max(1,this.burstCount-2),interval=1+.1*Math.cos(2*Math.PI*phase);this.moktakAt=this.time+(this.hits?interval:this.range(INTERMITTENT.moktak.rest));}}else this.hits=0;
  this.analyser.getFloatTimeDomainData(this.samples);let energy=0;for(const v of this.samples)energy+=v*v;this.measuredRmsDb=energy?10*Math.log10(energy/this.samples.length):-Infinity;
 }
 snapshot(){const sumRmsDb=powerDb(Object.values(this.actual).map(g=>g>0?20*Math.log10(g):null));return {section:this.model?.section??null,layers:Object.fromEntries(Object.entries(LAYER_FILES).map(([name])=>[name,{gainDb:this.layers.has(name)?20*Math.log10(this.layers.get(name).gain.gain.value):-Infinity,targetDb:this.model?.targets[name]??null,playing:this.enabled&&!this.paused&&this.layers.has(name)}])),sumRmsDb:this.enabled&&!this.paused?sumRmsDb:-Infinity,measuredRmsDb:this.measuredRmsDb,budgetDb:this.model?.budgetDb??-37,footstepPeakMinusAmbientDb:this.footstepPeakDb===null||!Number.isFinite(this.measuredRmsDb)?null:this.footstepPeakDb+40*Math.log10(this.volume)-this.measuredRmsDb,decoded:this.buffers.size,active:this.active.size,dropped:this.dropped,errors:[...this.errors]};}
}
