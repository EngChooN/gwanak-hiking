const series=(prefix,n,suffix='.ogg')=>Array.from({length:n},(_,i)=>`${prefix}${String(i+1).padStart(2,'0')}${suffix}`);
export const SOUND_BANKS={
  stairs:series('stairs/stone-stair-',6),deck_stairs:series('stairs/log-stair-',7),
  soil:['dirt/mud02.ogg','dirt/leaves01.ogg','dirt/leaves02.ogg',...['L','R'].flatMap(side=>[1,2,3].map(n=>`dirt/Fantozzi-Sand${side}${n}.ogg`))],
  rock:['stone/stone01.ogg','stone/gravel.ogg',...['L','R'].flatMap(side=>[1,2,3].map(n=>`stone/Fantozzi-Stone${side}${n}.ogg`))],
  deck:['deck/wood01.ogg','deck/wood02.ogg','deck/wood03.ogg'],ridge:['rock/sfx_step_rock_l.flac','rock/sfx_step_rock_r.flac']
};
export const SOUND_SAVE_KEY='gwanak-hiking:sound:v1';
export class FootstepSelector{
  constructor(random=Math.random){this.random=random;this.bags=new Map();this.recent=[];}
  next(material,step){
    const bank=SOUND_BANKS[material];if(!bank)throw new Error('알 수 없는 발소리 재질: '+material);
    let bag=this.bags.get(material);if(!bag?.length){bag=[...bank];this.bags.set(material,bag);}
    const stair=material==='stairs'||material==='deck_stairs',excluded=this.recent.slice(stair?-2:-1);
    const candidates=bag.filter(file=>!excluded.includes(file));
    // N>=3(계단) / N>=2(그 외)이므로 정상 순환에서 후보가 항상 남는다.
    const choices=candidates.length?candidates:bank.filter(file=>!excluded.includes(file));
    const file=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
    const index=bag.indexOf(file);if(index>=0)bag.splice(index,1);
    this.recent.push(file);this.recent=this.recent.slice(-2);
    return {material,file,variant:bank.indexOf(file)+1,rate:.96+this.random()*.08,variationDb:-1.5+this.random()*3,pan:step%2?-.08:.08};
  }
}

export class FootstepAudio{
  constructor({base,enabled=true,onChange=()=>{},random=Math.random,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
    this.base=base;this.enabled=enabled;this.onChange=onChange;this.contextFactory=contextFactory;this.selector=new FootstepSelector(random);
    this.context=null;this.buffers=new Map();this.active=new Set();this.logs=[];this.errors=[];this.received=0;this.dropped={muted:0,locked:0,loading:0,paused:0};
    // 바이트만 미리 받는다. AudioContext 생성·디코딩·재생은 사용자 입력 이후다.
    this.encoded=new Map(Object.values(SOUND_BANKS).flat().map(file=>[file,fetch(base+file).then(r=>{if(!r.ok)throw new Error(`${file}: HTTP ${r.status}`);return r.arrayBuffer();}).then(bytes=>({bytes}),error=>({error:error.message}))]));
  }
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        this.context=this.contextFactory();const c=this.context;
        this.master=c.createGain();this.master.gain.value=1;
        // 합산 출력 피크는 -6dBFS 이하. 끄기·일시정지 시 짧게 페이드한다.
        this.limiter=c.createWaveShaper();const ceiling=10**(-6/20),curve=new Float32Array(8193);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=ceiling*Math.tanh(x/ceiling);}this.limiter.curve=curve;
        this.analyser=c.createAnalyser();this.analyser.fftSize=1024;this.master.connect(this.limiter).connect(this.analyser).connect(c.destination);
        this.decoding=Promise.all([...this.encoded].map(async([file,request])=>{try{const result=await request;if(result.error)throw new Error(result.error);const buffer=await c.decodeAudioData(result.bytes.slice(0));this.buffers.set(file,buffer);}catch(error){this.errors.push(`${file}: ${error.message}`);}})).then(()=>this.onChange());
      }
      if(this.context.state!=='running')await this.context.resume();this.onChange();
    }catch(error){this.errors.push(error.message);this.onChange();}
  }
  setEnabled(enabled){this.enabled=!!enabled;if(!this.enabled)this.stop();else void this.unlock();this.onChange();}
  stop(){const c=this.context;if(!c)return;for(const voice of [...this.active]){voice.gain.gain.cancelScheduledValues(c.currentTime);voice.gain.gain.setTargetAtTime(0,c.currentTime,.004);try{voice.source.stop(c.currentTime+.025);}catch{}}}
  play(detail,{view='first',paused=false}={}){
    this.received++;
    if(!this.enabled){this.dropped.muted++;return;}
    if(paused||globalThis.document?.hidden){this.dropped.paused++;return;}
    if(!this.context||this.context.state!=='running'){this.dropped.locked++;return;}
    const bank=SOUND_BANKS[detail.material];if(!bank){this.errors.push('알 수 없는 재질: '+detail.material);return;}
    if(!bank.every(file=>this.buffers.has(file))){this.dropped.loading++;return;}
    const variant=this.selector.next(detail.material,detail.step),c=this.context,source=c.createBufferSource(),gain=c.createGain(),pan=c.createStereoPanner(),low=c.createBiquadFilter();
    source.buffer=this.buffers.get(variant.file);source.playbackRate.value=variant.rate;pan.pan.value=variant.pan;
    const steep=detail.slope>=.1,db=variant.variationDb+(steep?1:0)+(view==='third'?-3:0);
    gain.gain.value=10**(db/20);low.type='lowshelf';low.frequency.value=220;low.gain.value=steep?1.5:0;
    const limit=detail.material==='ridge'?.5:detail.material==='soil'||detail.material==='deck'?.4:detail.material==='rock'?.35:.3;
    const duration=Math.min(source.buffer.duration/variant.rate,limit),at=c.currentTime;
    gain.gain.setValueAtTime(10**(db/20),at);gain.gain.setValueAtTime(10**(db/20),at+Math.max(0,duration-.025));gain.gain.linearRampToValueAtTime(0,at+duration);
    source.connect(low).connect(gain).connect(pan).connect(this.master);
    const voice={source,gain};this.active.add(voice);source.onended=()=>{this.active.delete(voice);source.disconnect();low.disconnect();gain.disconnect();pan.disconnect();};
    source.start(at);source.stop(at+duration);
    const record={step:detail.step,material:detail.material,variant:variant.variant,file:variant.file,rate:variant.rate,variationDb:variant.variationDb,mixDb:db,pan:variant.pan,view,eventElapsed:detail.elapsed,contextTime:at,wallTime:performance.now()/1000,duration};
    this.logs.push(record);if(this.logs.length>256)this.logs.shift();console.debug('[발소리]',JSON.stringify(record));this.onChange();return record;
  }
  snapshot(){let peak=0,rms=0;if(this.analyser){const values=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(values);for(const v of values){peak=Math.max(peak,Math.abs(v));rms+=v*v;}rms=Math.sqrt(rms/values.length);}
    return {enabled:this.enabled,context:this.context?.state||'입력 대기',decoded:this.buffers.size,total:Object.values(SOUND_BANKS).flat().length,active:this.active.size,received:this.received,dropped:{...this.dropped},errors:[...this.errors],peak,rms,logs:this.logs.map(r=>({...r}))};}
}
