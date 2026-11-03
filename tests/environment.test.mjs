import test from 'node:test';
import assert from 'node:assert/strict';
import {sunPosition,moonPosition,seoulClock,resolveUtcMs,parseClock,skyKeyframe,nightAmount,composeEnvironment,SEOUL_OFFSET_MS} from '../src/daytime.js';
import {classifyWeather,windSoundLevel,weatherLook,parseCurrent,apiUrl,manualWeather,createWeatherController,fetchCurrentWeather,REFRESH_MS,ATTRIBUTION} from '../src/weather.js';
import {easeTo,createEnvironment} from '../src/environment.js';
import {staminaView,buttonView,environmentView} from '../src/hud.js';
import {setWeatherSound,WEATHER_SOUND,ambientTargets,windShiftDb} from '../src/ambient-config.js';
const seoul=(h,m=0,day=3)=>Date.UTC(2026,10,day,h,m)-SEOUL_OFFSET_MS;

test('서울 시각: UTC+9, 날짜 경계',()=>{
 assert.equal(seoulClock(Date.UTC(2026,10,2,15,0)).label,'00:00');assert.equal(seoulClock(Date.UTC(2026,10,2,15,0)).date,'2026-11-03');
 assert.equal(parseClock('15:00'),900);assert.equal(parseClock('1530'),930);assert.equal(parseClock('25:00'),null);assert.equal(parseClock('abc'),null);
 const r=resolveUtcMs({time:'21:30',nowMs:Date.UTC(2026,10,3,3,0)});assert.equal(r.manual,true);assert.equal(seoulClock(r.utcMs).label,'21:30');assert.equal(seoulClock(r.utcMs).date,'2026-11-03');
 assert.equal(resolveUtcMs({nowMs:5}).utcMs,5);
});
test('태양: 11/3 서울 15시는 산리서치 계산값(고도 25°, 방위 224°)과 일치, 정오 남향, 밤은 지평선 아래',()=>{
 const p=sunPosition(seoul(15));assert.ok(Math.abs(p.elevation-25)<1,p.elevation);assert.ok(Math.abs(p.azimuth-224)<2,p.azimuth);
 const am=sunPosition(seoul(10));assert.ok(Math.abs(am.elevation-29)<1.5&&Math.abs(am.azimuth-142)<3,JSON.stringify(am));
 const noon=sunPosition(seoul(12,25));assert.ok(noon.elevation>30&&Math.abs(noon.azimuth-180)<8);
 assert.ok(sunPosition(seoul(23)).elevation<-30);
 assert.ok(sunPosition(seoul(17,20)).elevation>-3&&sunPosition(seoul(17,20)).elevation<3,'일몰 17시 20분 무렵');
 assert.ok(sunPosition(seoul(7,0)).elevation<3,'일출 직후');
});
test('달: 위상은 0~1, 고도·방위 범위',()=>{
 const m=moonPosition(seoul(21));assert.ok(m.illumination>=0&&m.illumination<=1);assert.ok(m.elevation>=-90&&m.elevation<=90&&m.azimuth>=0&&m.azimuth<360);
 const full=moonPosition(Date.UTC(2026,10,24,13,0)),newMoon=moonPosition(Date.UTC(2026,10,9,22,0));assert.ok(full.illumination>.9,full.illumination);assert.ok(newMoon.illumination<.1,newMoon.illumination);
});
test('하늘 키프레임: 높은 태양은 낮 기준색, 밤은 어둡고, 노을은 따뜻한 지평선',()=>{
 const day=skyKeyframe(29),sunset=skyKeyframe(1),night=skyKeyframe(-20);
 assert.equal(day.sun,1);assert.equal(day.amb,1);assert.ok(night.sun===0&&night.amb<.1);
 assert.ok(sunset.horizon[0]>sunset.horizon[2],'노을 지평선은 붉은 쪽');assert.ok(day.horizon[2]>day.horizon[0],'낮은 푸른 쪽');
 assert.equal(nightAmount(10),0);assert.equal(nightAmount(-20),1);assert.ok(nightAmount(-7)>0&&nightAmount(-7)<1);
});
const env=(h,look)=>composeEnvironment({sun:sunPosition(seoul(h)),moon:moonPosition(seoul(h)),weather:look});
test('시각별 환경: 낮 맑음은 기준값, 밤은 별·달·야경·방향광 약함, 노을은 낮은 태양',()=>{
 const d=env(12),n=env(23),e=env(17,5);
 assert.ok(d.light.intensity>.95&&d.ambient>.95&&d.night===0&&d.stars===0&&d.exposureMul===1);
 assert.ok(n.night===1&&n.stars>.9&&n.city>.9&&n.light.intensity<.15&&n.ambient<.12&&n.exposureMul>1.5);
 assert.ok(e.light.elevation<8&&e.light.intensity<d.light.intensity&&e.light.color[0]>e.light.color[2]);
});
test('날씨가 하늘을 바꾼다: 흐림은 직사광↓·구름↑·별↓, 비·눈 입자',()=>{
 const clear=env(12,weatherLook({kind:'clear'})),over=env(12,weatherLook({kind:'overcast'})),rain=env(12,weatherLook({kind:'rain',level:'heavy'})),snow=env(12,weatherLook({kind:'snow',level:'light'})),fog=env(12,weatherLook({kind:'fog',level:'heavy'}));
 assert.ok(over.light.intensity<clear.light.intensity*.4&&over.cloud>clear.cloud&&over.sunGlow<clear.sunGlow);
 assert.equal(rain.rain,1);assert.equal(rain.snow,0);assert.equal(snow.snow,.3);assert.equal(snow.rain,0);assert.equal(fog.fogDistance,200);assert.ok(Number.isFinite(clear.fogDistance));
 assert.ok(env(23,weatherLook({kind:'overcast'})).stars<.2&&env(23,weatherLook({kind:'rain',level:'light'})).stars===0);
});

