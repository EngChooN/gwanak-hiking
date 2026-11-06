import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {seasonForMonthDay,seasonForDate,normalizeSeason,createSeasonController,SEASONS} from '../src/season.js';
import {SEASON_UNIFORMS,createSeasonBlend,seasonTarget,AUTUMN_MIX,SEASON_PALETTE} from '../src/toon/season.js';
import {createToonNature,TOON_PART} from '../src/toon/nature.js';
import {TOON_UNIFORMS,createToonMaterials} from '../src/toon/materials.js';
import {createGradientMap} from '../src/toon/gradient.js';
import {createSeasonParticles} from '../src/toon/season-particles.js';

// 계절(산풍경, 2026-11-06): 서울 날짜 경계(docs/관악산-계절-자료.md §5), 바꾸기 API, 셰이더 uniform 공유, 겨울 가지·눈.
const compile=m=>{const s={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};m.onBeforeCompile(s,null);return s;};
const seoul=(y,m,d,h=12)=>Date.UTC(y,m-1,d,h-9);

test('계절 경계: 봄 3/25~4/30, 여름 5/1~10/14, 가을 10/15~11/30, 겨울 12/1~3/24 (서울 날짜)', ()=>{
 const cases=[[3,24,'winter'],[3,25,'spring'],[4,30,'spring'],[5,1,'summer'],[10,14,'summer'],[10,15,'autumn'],[11,6,'autumn'],[11,30,'autumn'],[12,1,'winter'],[1,1,'winter']];
 for(const [m,d,s] of cases)assert.equal(seasonForMonthDay(m,d),s,`${m}/${d}`);
 // 오늘(2026-11-06)은 가을.
 assert.equal(seasonForDate(seoul(2026,11,6)),'autumn');
 // UTC로는 11/30 16시지만 서울은 12/1 01시 → 겨울.
 assert.equal(seasonForDate(Date.UTC(2026,10,30,16)),'winter');
});

test('계절 바꾸기: URL ?season=, set(이름|null), 모르는 값은 무시, 바뀌면 알림', ()=>{
 assert.equal(normalizeSeason('Winter'),'winter');assert.equal(normalizeSeason('fall'),'autumn');assert.equal(normalizeSeason('봄'),'spring');
 assert.equal(normalizeSeason('auto'),null);assert.equal(normalizeSeason(null),null);assert.equal(normalizeSeason('rainy'),undefined);
 const now=()=>seoul(2026,11,6);
 assert.equal(createSeasonController({search:'?season=spring',nowMs:now}).season,'spring');
 assert.equal(createSeasonController({search:'?season=nope',nowMs:now}).season,'autumn');
 const seen=[],c=createSeasonController({search:'',nowMs:now,onChange:s=>seen.push(s.season)});
 assert.equal(c.season,'autumn');assert.equal(c.state.source,'date');
 assert.equal(c.set('winter'),true);assert.equal(c.season,'winter');assert.equal(c.state.source,'manual');
 assert.equal(c.set('rainy'),false);assert.equal(c.season,'winter');
 assert.equal(c.set(null),true);assert.equal(c.season,'autumn',"null = '현재 그대로'(날짜)");
 assert.deepEqual(seen,['winter','autumn']);
 // 날짜를 따를 때만 자정의 경계 변화를 따라간다.
 let t=seoul(2026,11,30,23);const d=createSeasonController({search:'',nowMs:()=>t});assert.equal(d.season,'autumn');t=seoul(2026,12,1,1);assert.equal(d.tick(),true);assert.equal(d.season,'winter');
});

test('계절 섞기: 가중치 uniform 하나를 모든 계절 재질이 함께 읽는다(다시 컴파일 없이 값만 바뀜)', ()=>{
 const b=createSeasonBlend();b.set('winter');b.snap();b.update(.016);assert.deepEqual(SEASON_UNIFORMS.tsW.value.toArray(),seasonTarget('winter'));
 b.set('spring');b.update(.1);const w=SEASON_UNIFORMS.tsW.value;assert.ok(w.x>0&&w.x<1&&w.w>0&&w.w<1,'부드럽게 옮겨 간다');
 for(let i=0;i<200;i++)b.update(.05);assert.deepEqual(w.toArray(),seasonTarget('spring'));
 b.set('summer');b.snap();b.update(0);
 const n=createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS}),f=createToonMaterials({gradientMap:createGradientMap()}).materialFactory;
 const mats=[n.materials.foliage,n.materials.grass,n.materials.grassField,n.materials.rock,n.materials.cliff,f.terrain(),f.rock(),f.trail('soil'),f.trail('rock')];
 const keys=mats.map(m=>m.customProgramCacheKey());
 for(const m of mats){const s=compile(m);assert.equal(s.uniforms.tsW,SEASON_UNIFORMS.tsW,`${m.name} 같은 uniform 객체`);assert.match(s.fragmentShader+s.vertexShader,/tsW/);}
 b.set('autumn');b.snap();b.update(0);assert.deepEqual(mats.map(m=>m.customProgramCacheKey()),keys,'계절이 바뀌어도 셰이더 키는 그대로');
 b.set('summer');b.snap();b.update(0);
});

