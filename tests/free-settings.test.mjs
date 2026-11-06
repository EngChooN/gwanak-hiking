import test from 'node:test';
import assert from 'node:assert/strict';
import {devBuild,DEV_BUILD,freeUnlocked,normalizeFree,isManual,loadFree,saveFree,FREE_KEY,presetClock,actualValues,statusLine,chipText,seasonTag,weatherChoiceOf,timeChoiceOf,WEATHER_CHOICES,TIME_CHOICES,SEASON_CHOICES} from '../src/free-settings.js';
import {loadSummits,recordSummit,clearSummits,summitOf,sealDate,formatSec,recordLine,SUMMITS_KEY} from '../src/summit-records.js';
import {MOUNTAINS,mountainById,formatEta} from '../src/mountains.js';
import {sectionJumpEnabled} from '../src/section-jump.js';
import {setTimeOverride,effectiveTime,timeOverridden,sunPosition,resolveUtcMs} from '../src/daytime.js';
import {createWeatherController} from '../src/weather.js';
import {createEnvironment} from '../src/environment.js';
import {SHEETS} from '../src/hud-notebook.js';

// 산 고르기·완등 도장·자유 설정(산개발, 2026-11-06). 사양: docs/UI-산고르기-자유설정-사양.md
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const seoul=(y,mo,d,h=12)=>Date.UTC(y,mo-1,d,h-9);

test('산 목록: 관악산 한 곳, 카드에 필요한 값이 모두 있다', ()=>{
 assert.equal(MOUNTAINS.length,1);
 const g=mountainById('gwanak');
 for(const k of ['id','name','altitudeM','course','distanceKm','etaMin','stamps','difficulty','art'])assert.ok(g[k]!==undefined,k);
 assert.equal(g.name,'관악산');assert.equal(g.altitudeM,632);assert.ok(g.distanceKm>4.5&&g.distanceKm<5.5);assert.equal(g.stamps,6);
 assert.equal(formatEta(150),'2시간 30분');assert.equal(formatEta(60),'1시간');assert.equal(formatEta(45),'45분');
});

test('완등 기록: 처음 날짜는 그대로, 횟수와 가장 빠른 시간이 쌓이고, 지우면 없어진다', ()=>{
 const s=memory();
 assert.deepEqual(loadSummits(s),{});assert.equal(summitOf(loadSummits(s),'gwanak'),null);
 recordSummit(s,'gwanak',{date:'2026-11-06',sec:9000});
 const r=recordSummit(s,'gwanak',{date:'2026-11-07',sec:7960.4});
 assert.deepEqual(r,{first:'2026-11-06',count:2,bestSec:7960,last:'2026-11-07'});
 recordSummit(s,'gwanak',{date:'2026-11-08',sec:9999});
 assert.equal(summitOf(loadSummits(s),'gwanak').bestSec,7960);
 assert.equal(sealDate('2026-11-06'),'2026.11.06');assert.equal(formatSec(7960),'2:12:40');
 assert.equal(recordLine(r).map(([t])=>t).join(''),'완등 2회 · 처음 2026.11.06 · 가장 빠른 2:12:40');
 clearSummits(s);assert.equal(s.getItem(SUMMITS_KEY),null);
 // 깨진 값은 빈 기록
 s.setItem(SUMMITS_KEY,'{oops');assert.deepEqual(loadSummits(s),{});
 s.setItem(SUMMITS_KEY,JSON.stringify({gwanak:{count:0}}));assert.equal(summitOf(loadSummits(s),'gwanak'),null);
});

test('잠금: 완등했거나 개발 버전이면 열린다. 개발 버전 기준은 구간 이동과 같다', ()=>{
 assert.equal(DEV_BUILD,true);
 assert.equal(devBuild(''),true);assert.equal(devBuild('?dev=off'),false);assert.equal(devBuild('?jump=off'),false);
 for(const q of ['','?dev=off','?jump=off','?start=summit'])assert.equal(sectionJumpEnabled(q),devBuild(q),q);
 assert.equal(freeUnlocked({records:{},dev:false}),false);
 assert.equal(freeUnlocked({records:{},dev:true}),true);
 assert.equal(freeUnlocked({records:{gwanak:{first:'2026-11-06',count:1}},dev:false}),true);
});

test('자유 설정 값: 칸 수, 정리, 세션 저장, 현재 그대로', ()=>{
 assert.deepEqual(WEATHER_CHOICES.map(c=>c[2]),['맑음','흐림','비','눈','안개']);
 assert.deepEqual(TIME_CHOICES.map(c=>c[2]),['낮','노을','밤']);
 assert.deepEqual(SEASON_CHOICES.map(c=>c[0]),['spring','summer','autumn','winter']);
 assert.deepEqual(normalizeFree({weather:'rain',time:'x',season:'winter',extra:1}),{weather:'rain',time:null,season:'winter'});
 assert.equal(isManual(normalizeFree({})),false);assert.equal(isManual({weather:null,time:'night',season:null}),true);
 const s=memory();saveFree(s,{weather:'snow',time:'night',season:'winter'});
 assert.deepEqual(loadFree(s),{weather:'snow',time:'night',season:'winter'});
 saveFree(s,{weather:null,time:null,season:null});assert.equal(s.getItem(FREE_KEY),null);
 assert.deepEqual(loadFree(s),{weather:null,time:null,season:null});
 assert.equal(weatherChoiceOf('cloud'),'clear');assert.equal(weatherChoiceOf('overcast'),'overcast');
 assert.equal(timeChoiceOf(30),'day');assert.equal(timeChoiceOf(3),'dusk');assert.equal(timeChoiceOf(-10),'night');
});

