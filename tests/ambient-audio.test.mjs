import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AmbientAudio} from '../src/ambient-audio.js';
import {ambientTargets,ambientSectionAt,streamDb,dbGain,powerDb,crossfade,LAYER_FILES} from '../src/ambient-config.js';
import {FOOTSTEP_PEAK_DB} from '../src/footstep-audio.js';
test('전 경로·고도·돌풍 최댓값에서도 환경음 목표 전력합이 예산 이하',()=>{
 for(let m=0;m<=4962;m+=7)for(const h of [99,235,328,542,580,600,632,654])for(const birds of [true,false]){const v=ambientTargets(m,h,{birds,gust:2.5});assert.ok(v.sumRmsDb<=v.budgetDb+1e-9);}
 assert.deepEqual([0,1070,2595,3246,4312,4469,4809].map(ambientSectionAt),[1,2,3,4,5,6,7]);
});
test('물소리 거리 감쇠·컷과 고도에 따른 강풍',()=>{
 assert.equal(streamDb(5),-38);assert.ok(Math.abs(streamDb(10)+44.0206)<.0001);assert.equal(streamDb(100),null);
 assert.equal(ambientTargets(3246,328).targets.stream,null);assert.equal(ambientTargets(4500,580).targets.ridge,null);
 assert.equal(ambientTargets(4900,654).targets.forest,null);assert.equal(ambientTargets(4900,654).targets.ridge,-33);
});
test('전환 중 등전력 합과 양 끝점 보존',()=>{
 const a=Object.fromEntries(Object.keys(LAYER_FILES).map(k=>[k,null])),b={...a};a.forest=-42;b.ridge=-42;
 for(let i=0;i<=100;i++){const v=crossfade(a,b,i/100);assert.ok(Math.abs(Object.values(v).reduce((s,g)=>s+g*g,0)-dbGain(-42)**2)<1e-12);}
 assert.equal(crossfade(a,b,0).ridge,0);assert.equal(crossfade(a,b,1).forest,0);
});
function context(){
 const events=[];const node=()=>({gain:param(),pan:param(),frequency:param(),playbackRate:param(),connect(){return this;},disconnect(){},start(){events.push('start');},stop(){events.push('stop');},getFloatTimeDomainData(a){a.fill(0);}});
 function param(){return {value:1,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}};}
 return {currentTime:0,state:'running',events,createGain:node,createBiquadFilter:node,createAnalyser:node,createStereoPanner:node,createBufferSource:node};
}
function prepared(){const c=context(),a=new AmbientAudio({context:c,destination:c.createGain(),random:()=>.5});for(const f of [...Object.values(LAYER_FILES),'crow-01.flac','crow-02.flac','moktak-01.flac','moktak-02.flac','moktak-03.flac'])a.buffers.set(f,{duration:24});return {a,c};}
test('첫 입력 전 context·다운로드 없음, 끄기와 일시정지 중 간헐 시계 정지',()=>{
 const lazy=new AmbientAudio();lazy.update({dt:10});assert.equal(lazy.context,null);assert.equal(lazy.pending.size,0);
 const {a,c}=prepared();a.update({referenceMetres:2000,elevation:200,dt:1});assert.ok(c.events.includes('start'));a.setEnabled(false);const time=a.time;a.update({referenceMetres:4900,elevation:650,dt:100});assert.equal(a.time,time);assert.equal(a.snapshot().sumRmsDb,-Infinity);assert.ok(c.events.includes('stop'));
 a.setEnabled(true);a.update({referenceMetres:4900,elevation:650,paused:true,dt:100});assert.equal(a.time,time);assert.ok(Object.values(a.snapshot().layers).every(l=>!l.playing));
});
test('구간 도약·재시작·볼륨 및 전환 중 예산',()=>{
 const {a}=prepared();for(let i=0;i<60;i++)a.update({referenceMetres:4900,elevation:654,dt:.25});
 a.update({referenceMetres:2000,elevation:200,dt:.25});assert.equal(a.transition.duration,1.5);assert.ok(a.snapshot().sumRmsDb<=-37+1e-8);
 a.setVolume(.4);assert.equal(a.volume,.4);a.setVolume(3);assert.equal(a.volume,1);
 a.setPaused(true);a.update({referenceMetres:2000,elevation:200,dt:1});assert.ok(a.snapshot().active>0);
});
test('까마귀 교대와 목탁 묶음·간격·쉼은 고정 난수로 재현',()=>{
 const {a}=prepared(),calls=[];a.oneShot=(file,db,options)=>calls.push({file,db,options,time:a.time});
 for(let i=0;i<1200;i++)a.update({referenceMetres:4860,elevation:640,dt:.25});
 const crow=calls.filter(v=>v.file.startsWith('crow'));assert.ok(crow.length>=3);for(let i=1;i<crow.length;i++){assert.notEqual(crow[i].file,crow[i-1].file);assert.ok(crow[i].time-crow[i-1].time>=40);}
 const hits=calls.filter(v=>v.file.startsWith('moktak'));assert.ok(hits.length>=10);for(let i=0;i<10;i++)assert.equal(hits[i].file,`moktak-0${i%3+1}.flac`);assert.ok(hits[10].time-hits[9].time>=40);
});
test('음원 11개 원본과 배포 사본 동일·발소리 목표 여유',()=>{
 for(const file of [...Object.values(LAYER_FILES),'crow-01.flac','crow-02.flac','moktak-01.flac','moktak-02.flac','moktak-03.flac'])assert.deepEqual(readFileSync(new URL('../assets/audio/ambient/gwanak-v1/'+file,import.meta.url)),readFileSync(new URL('../public/sounds/ambient/'+file,import.meta.url)));
 assert.ok(FOOTSTEP_PEAK_DB.soil-(-37)>=12);assert.ok(FOOTSTEP_PEAK_DB.ridge-(-32)>=12);
 assert.equal(powerDb([null,null]),-Infinity);
});