test('겨울 나무: 활엽수·어린 나무는 잎(1)과 겨울 잔가지(2)를 함께 갖고, 먼 단계 수관은 부위 6', ()=>{
 const n=createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS});
 const parts=g=>{const a=g.attributes.toonPart,c={};for(let i=0;i<a.count;i++){const k=a.getX(i);c[k]=(c[k]??0)+1;}return c;};
 for(const id of ['tree_small_02','island_tree_01','pine_sapling_medium'])for(const lod of [0,1,2]){
  const c=parts(n.natureParts(`${id}-lod${lod}.glb`)[0].geometry);
  assert.ok(c[TOON_PART.twig]>0,`${id} lod${lod} 잔가지`);assert.ok(c[TOON_PART.trunk]>0,`${id} lod${lod} 줄기`);
  assert.ok(c[lod===2?TOON_PART.farCrown:TOON_PART.leaf]>0,`${id} lod${lod} 잎`);
 }
 const pine=parts(n.natureParts('pine_tree_01-lod0.glb')[0].geometry);assert.ok(pine[TOON_PART.needle]>0&&!pine[TOON_PART.twig],'소나무는 사계절 솔잎(눈만 얹는다)');
 assert.ok(parts(n.geometries.shrub)[TOON_PART.bush]>0,'덤불');
 const v=compile(n.materials.foliage).vertexShader;
 assert.match(v,/part==1\|\|part==6&&far<\.5\)&&winter>\.5\|\|part==2&&winter<\.5/,'겨울엔 잎을 접고 잔가지를 편다');
 assert.match(compile(n.materials.foliage).fragmentShader,/tsSnowCover/,'가지·솔잎 윗면 눈');
});

test('쌓인 눈은 날씨와 별개로 셰이더에서: 지형·바위·길 모두 겨울 가중치만 읽는다(눈 내림 입자와 무관)', ()=>{
 const f=createToonMaterials({gradientMap:createGradientMap()}).materialFactory;
 const t=compile(f.terrain()).fragmentShader;
 assert.match(t,/ttSnow=tsW\.w\*ttCut\(cover/,'완만한 땅에 눈');assert.match(t,/smoothstep\(\.3,\.5,slope\)/,'가파른 면(약 45°~)은 맨 바위');
 assert.match(t,/tsCrown\(/,'중경 수관도 계절색');assert.match(t,/tsLitter\(/,'꽃잎·낙엽');
 assert.match(compile(f.trail('soil')).fragmentShader,/TS_TRAMPLED/,'등산로는 밟힌 눈');
 assert.match(compile(f.rock()).fragmentShader,/tsSnowAmt=tsSnowCover/,'바위 윗면 눈');
 assert.doesNotMatch(t,/snowAmount|weather/,'날씨 값을 읽지 않는다');
});

test('계절 팔레트·비율: 단풍 비율 합 1, 자료 §6 색, 꽃잎·낙엽 입자는 텍스처 없이 드로콜 1개', ()=>{
 assert.ok(Math.abs(Object.values(AUTUMN_MIX).reduce((a,b)=>a+b,0)-1)<1e-9);
 assert.ok(AUTUMN_MIX.red>=.25,'붉은 단풍이 잘 보이게');
 assert.equal(SEASON_PALETTE.brown[0],'#b07a3e');assert.equal(SEASON_PALETTE.pine[0],'#4f7a3a');
 for(const [k,[a,b]] of Object.entries(SEASON_PALETTE))assert.match(a+b,/^#[0-9a-f]{6}#[0-9a-f]{6}$/,k);
 const p=createSeasonParticles({mobile:true});assert.ok(p.points.isPoints);assert.equal(p.points.material.uniforms.tsW,SEASON_UNIFORMS.tsW);
 assert.equal(Object.values(p.points.material).some(v=>v?.isTexture),false,'텍스처 없음');assert.ok(p.status.count<=140);
 p.update(.016,new THREE.PerspectiveCamera());assert.equal(p.points.visible,false,'여름에는 그리지 않는다');
 assert.deepEqual(SEASONS,['spring','summer','autumn','winter']);
});
