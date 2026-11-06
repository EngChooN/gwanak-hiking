// 자유 설정(완등한 산에서 날씨·시간·계절·출발 지점을 직접 고르기)의 순수 로직. 화면은 free-settings-ui.js.
// 사양: docs/UI-산고르기-자유설정-사양.md §3. three를 쓰지 않는다(node --test로 검사).
//  - 값: {weather:null|'clear'|'overcast'|'rain'|'snow'|'fog', time:null|'day'|'dusk'|'night', season:null|봄·여름·가을·겨울}
//    null = '현재 그대로'(실제 서울의 날씨·시각·날짜). 출발 지점은 값으로 남기지 않고 그때 한 번 옮긴다.
//  - 저장: sessionStorage(같은 탭에서 다시 열려도 유지, 새로 들어오면 현재 그대로).
//  - main.js에는 'hiking:free-settings' 이벤트(바뀐 칸만)로 넘긴다. 시간은 기존 ?time= 처리(daytime.js)를, 날씨는 ?weather= 처리(weather.js)를 그대로 쓴다.
import {sunPosition,seoulClock,SEOUL_OFFSET_MS} from './daytime.js';
import {SEASONS,SEASON_LABEL,SEASON_ICON,seasonForDate} from './season.js';
import {summitOf} from './summit-records.js';

// 개발 버전: 완등하지 않아도 자유 설정이 열린다. 구간 이동 버튼(section-jump.js)과 같은 조건이다.
// 지금 GitHub Pages 배포본도 개발 버전이다. ?dev=off(또는 ?jump=off)를 붙이면 잠긴 모습을 볼 수 있다.
export const DEV_BUILD=true;
export function devBuild(search=globalThis.location?.search??''){
 const q=new URLSearchParams(search);return DEV_BUILD&&q.get('dev')!=='off'&&q.get('jump')!=='off';
}
export const freeUnlocked=({records,mountain='gwanak',dev=false})=>dev||!!summitOf(records,mountain);

export const WEATHER_CHOICES=Object.freeze([['clear','☀','맑음'],['overcast','☁','흐림'],['rain','🌧','비'],['snow','❄','눈'],['fog','🌫','안개']]);
export const TIME_CHOICES=Object.freeze([['day','☀','낮'],['dusk','🌇','노을'],['night','🌙','밤']]);
export const SEASON_CHOICES=Object.freeze(SEASONS.map(s=>[s,SEASON_ICON[s],{spring:'봄 벚꽃',summer:'여름',autumn:'가을 단풍',winter:'겨울 눈'}[s]]));
const has=(list,v)=>list.some(c=>c[0]===v);
// 실제 날씨 6종 → 고르기 5칸. '구름'은 맑음 칸에 넣는다.
export const weatherChoiceOf=kind=>kind==='cloud'?'clear':has(WEATHER_CHOICES,kind)?kind:'clear';
// 해 높이 → 낮·노을·밤(hud-notebook.js timeOfDay와 같은 경계).
export const timeChoiceOf=elevation=>!Number.isFinite(elevation)?'day':elevation< -4?'night':elevation<8?'dusk':'day';

export const EMPTY_FREE=Object.freeze({weather:null,time:null,season:null});
export function normalizeFree(v){
 const o=v&&typeof v==='object'?v:{};
 return {weather:has(WEATHER_CHOICES,o.weather)?o.weather:null,time:has(TIME_CHOICES,o.time)?o.time:null,season:SEASONS.includes(o.season)?o.season:null};
}
export const isManual=f=>!!(f&&(f.weather||f.time||f.season));
export const FREE_KEY='gwanak-free-settings',FREE_START_KEY='gwanak-free-start';
export function loadFree(storage){try{return normalizeFree(JSON.parse(storage?.getItem(FREE_KEY)||'null'));}catch{return {...EMPTY_FREE};}}
export function saveFree(storage,f){try{if(isManual(f))storage?.setItem(FREE_KEY,JSON.stringify(normalizeFree(f)));else storage?.removeItem(FREE_KEY);}catch{}}

// 낮·노을·밤 → 오늘 서울의 'HH:MM'. 노을은 해 높이 3°(저녁), 밤은 −14° 아래가 되는 첫 시각이다(날짜마다 다르다).
const pad=n=>String(n).padStart(2,'0');
export function presetClock(preset,nowMs=Date.now()){
 if(preset==='day')return '12:00';
 if(preset!=='dusk'&&preset!=='night')return null;
 const c=seoulClock(nowMs),midnight=Date.UTC(c.year,c.month-1,c.day)-SEOUL_OFFSET_MS,goal=preset==='dusk'?3:-14;
 for(let m=14*60;m<=23*60+50;m+=5)if(sunPosition(midnight+m*60000).elevation<=goal)return `${pad(Math.floor(m/60))}:${pad(m%60)}`;
 return preset==='dusk'?'17:30':'22:00';
}
// 지금 실제 값(현재 그대로일 때 보이는 것). weatherKind는 실제 날씨 종류(환경 이벤트의 realKind).
export function actualValues({nowMs=Date.now(),weatherKind='clear'}={}){
 return {weather:weatherChoiceOf(weatherKind),time:timeChoiceOf(sunPosition(nowMs).elevation),season:seasonForDate(nowMs)};
}
const label=(list,v)=>list.find(c=>c[0]===v)?.[2]??'';
const icon=(list,v)=>list.find(c=>c[0]===v)?.[1]??'';
// 상태 줄(사양 §3-2-1). 직접 고른 값만 앞에 적는다.
export function statusLine(free,actual){
 if(!isManual(free))return {manual:false,head:'지금은 실제 서울을 따라가요',sub:[SEASON_LABEL[actual.season],label(WEATHER_CHOICES,actual.weather),label(TIME_CHOICES,actual.time)].filter(Boolean).join(' · ')};
 const picked=[free.season&&SEASON_LABEL[free.season],free.weather&&label(WEATHER_CHOICES,free.weather),free.time&&label(TIME_CHOICES,free.time)].filter(Boolean);
 return {manual:true,head:`✎ 직접 고른 설정 · ${picked.join(' · ')}`,sub:'나머지는 실제 서울을 따라가요'};
}
// 오른쪽 위 시각·날씨 꼬리표(사양 §3-3): '✎ ❄ 눈 · 밤 · 겨울 직접 고름', 좁은 화면은 '✎ ❄ 밤'.
export function chipText(free){
 if(!isManual(free))return null;
 const ic=free.weather?icon(WEATHER_CHOICES,free.weather):free.time?icon(TIME_CHOICES,free.time):SEASON_ICON[free.season];
 const words=[free.weather&&label(WEATHER_CHOICES,free.weather),free.time&&label(TIME_CHOICES,free.time),free.season&&SEASON_LABEL[free.season]].filter(Boolean);
 return {long:`✎ ${ic} ${words.join(' · ')} 직접 고름`,short:`✎ ${ic} ${words[0]}`};
}
// 산 고르기 카드 그림의 꼬리표: '🍁 지금 가을 · 단풍' 또는 '✎ 고른 계절 · 겨울 · 눈'
const SEASON_LONG={spring:'봄 · 벚꽃',summer:'여름',autumn:'가을 · 단풍',winter:'겨울 · 눈'};
export const seasonTag=(free,actualSeason)=>free?.season?`✎ 고른 계절 · ${SEASON_LONG[free.season]}`:`${SEASON_ICON[actualSeason]} 지금 ${SEASON_LONG[actualSeason]}`;
