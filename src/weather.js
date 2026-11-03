// 실시간 날씨: Open-Meteo(키 없음, CC BY 4.0) 현재값 → 6단계(맑음·구름·흐림·비·눈·안개) → 화면 표현값.
// 근거: docs/실시간날씨-기준.md. 코드 묶음은 문서 표(WMO) 기준이고, 구름량·연무·빛 수치는 설계 제안값이다.
export const WEATHER_POINT={lat:37.4453,lon:126.9640};
export const REFRESH_MS=10*60*1000,TIMEOUT_MS=8000,STALE_MS=60*60*1000;
export const ATTRIBUTION={text:'날씨 정보: Open-Meteo.com (CC BY 4.0)',href:'https://open-meteo.com/',licence:'https://creativecommons.org/licenses/by/4.0/'};
export const MANUAL_ALIASES={clear:'clear',sunny:'clear',cloud:'cloud',cloudy:'cloud',overcast:'overcast',rain:'rain',snow:'snow',fog:'fog'};
export const KIND_LABEL={clear:'맑음',cloud:'구름',overcast:'흐림',rain:'비',snow:'눈',fog:'안개'};
export const KIND_ICON={clear:'☀',cloud:'⛅',overcast:'☁',rain:'🌧',snow:'❄',fog:'🌫'};
const RAIN={51:'light',53:'medium',55:'heavy',56:'light',57:'heavy',61:'light',63:'medium',65:'heavy',66:'light',67:'heavy',80:'light',81:'medium',82:'heavy',95:'heavy',96:'heavy',97:'heavy',99:'heavy'};
const SNOW={71:'light',73:'medium',75:'heavy',77:'light',85:'light',86:'heavy'};
const FOG={45:'medium',48:'heavy'};
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
// 우선순위: 눈 > 비 > 안개 > 흐림 > 구름 > 맑음. 코드와 모순되면 snowfall·rain·visibility로 보정한다.
export function classifyWeather({code=null,cloudCover=null,visibility=null,rain=null,snowfall=null}={}){
 code=num(code);cloudCover=num(cloudCover);visibility=num(visibility);rain=num(rain);snowfall=num(snowfall);
 if(code in SNOW)return {kind:'snow',level:SNOW[code]};
 if(snowfall>0)return {kind:'snow',level:snowfall>=1?'heavy':snowfall>=.3?'medium':'light'};
 if(code in RAIN)return {kind:'rain',level:RAIN[code]};
 if(rain>.1)return {kind:'rain',level:rain>=4?'heavy':rain>=1?'medium':'light'};
 if(code in FOG)return {kind:'fog',level:FOG[code]};
 if(code!==null&&code<=3||code===null&&cloudCover===null){
  if(visibility!==null&&visibility<1000)return {kind:'fog',level:'light'};
  return {kind:code===3?'overcast':code===2?'cloud':code===null?'clear':'clear',level:null};
 }
 // 표에 없는 코드(4, 10~44 등)와 값이 비어 있는 경우는 구름량으로 판정한다.
 if(cloudCover===null)return {kind:'clear',level:null};
 return {kind:cloudCover<=25?'clear':cloudCover<=70?'cloud':'overcast',level:null};
}
// 풍속(m/s) → 바람 소리 세기 0~1. 경계는 보퍼트 풍력 계급(0.5, 3.4, 8.0, 13.9).
export function windSoundLevel(ms){
 ms=num(ms);if(ms===null)return .2;
 return ms<.5?.05:ms<3.4?.2:ms<8?.5:ms<13.9?.8:1;
}
const LEVEL_SCALE={light:.3,medium:.6,heavy:1};
const TABLE={
 clear:{cloud:.05,sun:1,amb:1,fog:15000},
 cloud:{cloud:.45,sun:.75,amb:.95,fog:12000},
 overcast:{cloud:.85,sun:.3,amb:.9,fog:7000},
 rain:{cloud:.95,sun:.15,amb:.75,fog:{light:4000,medium:2500,heavy:1200}},
 snow:{cloud:.9,sun:.25,amb:1,fog:{light:4000,medium:2500,heavy:1000}},
 fog:{cloud:1,sun:.1,amb:.9,fog:{medium:400,heavy:200}}
};
// 날씨 → 화면 표현 목표값. visibility(m)가 오면 맑음·구름·흐림의 연무 거리에 그대로 쓴다.
export function weatherLook({kind='clear',level=null,windSpeed=null,visibility=null}={}){
 const t=TABLE[kind]??TABLE.clear,lv=level??(kind==='rain'||kind==='snow'?'medium':kind==='fog'?'medium':null);
 let fogDistance=typeof t.fog==='number'?t.fog:t.fog[lv]??t.fog.medium;
 if(num(visibility)!==null&&typeof t.fog==='number')fogDistance=Math.max(1500,Math.min(visibility,t.fog));
 const amount=LEVEL_SCALE[lv]??0;
 return {kind,level:lv,cloud:t.cloud,sunMul:t.sun,ambientMul:t.amb,fogDistance,
  gray:kind==='clear'?0:kind==='cloud'?.18:kind==='overcast'?.7:kind==='rain'?.85:kind==='snow'?.5:.9,
  starsMul:kind==='clear'?1:kind==='cloud'?.5:kind==='overcast'?.12:0,
  rain:kind==='rain'?amount:0,snow:kind==='snow'?amount:0,
  windSpeed:num(windSpeed)??2,windSound:windSoundLevel(windSpeed)};
}
export function apiUrl({lat=WEATHER_POINT.lat,lon=WEATHER_POINT.lon}={}){
 // 모델을 지정하지 않는다(kma_* 는 현재값이 null). 풍속 단위는 반드시 m/s.
 return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,precipitation,rain,snowfall,is_day,temperature_2m&wind_speed_unit=ms&timezone=Asia%2FSeoul`;
}
// 응답의 current.time(Asia/Seoul 문자열)이 1시간 넘게 지났으면 오래된 값으로 보고 버린다.
export function parseCurrent(json,nowMs=Date.now()){
 const c=json?.current;if(!c||typeof c!=='object')return null;
 if(num(c.weather_code)===null&&num(c.cloud_cover)===null)return null;
 if(typeof c.time==='string'){const t=Date.parse(c.time+'+09:00');if(Number.isFinite(t)&&nowMs-t>STALE_MS)return null;}
 return {code:num(c.weather_code),cloudCover:num(c.cloud_cover),visibility:num(c.visibility),windSpeed:num(c.wind_speed_10m),rain:num(c.rain),snowfall:num(c.snowfall),temperature:num(c.temperature_2m)};
}
export async function fetchCurrentWeather({fetchImpl=globalThis.fetch,timeoutMs=TIMEOUT_MS,now=Date.now}={}){
 if(typeof fetchImpl!=='function')throw new Error('fetch 없음');
 const ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl?setTimeout(()=>ctl.abort(),timeoutMs):null;
 try{
  const res=await Promise.race([fetchImpl(apiUrl(),{signal:ctl?.signal,cache:'no-store'}),new Promise((_,rej)=>setTimeout(()=>rej(new Error('시간 초과')),timeoutMs+50))]);
  if(!res.ok)throw new Error('HTTP '+res.status);
  const parsed=parseCurrent(await res.json(),now());if(!parsed)throw new Error('유효하지 않은 응답');return parsed;
 }finally{if(timer)clearTimeout(timer);}
}
// ?weather=rain&level=heavy → 수동 지정. 알 수 없는 값은 null(수동 아님).
export function manualWeather(search){
 const q=new URLSearchParams(search),kind=MANUAL_ALIASES[(q.get('weather')??'').toLowerCase()];if(!kind)return null;
 const level=['light','medium','heavy'].includes(q.get('level'))?q.get('level'):null,wind=Number(q.get('wind'));
 return {kind,level,windSpeed:q.has('wind')&&Number.isFinite(wind)?wind:null};
}
export const CLEAR_FALLBACK={kind:'clear',level:null};
// 현재 날씨 보관소. 실패·오프라인·수동 아님 → 맑음 대체. start()는 즉시 1회 + 10분 간격 호출.
export function createWeatherController({search=globalThis.location?.search??'',fetchImpl=globalThis.fetch,now=Date.now,intervalMs=REFRESH_MS,onChange=()=>{},setIntervalImpl=setInterval,clearIntervalImpl=clearInterval,isOnline=()=>globalThis.navigator?.onLine!==false}={}){
 const manual=manualWeather(search);
 const state={source:manual?'manual':'fallback',...(manual??CLEAR_FALLBACK),windSpeed:manual?.windSpeed??null,visibility:null,fetchedAt:null,error:null,calls:0};
 state.look=weatherLook(state);let timer=null,busy=false;
 const apply=patch=>{Object.assign(state,patch);state.look=weatherLook(state);onChange(state);};
 async function refresh(){
  if(manual||busy)return state;
  if(!isOnline()){apply({source:'fallback',...CLEAR_FALLBACK,windSpeed:null,visibility:null,error:'오프라인'});return state;}
  busy=true;state.calls++;
  try{
   const cur=await fetchCurrentWeather({fetchImpl,now});
   apply({source:'api',...classifyWeather(cur),windSpeed:cur.windSpeed,visibility:cur.visibility,fetchedAt:now(),error:null});
  }catch(e){apply({source:'fallback',...CLEAR_FALLBACK,windSpeed:null,visibility:null,error:e?.message??String(e)});}
  finally{busy=false;}
  return state;
 }
 function start(){if(timer)return;if(manual){onChange(state);return;}void refresh();timer=setIntervalImpl(refresh,intervalMs);}
 function stop(){if(timer){clearIntervalImpl(timer);timer=null;}}
 return {state,refresh,start,stop,manual:!!manual};
}
