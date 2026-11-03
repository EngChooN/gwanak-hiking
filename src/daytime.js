// 서울(Asia/Seoul) 현재 시각 → 태양·달 위치 → 하늘·방향광·노출·연무색.
// 날씨 반영은 composeEnvironment()에서 weatherLook(weather.js)과 합친다. 수치는 설계 제안값이며 화면을 보며 조정한다.
export const SEOUL_OFFSET_MS=9*3600*1000;
export const GWANAK={lat:37.4453,lon:126.9640};
const RAD=Math.PI/180,DAY_MS=86400000;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
export const wrap360=d=>((d%360)+360)%360;

// 서울은 일광절약시간이 없어 UTC+9 고정이다.
export function seoulClock(utcMs){
 const d=new Date(utcMs+SEOUL_OFFSET_MS),pad=n=>String(n).padStart(2,'0');
 const year=d.getUTCFullYear(),month=d.getUTCMonth()+1,day=d.getUTCDate(),hour=d.getUTCHours(),minute=d.getUTCMinutes();
 return {year,month,day,hour,minute,label:`${pad(hour)}:${pad(minute)}`,date:`${year}-${pad(month)}-${pad(day)}`};
}
// "15:00" 또는 "1530" → 분. 잘못된 값은 null.
export function parseClock(text){
 const m=/^(\d{1,2}):?(\d{2})$/.exec(String(text??'').trim());if(!m)return null;
 const h=Number(m[1]),min=Number(m[2]);return h<24&&min<60?h*60+min:null;
}
// ?time=HH:MM 은 서울 오늘 날짜의 그 시각. 없으면 지금.
export function resolveUtcMs({time=null,nowMs=Date.now()}={}){
 const minutes=parseClock(time);if(minutes===null)return {utcMs:nowMs,manual:false};
 const c=seoulClock(nowMs),midnightSeoul=Date.UTC(c.year,c.month-1,c.day)-SEOUL_OFFSET_MS;
 return {utcMs:midnightSeoul+minutes*60000,manual:true};
}

// 태양: 저정밀 천문 공식(NOAA 방식). 고도(°)와 북에서 시계 방향 방위(°). 대기 굴절은 넣지 않는다.
export function sunPosition(utcMs,lat=GWANAK.lat,lon=GWANAK.lon){
 const jd=utcMs/DAY_MS+2440587.5,n=jd-2451545;
 const L=wrap360(280.460+0.9856474*n),g=wrap360(357.528+0.9856003*n)*RAD;
 const lambda=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*RAD,eps=(23.439-0.0000004*n)*RAD;
 const ra=Math.atan2(Math.cos(eps)*Math.sin(lambda),Math.cos(lambda)),dec=Math.asin(Math.sin(eps)*Math.sin(lambda));
 return horizontal(ra,dec,jd,lat,lon);
}
function horizontal(ra,dec,jd,lat,lon){
 const gmst=wrap360(280.46061837+360.98564736629*(jd-2451545)),lst=(gmst+lon)*RAD,ha=lst-ra,phi=lat*RAD;
 const sinAlt=Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(ha);
 const alt=Math.asin(clamp(sinAlt,-1,1)),az=Math.atan2(-Math.cos(dec)*Math.sin(ha),Math.sin(dec)*Math.cos(phi)-Math.cos(dec)*Math.sin(phi)*Math.cos(ha));
 return {elevation:alt/RAD,azimuth:wrap360(az/RAD)};
}
// 달: 간략 월력(오차 수 도). 위상은 태양과의 이각으로 구한다. 하늘에 원반을 놓는 용도로는 충분하다.
export function moonPosition(utcMs,lat=GWANAK.lat,lon=GWANAK.lon){
 const jd=utcMs/DAY_MS+2440587.5,d=jd-2451543.5,r=Math.PI/180;
 const Ls=wrap360(280.460+0.9856474*d);
 const Lm=wrap360(218.316+13.176396*d),M=wrap360(134.963+13.064993*d)*r,F=wrap360(93.272+13.229350*d)*r,D=wrap360(Lm-Ls)*r;
 const lon_=(Lm+6.289*Math.sin(M)+1.274*Math.sin(2*D-M)+0.658*Math.sin(2*D)+0.214*Math.sin(2*M)-0.186*Math.sin(wrap360(357.528+0.9856003*d)*r))*r;
 const lat_=(5.128*Math.sin(F)+0.280*Math.sin(M+F)+0.277*Math.sin(M-F))*r,eps=23.439*r;
 const ra=Math.atan2(Math.sin(lon_)*Math.cos(eps)-Math.tan(lat_)*Math.sin(eps),Math.cos(lon_)),dec=Math.asin(Math.sin(lat_)*Math.cos(eps)+Math.cos(lat_)*Math.sin(eps)*Math.sin(lon_));
 const pos=horizontal(ra,dec,jd,lat,lon),elongation=wrap360(Lm-Ls);
 return {...pos,illumination:(1-Math.cos(elongation*r))/2};
}

