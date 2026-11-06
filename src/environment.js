// 시각(daytime.js)과 날씨(weather.js)를 합친 "지금의 환경"을 프레임마다 부드럽게 따라가는 보관소.
// 렌더링(rendering.js)이 매 프레임 update()를 부르고 current를 읽어 빛·하늘·연무·입자에 반영한다.
import {composeEnvironment,sunPosition,moonPosition,resolveUtcMs,seoulClock,wrap360} from './daytime.js';
import {createWeatherController,KIND_LABEL,KIND_ICON,iconFor} from './weather.js';
import {SUN_PRESETS} from './look-profile.js';
export const TAU_SECONDS=2.5;
// 숫자·배열·객체를 재귀적으로 목표값 쪽으로 보낸다. 그 외(불리언 등)는 목표값을 그대로 쓴다.
export function easeTo(cur,target,k){
 if(typeof target==='number')return typeof cur==='number'&&Number.isFinite(cur)&&Number.isFinite(target)?cur+(target-cur)*k:target;
 if(Array.isArray(target))return target.map((v,i)=>easeTo(Array.isArray(cur)?cur[i]:undefined,v,k));
 if(target&&typeof target==='object')return Object.fromEntries(Object.keys(target).map(key=>[key,easeTo(cur?.[key],target[key],k)]));
 return target;
}
// 각도(0~360)는 짧은 쪽으로 돌려야 하므로 따로 다룬다. 방위는 빛이 바뀔 때만 크게 움직인다.
const ANGLES=[['azimuth'],['light','azimuth'],['moon','azimuth']];
function patchAngles(next,cur,target,k){
 for(const path of ANGLES){
  const get=o=>path.reduce((a,key)=>a?.[key],o),a=get(cur),b=get(target);if(typeof a!=='number'||typeof b!=='number')continue;
  let d=((b-a+540)%360)-180;const v=wrap360(a+d*k),holder=path.slice(0,-1).reduce((o,key)=>o[key],next);holder[path.at(-1)]=v;
 }
 return next;
}
export function createEnvironment({search=globalThis.location?.search??'',nowMs=Date.now,weather=null,fetchImpl}={}){
 const q=new URLSearchParams(search),legacy=SUN_PRESETS[q.get('sun')],timeParam=q.get('time');
 const ctl=weather??createWeatherController({search,fetchImpl,now:nowMs,onChange:()=>{}});
 let current=null,lastLabel='',lastKey='';
 const info={timeLabel:'',manualTime:false,legacySun:false,kind:'clear',level:null,source:'fallback',icon:KIND_ICON.clear,weatherLabel:KIND_LABEL.clear};
 function target(){
  let sun,moon,label;
  if(legacy&&!timeParam){sun={elevation:legacy.elevation,azimuth:legacy.azimuth};moon={elevation:-40,azimuth:(legacy.azimuth+180)%360,illumination:.5};label=legacy.label;info.manualTime=true;info.legacySun=true;}
  else{const {utcMs,manual}=resolveUtcMs({time:timeParam,nowMs:nowMs()});sun=sunPosition(utcMs);moon=moonPosition(utcMs);label=seoulClock(utcMs).label;info.manualTime=manual;info.legacySun=false;}
  info.timeLabel=label;info.sunDown=sun.elevation<0;info.sunElevation=Math.round(sun.elevation*2)/2;
  return composeEnvironment({sun,moon,weather:ctl.state.look});
 }
 function update(dt){
  const t=target(),w=ctl.state;
  Object.assign(info,{kind:w.kind,level:w.level,source:w.source,icon:iconFor(w.kind,info.sunDown),weatherLabel:KIND_LABEL[w.kind]});
  const k=current?1-Math.exp(-Math.max(0,Math.min(dt,.5))/TAU_SECONDS):1;
  current=current?patchAngles(easeTo(current,t,k),current,t,k):t;
  // 입자·소리는 날씨 수치 그대로를 이미 부드럽게 따라가므로 따로 처리하지 않는다.
  const key=`${info.timeLabel}|${info.sunDown}|${w.kind}|${w.level}|${w.source}`;
  if(key!==lastKey){lastKey=key;globalThis.dispatchEvent?.(new CustomEvent('hiking:environment',{detail:{...info}}));}
  return current;
 }
 return {update,weather:ctl,info,get current(){return current;}};
}
