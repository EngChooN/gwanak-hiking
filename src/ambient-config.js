// 추정(후기 근거, 현장 확인 전). 환경음-구간별-설계.md
import {surfaceAt} from './route-surfaces.js';
export const VERIFIED=false, CITY_SUMMIT_ENABLED=false, CICADA_ENABLED=false;
export const VOLUME_SAVE_KEY='gwanak-hiking:ambient-volume:v1';
export const LAYER_FILES={stream:'stream-loop.flac',forest:'wind-forest-loop.flac',ridge:'wind-ridge-loop.flac',birds:'birds-loop.flac',crowd:'summit-crowd-loop.flac',city:'city-far-loop.flac'};
export const FILE_RMS_DB={stream:-26,forest:-30,ridge:-24,birds:-34,crowd:-34,city:-36};
export const SECTION_TARGET_DB={stream:[null,-50,-38,-42,null,null,null,null],forest:[null,-50,-48,-46,-42,-42,-46,null],ridge:[null,null,null,null,null,null,-39,-33],birds:[null,-52,-52,-54,-56,-56,null,null],city:[null,-52,-60,null,null,null,null,CITY_SUMMIT_ENABLED?-52:null],crowd:[null,null,null,null,null,null,-48,-44]};
export const BUDGET_DB={low:-37,high:-32};
export const STREAM_DISTANCE_M=[[0,60],[800,30],[1070,15],[1500,8],[2000,5],[2595,8],[2800,20],[3000,45],[3246,90]];
export const STREAM_CUTOFF_DB=-58;
export const WIND_FOREST={hMin:100,hMax:560,dbMin:-50,dbMax:-42};
export const WIND_RIDGE={h0:580,h1:640,exposure:{6:.6,7:1},dbBase:-48,dbRange:15,lowpassHz:[1200,3500],gustDb:2.5};
export const INTERMITTENT={birds:{on:[8,14],off:[12,30],upperOn:[6,10],upperOff:[20,45],fade:1.5},crow:{low:[20,70],high:[40,140],peakDb:-30},moktak:{count:[8,12],interval:[.9,1.1],rest:[40,90],start:4800,radius:60,origin:4860}};
export const CROSSFADE_S={jump:1.5,city:12,forest:6,upper:8,summit:6};
export const DUCK={db:-2,attackS:.01,releaseS:.25,minSumDb:-34};
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const dbGain=db=>db===null||db===-Infinity?0:10**(db/20);
export const powerDb=values=>{const p=values.reduce((s,d)=>s+dbGain(d)**2,0);return p?10*Math.log10(p):-Infinity;};
export const ambientSectionAt=m=>surfaceAt(m).section;
export function streamDistance(m){for(let i=1;i<STREAM_DISTANCE_M.length;i++){const [b,y]=STREAM_DISTANCE_M[i],[a,x]=STREAM_DISTANCE_M[i-1];if(m<=b)return x+(y-x)*clamp((m-a)/(b-a));}return 90;}
export const streamDb=d=>{const db=-38-20*Math.log10(Math.max(d,5)/5);return db<STREAM_CUTOFF_DB?null:db;};
// 날씨(weather.js)가 정하는 바람·비 소리. wind는 0~1 소리 세기(null이면 영향 없음), rain은 0~1.
// 바람은 숲·능선 바람 층을 키우거나 줄이고, 비는 새소리를 줄인다. 빗소리 자체는 weather-sound.js가 만든다.
export const WEATHER_SOUND={wind:null,rain:0,listeners:new Set()};
export function setWeatherSound({wind=WEATHER_SOUND.wind,rain=WEATHER_SOUND.rain}={}){
 WEATHER_SOUND.wind=wind===null?null:clamp(wind);WEATHER_SOUND.rain=clamp(rain);for(const f of WEATHER_SOUND.listeners)f(WEATHER_SOUND);
}
export const windShiftDb=wind=>wind===null?0:clamp(14*(wind-.2),-4,10);
export function ambientTargets(m,h,{birds=true,gust=0}={}){
 const section=ambientSectionAt(m),t=clamp((h-WIND_RIDGE.h0)/(WIND_RIDGE.h1-WIND_RIDGE.h0)),e=t*t*(3-2*t)*(WIND_RIDGE.exposure[section]||0),distance=streamDistance(m);
 const forest=WIND_FOREST.dbMin+8*clamp((h-100)/460);
 const shift=windShiftDb(WEATHER_SOUND.wind),rain=WEATHER_SOUND.rain,birdDb=birds&&rain<.6?SECTION_TARGET_DB.birds[section]:null;
 const targets={stream:section<=3?streamDb(distance):null,forest:section<7&&e<1?forest+20*Math.log10(1-e)+shift:null,ridge:e>0?-48+15*e+gust+shift:null,birds:birdDb===null?null:birdDb-14*rain,city:SECTION_TARGET_DB.city[section],crowd:section===7?-44:section===6&&m>=4609?-54+6*clamp((m-4609)/200):null};
 const budgetDb=(section<=5?BUDGET_DB.low:BUDGET_DB.high)+Math.max(0,shift)*.6,sum=powerDb(Object.values(targets)),correction=Math.min(0,budgetDb-sum);
 for(const key in targets)if(targets[key]!==null)targets[key]+=correction;
 return {section,targets,distance,exposure:e,budgetDb,correction,sumRmsDb:powerDb(Object.values(targets))};
}
// 개별 레이어를 전력 공간에서 보간해 전환 도중 합계가 두 끝점의 예산을 넘지 않게 한다.
export function crossfade(from,to,t){t=clamp(t);const a=t===0?1:t===1?0:Math.cos(t*Math.PI/2)**2,b=1-a;return Object.fromEntries(Object.keys(LAYER_FILES).map(k=>[k,Math.sqrt(dbGain(from[k])**2*a+dbGain(to[k])**2*b)]));}
