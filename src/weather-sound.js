// 빗소리: 외부 파일 없이 흰 잡음을 걸러 만든 절차적 소리(저작권 없음). 환경음 버스에 붙어 일시정지·음소거를 그대로 따른다.
// 세기(0~1)는 ambient-config의 WEATHER_SOUND.rain을 따라간다.
import {WEATHER_SOUND} from './ambient-config.js';
export const rainGain=level=>level<=0?0:.05+.32*Math.min(1,level);
export class RainLayer{
 constructor(context,destination){
  this.context=context;const seconds=3,n=context.sampleRate*seconds,buffer=context.createBuffer(1,n,context.sampleRate),d=buffer.getChannelData(0);
  let b0=0,b1=0,b2=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=.997*b0+w*.029;b1=.985*b1+w*.0328;b2=.95*b2+w*.0529;d[i]=(b0+b1+b2+w*.2)*.9;}
  // 루프 이음매를 숨기려고 양 끝을 0.05초 교차 페이드한다.
  const f=Math.floor(context.sampleRate*.05);for(let i=0;i<f;i++){const t=i/f;d[i]=d[i]*t+d[n-f+i]*(1-t);}
  this.source=context.createBufferSource();this.source.buffer=buffer;this.source.loop=true;
  this.high=context.createBiquadFilter();this.high.type='highpass';this.high.frequency.value=700;
  this.low=context.createBiquadFilter();this.low.type='lowpass';this.low.frequency.value=7500;
  this.gain=context.createGain();this.gain.gain.value=0;
  this.source.connect(this.high).connect(this.low).connect(this.gain).connect(destination);this.source.start();
  this.listener=state=>this.set(state.rain);WEATHER_SOUND.listeners.add(this.listener);this.set(WEATHER_SOUND.rain);
 }
 set(level){const c=this.context;this.gain.gain.cancelScheduledValues(c.currentTime);this.gain.gain.setTargetAtTime(rainGain(level),c.currentTime,.8);}
 dispose(){WEATHER_SOUND.listeners.delete(this.listener);try{this.source.stop();}catch{}this.source.disconnect();this.gain.disconnect();}
}