test('날씨 코드 → 6단계: 문서 표의 모든 코드',()=>{
 const k=c=>classifyWeather({code:c});
 for(const c of [0,1])assert.deepEqual(k(c),{kind:'clear',level:null});
 assert.equal(k(2).kind,'cloud');assert.equal(k(3).kind,'overcast');
 assert.deepEqual(k(45),{kind:'fog',level:'medium'});assert.deepEqual(k(48),{kind:'fog',level:'heavy'});
 const rain={51:'light',53:'medium',55:'heavy',56:'light',57:'heavy',61:'light',63:'medium',65:'heavy',66:'light',67:'heavy',80:'light',81:'medium',82:'heavy',95:'heavy',96:'heavy',97:'heavy',99:'heavy'};
 for(const [c,l] of Object.entries(rain))assert.deepEqual(k(Number(c)),{kind:'rain',level:l},c);
 const snow={71:'light',73:'medium',75:'heavy',77:'light',85:'light',86:'heavy'};
 for(const [c,l] of Object.entries(snow))assert.deepEqual(k(Number(c)),{kind:'snow',level:l},c);
});
test('날씨 보정: 눈>비>안개, 코드 밖은 구름량, 맑은 코드+시정<1km는 안개',()=>{
 assert.equal(classifyWeather({code:61,snowfall:.5}).kind,'snow');assert.equal(classifyWeather({code:0,rain:.5}).kind,'rain');assert.equal(classifyWeather({code:0,rain:.05}).kind,'clear');
 assert.deepEqual(classifyWeather({code:1,visibility:800}),{kind:'fog',level:'light'});assert.equal(classifyWeather({code:1,visibility:15000}).kind,'clear');
 assert.equal(classifyWeather({code:10,cloudCover:20}).kind,'clear');assert.equal(classifyWeather({code:10,cloudCover:50}).kind,'cloud');assert.equal(classifyWeather({code:30,cloudCover:90}).kind,'overcast');
 assert.equal(classifyWeather({code:null,cloudCover:null}).kind,'clear');assert.equal(classifyWeather({}).kind,'clear');
});
test('풍속 → 바람 소리 세기 경계(0.5, 3.4, 8.0, 13.9)',()=>{
 for(const [v,l] of [[0,.05],[.49,.05],[.5,.2],[3.39,.2],[3.4,.5],[7.99,.5],[8,.8],[13.89,.8],[13.9,1],[30,1]])assert.equal(windSoundLevel(v),l,String(v));
 assert.equal(windSoundLevel(null),.2);
});
test('날씨 표현값: 맑음 연무 15km·비 강 1200m·눈 강 1000m·안개 200/400m, visibility 반영',()=>{
 assert.equal(weatherLook({kind:'clear'}).fogDistance,15000);assert.equal(weatherLook({kind:'rain',level:'heavy'}).fogDistance,1200);assert.equal(weatherLook({kind:'snow',level:'heavy'}).fogDistance,1000);
 assert.equal(weatherLook({kind:'fog',level:'heavy'}).fogDistance,200);assert.equal(weatherLook({kind:'fog'}).fogDistance,400);
 assert.equal(weatherLook({kind:'clear',visibility:9000}).fogDistance,9000);assert.equal(weatherLook({kind:'clear',visibility:40000}).fogDistance,15000);
 assert.equal(weatherLook({kind:'rain',level:'light'}).rain,.3);assert.equal(weatherLook({kind:'rain'}).rain,.6);assert.equal(weatherLook({kind:'snow',level:'heavy'}).snow,1);
 assert.equal(weatherLook({kind:'rain',windSpeed:9}).windSound,.8);
});
const sample={current:{time:'2026-11-03T14:00',interval:900,weather_code:61,cloud_cover:95,visibility:8000,wind_speed_10m:5,rain:.6,snowfall:0,temperature_2m:7}};
test('API 응답 해석·URL: 풍속 m/s, 모델 미지정, 오래된 값 폐기',()=>{
 const u=apiUrl();assert.match(u,/wind_speed_unit=ms/);assert.match(u,/latitude=37\.4453&longitude=126\.964/);assert.doesNotMatch(u,/models=/);assert.match(u,/timezone=Asia%2FSeoul/);
 const now=Date.parse('2026-11-03T14:20+09:00');assert.equal(parseCurrent(sample,now).code,61);
 assert.equal(parseCurrent(sample,Date.parse('2026-11-03T16:00+09:00')),null);assert.equal(parseCurrent({},now),null);assert.equal(parseCurrent({current:{weather_code:null,cloud_cover:null}},now),null);
 assert.equal(ATTRIBUTION.href,'https://open-meteo.com/');assert.match(ATTRIBUTION.text,/Open-Meteo/);
});
test('수동 지정: ?weather=rain|snow|fog|cloudy|clear, level, wind; 잘못된 값은 무시',()=>{
 assert.deepEqual(manualWeather('?weather=rain&level=heavy&wind=7'),{kind:'rain',level:'heavy',windSpeed:7});
 assert.equal(manualWeather('?weather=cloudy').kind,'cloud');assert.equal(manualWeather('?weather=SNOW').kind,'snow');assert.equal(manualWeather('?weather=fog').kind,'fog');assert.equal(manualWeather('?weather=clear').kind,'clear');
 assert.equal(manualWeather('?weather=tornado'),null);assert.equal(manualWeather(''),null);assert.equal(manualWeather('?weather=rain&level=x').level,null);
});
const okFetch=body=>async()=>({ok:true,json:async()=>body});
test('날씨 컨트롤러: 성공하면 API 값, 수동이면 호출하지 않는다',async()=>{
 const now=()=>Date.parse('2026-11-03T14:20+09:00'),seen=[];
 const c=createWeatherController({search:'',fetchImpl:okFetch(sample),now,onChange:s=>seen.push(s.kind),setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
 await c.refresh();assert.equal(c.state.source,'api');assert.equal(c.state.kind,'rain');assert.equal(c.state.level,'light');assert.equal(c.state.windSpeed,5);assert.equal(c.state.look.windSound,.5);assert.equal(c.state.error,null);
 let calls=0;const m=createWeatherController({search:'?weather=snow',fetchImpl:async()=>{calls++;throw new Error('x');},setIntervalImpl:()=>1});m.start();await m.refresh();assert.equal(calls,0);assert.equal(m.state.source,'manual');assert.equal(m.state.kind,'snow');
});
test('오프라인·실패·시간초과·오래된 응답 → 맑음으로 대체, 다음 주기에 복구',async()=>{
 const now=()=>Date.parse('2026-11-03T14:20+09:00');let online=true,mode='ok';
 const fetchImpl=async()=>{if(mode==='fail')throw new TypeError('Failed to fetch');if(mode==='http')return {ok:false,status:503};if(mode==='bad')return {ok:true,json:async()=>({})};if(mode==='stale')return {ok:true,json:async()=>({current:{...sample.current,time:'2026-11-03T09:00'}})};return {ok:true,json:async()=>sample};};
 const c=createWeatherController({search:'',fetchImpl,now,isOnline:()=>online,setIntervalImpl:()=>1});
 await c.refresh();assert.equal(c.state.kind,'rain');
 for(const m of ['fail','http','bad','stale']){mode=m;await c.refresh();assert.equal(c.state.kind,'clear',m);assert.equal(c.state.source,'fallback',m);assert.ok(c.state.error,m);assert.equal(c.state.look.rain,0);}
 mode='ok';online=false;await c.refresh();assert.equal(c.state.kind,'clear');assert.equal(c.state.error,'오프라인');
 online=true;await c.refresh();assert.equal(c.state.kind,'rain');assert.equal(c.state.source,'api');
 assert.equal(createWeatherController({search:'',fetchImpl:()=>{},setIntervalImpl:()=>1}).state.kind,'clear','시작 전 기본은 맑음');
});
test('fetch가 없거나 응답이 멈추면 시간 초과로 실패한다',async()=>{
 await assert.rejects(()=>fetchCurrentWeather({fetchImpl:null}));
 await assert.rejects(()=>fetchCurrentWeather({fetchImpl:()=>new Promise(()=>{}),timeoutMs:30}),/시간 초과|abort/i);
});
test('10분마다 호출: 간격 600000ms',async()=>{
 assert.equal(REFRESH_MS,600000);let interval=null,fn=null;
 const c=createWeatherController({search:'',fetchImpl:okFetch(sample),now:()=>Date.parse('2026-11-03T14:20+09:00'),setIntervalImpl:(f,ms)=>{fn=f;interval=ms;return 1;},clearIntervalImpl:()=>{}});
 c.start();assert.equal(interval,600000);await new Promise(r=>setTimeout(r,5));assert.equal(c.state.calls,1);await fn();assert.equal(c.state.calls,2);
});
test('환경 보관소: ?time 수동 시각, ?sun=pm 고정 태양 유지, 부드러운 전환',()=>{
 const e=createEnvironment({search:'?time=21:30&weather=clear',nowMs:()=>seoul(9)});const cur=e.update(.016);assert.equal(e.info.timeLabel,'21:30');assert.ok(cur.night>.9);assert.equal(e.info.manualTime,true);
 const pm=createEnvironment({search:'?sun=pm&weather=clear',nowMs:()=>seoul(3)});const p=pm.update(.016);assert.equal(pm.info.legacySun,true);assert.ok(Math.abs(p.elevation-25)<1e-9&&Math.abs(p.azimuth-224)<1e-9&&p.night===0);
 const t=createEnvironment({search:'?time=12:00&sun=pm&weather=clear'});t.update(.016);assert.equal(t.info.legacySun,false,'time이 sun보다 우선');
 const live=createEnvironment({search:'?weather=clear',nowMs:()=>seoul(12)});live.update(0);assert.equal(live.info.timeLabel,'12:00');assert.equal(live.info.manualTime,false);
 assert.equal(easeTo(0,10,.5),5);assert.deepEqual(easeTo([0,0],[2,4],.5),[1,2]);assert.equal(easeTo(undefined,3,.5),3);assert.equal(easeTo(true,false,.5),false);
});
test('방위 전환은 짧은 쪽으로 돈다(359°→1°)',()=>{
 let hour=12;const e=createEnvironment({search:'?weather=clear',nowMs:()=>seoul(hour)});e.update(0);
 const a=e.current.azimuth;hour=12.5;e.update(1);assert.ok(Math.abs(e.current.azimuth-a)<30);
});
test('바람·비 소리: 세기 설정이 환경음 목표 dB에 반영된다',()=>{
 setWeatherSound({wind:null,rain:0});const base=ambientTargets(1500,300,{birds:true});
 setWeatherSound({wind:.8,rain:0});const windy=ambientTargets(1500,300,{birds:true});
 assert.ok(windy.targets.forest>base.targets.forest-1e-9||windy.correction<0);assert.equal(windShiftDb(null),0);assert.ok(windShiftDb(1)>windShiftDb(.5)&&windShiftDb(.05)<0);
 setWeatherSound({wind:.2,rain:1});const rainy=ambientTargets(1500,300,{birds:true});assert.equal(rainy.targets.birds,null);
 setWeatherSound({wind:null,rain:0});assert.equal(WEATHER_SOUND.rain,0);
});
test('UI 모델: 앉았을 때만 차 마시기 버튼, 스테미너 가득=흐림·고갈=빨강',()=>{
 assert.equal(buttonView({pose:'stand'}).teaHidden,true);assert.equal(buttonView({pose:'stand'}).sitLabel,'앉기');
 assert.equal(buttonView({pose:'sit'}).teaHidden,false);assert.equal(buttonView({pose:'sit'}).sitLabel,'일어나기');
 assert.equal(buttonView({pose:'tea'}).teaDisabled,true);assert.equal(buttonView({pose:'tea'}).teaHidden,false);
 assert.equal(staminaView({stamina:100}).level,'full');assert.equal(staminaView({stamina:70}).level,'normal');assert.equal(staminaView({stamina:20}).level,'low');
 assert.equal(staminaView({stamina:0}).level,'empty');assert.equal(staminaView({stamina:20,runExhausted:true}).level,'empty');assert.equal(staminaView({stamina:NaN}).percent,100);
 const v=environmentView({kind:'rain',level:'heavy',icon:'🌧',weatherLabel:'비',timeLabel:'14:00',source:'manual'});assert.match(v.text,/비\(강\)/);assert.match(v.title,/수동/);
});
