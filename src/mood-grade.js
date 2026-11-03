// 낮·노을·밤 보정값을 태양 고도로 섞는 순수 계산(렌더 없음). 값은 mood-config.js.
import {BLOOM,DAY_GRADE,GOLDEN_GRADE,NIGHT_GRADE,SOFT_WEATHER} from './mood-config.js';
const mixNumber=(a,b,t)=>a+(b-a)*t,mixList=(a,b,t)=>a.map((v,i)=>mixNumber(v,b[i],t)),smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// 낮·노을·밤 보정값을 태양 고도로 섞는다. 노을은 고도 3~14° 사이에서 낮으로 넘어간다.
export function moodBlend(elevation,night,gray=0){
 const golden=(1-smoothstep(3,14,elevation))*(1-night),dayWeight=1-golden-night,w={day:Math.max(0,dayWeight),golden,night};
 const pick=key=>({day:DAY_GRADE[key],golden:GOLDEN_GRADE[key],night:NIGHT_GRADE[key]});
 const blend=key=>{const v=pick(key);return Array.isArray(v.day)?v.day.map((_,i)=>v.day[i]*w.day+v.golden[i]*w.golden+v.night[i]*w.night):v.day*w.day+v.golden*w.golden+v.night*w.night;};
 const softness=smoothstep(.3,1,gray);
 return {exposure:blend('exposure')*mixNumber(1,SOFT_WEATHER.exposureBoost,softness),saturation:blend('saturation'),shadowTint:blend('shadowTint'),shadowAmount:blend('shadowTintAmount'),warm:blend('highlightWarm'),
  bloom:BLOOM.strength.day*w.day+BLOOM.strength.golden*w.golden+BLOOM.strength.night*w.night,weights:w};
}