export const hexToRgb=h=>{const v=parseInt(h.slice(1),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];};
export const rgbToHex=c=>'#'+c.map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('');
const mixRgb=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
// 태양 고도 기준 키 프레임. 맨 위(25°↑)가 기존 낮 맑음 기준(LOOK_PROFILE)과 같다.
const KEYS=[
 {e:-18,zenith:'#050912',horizon:'#0b1224',haze:'#0a101e',sunColor:'#7f93c8',sun:0,amb:.05},
 {e:-8,zenith:'#0e1c3d',horizon:'#3b3f66',haze:'#262c4a',sunColor:'#c77f6a',sun:0,amb:.09},
 {e:-3,zenith:'#27427a',horizon:'#e08a6a',haze:'#b27a78',sunColor:'#ff9a5a',sun:.04,amb:.2},
 {e:1,zenith:'#3c5f9c',horizon:'#f6a56b',haze:'#d89c82',sunColor:'#ff9d57',sun:.3,amb:.5},
 {e:6,zenith:'#4678b8',horizon:'#f1c9a0',haze:'#c9b4a4',sunColor:'#ffc58b',sun:.62,amb:.72},
 {e:14,zenith:'#4980c2',horizon:'#cde0ec',haze:'#a9c3de',sunColor:'#ffe3c2',sun:.88,amb:.85},
 {e:25,zenith:'#4A86C8',horizon:'#BAD6EE',haze:'#9DBEDF',sunColor:'#FFF1DE',sun:1,amb:1}
].map(k=>({...k,zenith:hexToRgb(k.zenith),horizon:hexToRgb(k.horizon),haze:hexToRgb(k.haze),sunColor:hexToRgb(k.sunColor)}));
export function skyKeyframe(elevation){
 const e=clamp(elevation,KEYS[0].e,KEYS.at(-1).e);let i=1;while(i<KEYS.length-1&&e>KEYS[i].e)i++;
 const a=KEYS[i-1],b=KEYS[i],t=smooth(a.e,b.e,e);
 return {zenith:mixRgb(a.zenith,b.zenith,t),horizon:mixRgb(a.horizon,b.horizon,t),haze:mixRgb(a.haze,b.haze,t),sunColor:mixRgb(a.sunColor,b.sunColor,t),sun:lerp(a.sun,b.sun,t),amb:lerp(a.amb,b.amb,t)};
}
// 별·달·야경은 태양이 지평선 아래 4°를 지나며 서서히 나타난다.
export const nightAmount=elevation=>smooth(-2,-12,elevation);