test('시간 고르기: 낮·노을·밤이 그 날짜의 해 높이에 맞는 시각이 된다', ()=>{
 for(const day of [seoul(2026,11,6),seoul(2026,6,21),seoul(2026,12,22)]){
  assert.equal(presetClock('day',day),'12:00');
  const at=t=>sunPosition(resolveUtcMs({time:t,nowMs:day}).utcMs).elevation;
  assert.equal(timeChoiceOf(at(presetClock('day',day))),'day');
  assert.equal(timeChoiceOf(at(presetClock('dusk',day))),'dusk',presetClock('dusk',day));
  assert.equal(timeChoiceOf(at(presetClock('night',day))),'night',presetClock('night',day));
 }
 assert.equal(presetClock('nope'),null);
});

test('시간 덮어쓰기: ?time=보다 앞서고, 지우면 원래 규칙으로 돌아간다(환경도 따라감)', ()=>{
 try{
  assert.equal(effectiveTime('15:00'),'15:00');assert.equal(timeOverridden(),false);
  setTimeOverride('20:30');assert.equal(effectiveTime('15:00'),'20:30');assert.equal(effectiveTime(null),'20:30');
  const env=createEnvironment({search:'?time=11:00&weather=clear',nowMs:()=>seoul(2026,11,6,14)});
  env.update(0);assert.equal(env.info.timeLabel,'20:30');assert.equal(env.info.sunDown,true);assert.equal(env.info.freeTime,true);
  setTimeOverride(null);env.update(0);assert.equal(env.info.timeLabel,'11:00');
  assert.equal(setTimeOverride('nonsense'),null);assert.equal(timeOverridden(),false);
 }finally{setTimeOverride(null);}
});

test('날씨 덮어쓰기: 고른 날씨로 바로 바뀌고, 실제 날씨는 계속 따로 기억한다', async ()=>{
 const sample={current:{weather_code:0,cloud_cover:5,visibility:30000,wind_speed_10m:2,rain:0,snowfall:0,time:'2026-11-06T14:00'}};
 const seen=[],c=createWeatherController({search:'',fetchImpl:async()=>({ok:true,json:async()=>sample}),now:()=>Date.parse('2026-11-06T14:05+09:00'),onChange:s=>seen.push(s.kind),setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
 await c.refresh();assert.equal(c.state.kind,'clear');
 assert.equal(c.setOverride('snow'),true);assert.equal(c.state.kind,'snow');assert.equal(c.state.source,'free');assert.ok(c.state.look.snow>0);assert.equal(c.state.real.kind,'clear');
 await c.refresh();assert.equal(c.state.kind,'snow','새로 받아도 고른 날씨 유지');assert.equal(c.state.real.source,'api');
 assert.equal(c.setOverride('tornado'),false);assert.equal(c.state.kind,'snow');
 c.setOverride(null);assert.equal(c.state.kind,'clear');assert.equal(c.state.source,'api');assert.equal(c.state.look.snow,0);
 // ?weather=도 그대로: 고른 날씨를 지우면 주소의 날씨로 돌아간다.
 const m=createWeatherController({search:'?weather=rain',setIntervalImpl:()=>1});
 m.setOverride('fog');assert.equal(m.state.kind,'fog');m.setOverride(null);assert.equal(m.state.kind,'rain');assert.equal(m.state.source,'manual');
});

test('상태 줄·꼬리표·카드 꼬리표 글자', ()=>{
 const actual=actualValues({nowMs:seoul(2026,11,6,14),weatherKind:'cloud'});
 assert.deepEqual(actual,{weather:'clear',time:'day',season:'autumn'});
 assert.deepEqual(statusLine({weather:null,time:null,season:null},actual),{manual:false,head:'지금은 실제 서울을 따라가요',sub:'가을 · 맑음 · 낮'});
 const picked={weather:'snow',time:'night',season:'winter'};
 assert.equal(statusLine(picked,actual).head,'✎ 직접 고른 설정 · 겨울 · 눈 · 밤');
 assert.deepEqual(chipText(picked),{long:'✎ ❄ 눈 · 밤 · 겨울 직접 고름',short:'✎ ❄ 눈'});
 assert.equal(chipText({weather:null,time:null,season:null}),null);
 assert.equal(seasonTag({season:null},'autumn'),'🍁 지금 가을 · 단풍');
 assert.equal(seasonTag({season:'winter'},'autumn'),'✎ 고른 계절 · 겨울 · 눈');
});

test('설정 탭 시트에 자유 설정(free)이 있다', ()=>{
 assert.ok(SHEETS.includes('free'));
});