const NEUTRAL_WEATHER={rain:0,snow:0,windSpeed:2,windSound:.2,cloud:0.05,sunMul:1,ambientMul:1,gray:0,fogDistance:Infinity,fogTint:0,starsMul:1};
// 반구광(그늘을 채우는 하늘빛): 맑은 낮은 푸른 하늘색 그대로, 흐림·비·안개일수록 중성 회색, 해가 낮으면(14° 이하) 따뜻하게. 밤은 기존 푸른 색.
const HEMI_CLEAR=hexToRgb('#CFE0F5'),HEMI_OVERCAST=hexToRgb('#D9D8D3'),HEMI_WARM=hexToRgb('#EBCDAA');
export function hemiColor(elevation,night,gray){
 const day=mixRgb(HEMI_CLEAR,HEMI_OVERCAST,smooth(0,.9,gray)),low=1-smooth(3,14,elevation);
 return mixRgb(mixRgb(day,HEMI_WARM,low*(1-.5*gray)*.8),[.36,.43,.64],night);
}
// 구워 둔 푸른 환경광(IBL) 대신 중성·따뜻한 반구광으로 채울 비율(0~1). 흐림이면 회색도, 해가 낮은 오후·노을(14° 이하)이면 그만큼, 밤은 푸른 박명 그대로(0).
export const iblNeutral=(elevation,night,gray)=>clamp(gray+(1-gray)*(1-smooth(3,14,elevation))*(1-night)*.75);
// 시각 + 날씨 → 화면 매개변수. 모두 렌더 쪽에서 프레임마다 부드럽게 따라가는 목표값이다.
export function composeEnvironment({sun,moon,weather=NEUTRAL_WEATHER}){
 const k=skyKeyframe(sun.elevation),night=nightAmount(sun.elevation),w={...NEUTRAL_WEATHER,...weather};
 // 날씨가 나쁠수록 하늘을 밝기가 같은 회색 쪽으로 보내 채도를 죽인다.
 const grayOf=c=>{const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return [l,l,l];};
 const dim=lerp(1,.8,w.gray);
 const sky=c=>mixRgb(c,grayOf(c).map(v=>v*dim),w.gray);
 const moonUp=smooth(-2,8,moon.elevation),moonLight=night*moonUp*(.25+.75*moon.illumination)*.14;
 // 낮 태양이 지면 위일 때는 태양, 지면 아래면 달이 방향광이 된다.
 const useSun=sun.elevation>-1.5,lightElevation=useSun?sun.elevation:moon.elevation,lightAzimuth=useSun?sun.azimuth:moon.azimuth;
 const sunIntensity=useSun?k.sun*w.sunMul:moonLight*w.sunMul;
 const lightColor=useSun?k.sunColor:[.62,.72,.95];
 const nightAmbient=.12+.06*moonUp*moon.illumination;
 const ambient=Math.max(k.amb*w.ambientMul,night*nightAmbient);
 const haze=sky(k.haze),horizon=sky(k.horizon),zenith=sky(k.zenith);
 return {
  elevation:sun.elevation,azimuth:sun.azimuth,night,
  light:{elevation:lightElevation,azimuth:lightAzimuth,color:lightColor,intensity:sunIntensity,castShadow:sunIntensity>.03&&lightElevation>1},
  gray:w.gray,neutral:iblNeutral(sun.elevation,night,w.gray),ambient,exposureMul:lerp(1,1.9,night)*lerp(1,1.3,smooth(.3,1,w.gray)),
  hemiColor:hemiColor(sun.elevation,night,w.gray),
  zenith,horizon,haze,fogColor:haze,
  cloud:w.cloud,cloudColor:mixRgb([.97,.98,1],[.55,.58,.64],w.gray).map(v=>v*lerp(.04,1,smooth(-12,4,sun.elevation))),
  sunGlow:clamp((1-w.cloud*1.1))*Math.max(.15,k.sun)*(useSun?1:0),
  stars:night*w.starsMul,moon:{elevation:moon.elevation,azimuth:moon.azimuth,visible:night*moonUp*w.starsMul*(1-.5*w.gray),illumination:moon.illumination},
  city:night*clamp(.4+.6*(1-w.gray*.6)),
  fogDistance:w.fogDistance,rain:w.rain,snow:w.snow,windSpeed:w.windSpeed,windSound:w.windSound
 };
}
