import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TOON,phaseWeights,bloomFor,gradeFor,outlineFor,outlineFade,outlineWidth,skyFor,windowLitShare,hexToRgb,TRAIL_KINDS} from '../src/toon/palette.js';
import {createGradientMap} from '../src/toon/gradient.js';
import {createToonMaterials} from '../src/toon/materials.js';
import {createCityStyle} from '../src/toon/city.js';
import {createToonSky} from '../src/toon/sky.js';
import {createToonStyle} from '../src/toon/index.js';

const DAY={elevation:35,night:0,gray:0},SUNSET={elevation:2,night:0,gray:0},NIGHT={elevation:-25,night:1,gray:0};
const near=(a,b,eps=1e-6)=>Math.abs(a-b)<=eps;

test('gradientMap은 3단 이하·NearestFilter·밉맵 없음, 값 0.35/0.7/1.0', ()=>{
 const g=createGradientMap();
 assert.ok(g.image.width<=3&&g.image.height===1);
 assert.equal(g.minFilter,THREE.NearestFilter);assert.equal(g.magFilter,THREE.NearestFilter);assert.equal(g.generateMipmaps,false);
 const levels=[...Array(g.image.width).keys()].map(i=>g.image.data[i*4]/255);
 assert.deepEqual(levels.map(v=>+v.toFixed(2)),[.35,.7,1]);
 assert.throws(()=>createGradientMap([.2,.4,.6,.8]),/1~3단/);
 assert.equal(g.userData.shared,true);
});

test('시간대 가중치: 합이 1, 낮·노을·밤 대표 시각에서 해당 시간대가 지배', ()=>{
 for(let el=-30;el<=60;el+=.5){
  const night=el<-2?Math.min(1,(-2-el)/10):0,w=phaseWeights({elevation:el,night});
  assert.ok(near(w.day+w.sunset+w.night,1,1e-9),`el ${el}`);
  for(const v of Object.values(w))assert.ok(v>=0&&v<=1);
 }
 assert.ok(phaseWeights(DAY).day>.99);assert.ok(phaseWeights(SUNSET).sunset>.9);assert.ok(phaseWeights(NIGHT).night>.99);
});

test('블룸 수치: 낮 .85/.35, 노을 .8/.35, 밤 .55/.9이고 사이는 단조 보간', ()=>{
 const d=bloomFor(DAY),n=bloomFor(NIGHT);
 assert.ok(near(d.threshold,.85,.005)&&near(d.strength,.35,.005));
 assert.ok(near(n.threshold,.55,1e-9)&&near(n.strength,.9,1e-9));
 const pure=bloomFor({elevation:1,night:0});const w=phaseWeights({elevation:1,night:0});
 assert.ok(near(pure.threshold,.85*w.day+.8*w.sunset,1e-9));
 // 노을 블룸은 약하게(4단계: 지평선 크림색이 하늘 위쪽 청남색까지 번지지 않게).
 assert.deepEqual([TOON.bloom.sunset.threshold,TOON.bloom.sunset.strength],[.8,.35]);
 // 해가 지는 동안 문턱은 내려가고 세기는 올라간다.
 let prev=bloomFor({elevation:40,night:0});
 for(let el=39;el>=-25;el--){
  const night=el<-2?Math.min(1,(-2-el)/10):0,b=bloomFor({elevation:el,night});
  assert.ok(b.threshold<=prev.threshold+1e-9&&b.strength>=prev.strength-1e-9,`el ${el}`);prev=b;
 }
});

test('팔레트 보간: 하늘·색보정·외곽선이 시간대 색 사이에 있다', ()=>{
 const sd=skyFor(DAY),sn=skyFor(NIGHT),ss=skyFor(SUNSET);
 assert.deepEqual(sd.zenith.map(v=>+v.toFixed(3)),hexToRgb(TOON.sky.day.zenith).map(v=>+v.toFixed(3)));
 assert.deepEqual(sn.horizon.map(v=>+v.toFixed(3)),hexToRgb(TOON.sky.night.horizon).map(v=>+v.toFixed(3)));
 assert.ok(ss.horizon[0]>ss.horizon[2],'노을 지평선은 앰버(붉은 쪽)');
 assert.ok(sn.stars>1,'밤 별은 HDR(>1)로 블룸을 받는다');assert.equal(sd.stars,0);
 const gd=gradeFor(DAY),gn=gradeFor(NIGHT),gs=gradeFor(SUNSET);
 assert.ok(near(gd.saturation,TOON.grade.day.saturation,.01),'낮 채도는 팔레트 값(「야생의 숨결」 옅고 맑은 색)');
 assert.ok(gd.highlight[2]>gd.highlight[0],'낮 하이라이트는 하늘색(청량)');
 assert.ok(gs.highlight[0]>gs.highlight[2],'노을 하이라이트는 앰버');
 assert.ok(gs.shadow[2]>gs.shadow[1],'노을 그늘은 보라 쪽');
 assert.ok(gn.highlight[2]>gn.highlight[0],'밤은 네이비');
 assert.ok(gd.shadow[2]>gd.shadow[0]&&gd.shadowAmount>0,'낮 그늘 청록 틴트');
 // 흐리면 채도가 내려간다.
 assert.ok(gradeFor({...DAY,gray:1}).saturation<gd.saturation);
 const mid=gradeFor({elevation:-7,night:.5});
 for(let i=0;i<3;i++)assert.ok(mid.highlight[i]>=Math.min(gs.highlight[i],gn.highlight[i],gd.highlight[i])-1e-9&&mid.highlight[i]<=Math.max(gs.highlight[i],gn.highlight[i],gd.highlight[i])+1e-9);
});

test('외곽선: 낮 #3b2f2a·밤 #1d2a44, 원경 0, 두께 1px/고화질 1.5px', ()=>{
 assert.deepEqual(outlineFor(DAY).color,hexToRgb('#3b2f2a'));
 assert.deepEqual(outlineFor(NIGHT).color,hexToRgb('#1d2a44'));
 assert.equal(outlineFade(0),1);assert.equal(outlineFade(5000),0);
 assert.ok(outlineFade(300)<1&&outlineFade(300)>0);
 assert.equal(outlineWidth(0),1);assert.equal(outlineWidth(1),1);assert.equal(outlineWidth(2),1.5);
});

test('창문 켜짐 비율은 건물마다 35~60%, 낮에는 0', ()=>{
 for(let i=0;i<500;i++){const s=windowLitShare(i/500);assert.ok(s>=.35-1e-9&&s<=.6+1e-9);}
 assert.equal(windowLitShare(.3,0),0);
 const values=new Set([...Array(50).keys()].map(i=>windowLitShare(i/50).toFixed(2)));assert.ok(values.size>10,'건물마다 다르다');
});

test('toonify: 색·정점색·alphaTest·side·투명 유지, InstancedMesh·instanceColor 유지, 원본 재질 캐시', ()=>{
 const {toonify,status}=createToonMaterials({gradientMap:createGradientMap()});
 const src=new THREE.MeshStandardMaterial({color:0x336699,vertexColors:true,alphaTest:.4,side:THREE.DoubleSide,transparent:true,opacity:.7,name:'bark'});
 const geo=new THREE.BoxGeometry();
 const inst=new THREE.InstancedMesh(geo,src,4);inst.setColorAt(0,new THREE.Color(1,0,0));
 const plain=new THREE.Mesh(geo,src);
 const basic=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xff8800}));
 const phys=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({color:0x00ff00}));
 const root=new THREE.Group();root.add(inst,plain,basic,phys);
 toonify(root,{kind:'prop'});
 const m=inst.material;
 assert.ok(m.isMeshToonMaterial);assert.ok(m.gradientMap);
 assert.equal(m.color.getHex(),src.color.getHex());assert.equal(m.vertexColors,true);assert.equal(m.alphaTest,.4);
 assert.equal(m.side,THREE.DoubleSide);assert.equal(m.transparent,true);assert.equal(m.opacity,.7);
 assert.ok(inst.isInstancedMesh&&inst.instanceColor&&inst.count===4,'인스턴싱·인스턴스 색 유지');
 assert.equal(plain.material,m,'같은 원본은 같은 툰 재질(캐시)');
 assert.equal(m.userData.shared,true,'청크 dispose에서 건너뛰도록 shared 표시');
 assert.ok(basic.material.isMeshToonMaterial&&basic.material.color.getHex()===0xff8800);
 assert.ok(phys.material.isMeshToonMaterial);
 // 다시 돌려도 이미 툰이면 그대로.
 const before=inst.material;toonify(root,{kind:'prop'});assert.equal(inst.material,before);
 assert.equal(status.converted,3);assert.ok(status.reused>=1);
});

test('toonify: SkinnedMesh 유지, 잎 카드(toonAlphaCutout)는 공유 덩어리 메시로, 원본 텍스처는 쓰지 않는다', ()=>{
 const {toonify,status}=createToonMaterials({gradientMap:createGradientMap()});
 const bones=[new THREE.Bone()],skeleton=new THREE.Skeleton(bones);
 const skinGeo=new THREE.BoxGeometry();const n=skinGeo.attributes.position.count;
 skinGeo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));skinGeo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(new Float32Array(n*4).fill(.25),4));
 const skinned=new THREE.SkinnedMesh(skinGeo,new THREE.MeshStandardMaterial({color:0xccbbaa}));skinned.add(bones[0]);skinned.bind(skeleton);
 const leafMat=new THREE.MeshStandardMaterial({color:0x557733,alphaTest:.5,name:'tree_leaves'});leafMat.userData.toonAlphaCutout=true;
 const cards=new THREE.PlaneGeometry(4,6);
 const a=new THREE.InstancedMesh(cards,leafMat,3),b=new THREE.InstancedMesh(cards,leafMat,5);
 const tex=new THREE.Texture();const textured=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:tex}));
 const root=new THREE.Group();root.add(skinned,a,b,textured);toonify(root,{kind:'nature'});
 assert.ok(skinned.isSkinnedMesh&&skinned.material.isMeshToonMaterial&&skinned.skeleton===skeleton);
 assert.notEqual(a.geometry,cards);assert.equal(a.geometry,b.geometry,'같은 잎 카드 → 같은 덩어리');
 assert.equal(a.geometry.userData.shared,true);assert.equal(a.material.alphaTest,0);assert.equal(a.count,3);
 assert.ok(a.material.userData.toonFoliage,'덩어리 잎은 바람·물결 셰이더');
 assert.equal(status.blobs,1);
 assert.equal(textured.material.map,null,'텍스처 디테일을 버린다');
});

test('materialFactory: fetch 없이 terrain/trail/basic/water와 load-landscape 재질 키를 돌려준다', ()=>{
 const realFetch=globalThis.fetch;let fetched=0;globalThis.fetch=()=>{fetched++;throw new Error('fetch 금지');};
 try{
  const {materialFactory:f}=createToonMaterials({gradientMap:createGradientMap()});
  const t=f.terrain();assert.ok(t.isMeshToonMaterial&&t.onBeforeCompile&&t.customProgramCacheKey().startsWith('toon-terrain'));
  assert.equal(f.terrain(),t,'지형 재질은 하나를 공유');
  for(const k of TRAIL_KINDS){const m=f.trail(k);assert.ok(m.isMeshToonMaterial&&!m.map);assert.equal(f.trail(k),m);}
  assert.equal(f.trail('stairs').side,THREE.DoubleSide);
  assert.deepEqual(Object.keys(f.pathMaterials()).sort(),['deck_stairs','paved','ridge','rock','soil','stairs']);
  const set=f.materials();
  for(const k of ['soil','stone','granite','leaves','grass','wood','bark','paved','stoneStairs','woodStairs'])assert.ok(set[k]?.isMeshToonMaterial,k);
  // load-landscape.js처럼 clone 후 onBeforeCompile을 옮겨도 된다.
  const copy=set.stone.clone();copy.onBeforeCompile=set.stone.onBeforeCompile;assert.ok(copy.isMeshToonMaterial);
  assert.ok(f.water().transparent);assert.equal(f.basic(0x123456),f.basic(0x123456));
  // 셰이더 주입이 실제 청크 이름과 맞는지 확인(지형).
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
  t.onBeforeCompile(shader);assert.match(shader.fragmentShader,/tRock/);assert.match(shader.vertexShader,/vTtWorld=/);
 }finally{globalThis.fetch=realFetch;}
 assert.equal(fetched,0);
});

test('patchFoliage: 실사 바람 버텍스 셰이더를 유지하고 바람결 색 물결·위밝음 프래그먼트를 더한다', ()=>{
 const {patchFoliage}=createToonMaterials({gradientMap:createGradientMap()});
 const m=patchFoliage(new THREE.MeshToonMaterial({name:'grass'}),{kind:'grass'});
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
 m.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/foliageGust/,'실사 바람 흔들림 유지');
 assert.match(shader.fragmentShader,/toonWaveColor/);assert.match(shader.fragmentShader,/vTfUp/);
 assert.ok(shader.uniforms.foliageTime&&shader.uniforms.toonWaveA&&shader.uniforms.toonWindDir);
 assert.match(m.customProgramCacheKey(),/toon-foliage-v1-grass/);
 assert.equal(patchFoliage(m),m,'두 번 패치하지 않는다');
});

test('styleCity: MeshBasic 파스텔 + 창문 셰이더, 이후 추가되는 도시 칸도 바뀐다', ()=>{
 const city=createCityStyle();
 const lamp=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffffff}));
 const style=city.styleCity({material:new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),nightLights:[lamp]});
 assert.ok(style.material.isMeshBasicMaterial&&style.material.vertexColors);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
 style.material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/cityWindow/);assert.match(shader.vertexShader,/seoulInfo/);
 const root=new THREE.Group(),first=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(first);
 style.apply(root);assert.equal(first.material,style.material);
 const later=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(later);assert.equal(later.material,style.material);
 assert.equal(lamp.material.userData.toonNightLight,true,'가로등은 따뜻한 HDR 불빛 재질');assert.ok(lamp.material.color.r>1);
 city.update({night:1,fogColor:[.5,.5,.6]});
});

test('createToonStyle: 렌더러 없이도 인터페이스(§2.6) 키를 갖추고 하늘을 만든다', async ()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color();
 const camera=new THREE.PerspectiveCamera(60,1,.1,30000);
 const style=await createToonStyle({scene,camera});
 for(const k of ['materialFactory','toonify','createSky','updateSky','styleCity','patchFoliage','pipeline','status'])assert.ok(k in style,k);
 const sky=style.createSky();assert.ok(scene.children.includes(sky));assert.equal(style.createSky(),sky);
 const p=style.updateSky(NIGHT,new THREE.Vector3(0,-1,0),new THREE.Vector3(0,1,0));assert.ok(p.stars>1);
 assert.equal(style.status.sky.created,true);
 const s=createToonSky();s.update(DAY,new THREE.Vector3(0,1,0));assert.ok(s.uniforms.skySunVis.value>.9);s.dispose();
});

test('보정: 길가 풀은 자기 바람 셰이더를 잇고 물결색 풀밭(외곽선 제외), 솔잎(_twig)은 물결색, 바위 GLB는 화강암 회색', ()=>{
 const {convert,patchFoliage}=createToonMaterials({gradientMap:createGradientMap()});
 const grass=new THREE.MeshStandardMaterial({color:0x596342,side:THREE.DoubleSide});
 grass.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float foliageTime;');};
 grass.customProgramCacheKey=()=>'roadside-grass-wind-v1';
 const g=convert(grass,{kind:'prop'}),shader={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
 g.onBeforeCompile(shader);
 assert.equal(shader.vertexShader.match(/uniform float foliageTime;/g).length,1,'바람 uniform을 두 번 선언하지 않는다');
 assert.doesNotMatch(shader.vertexShader,/foliageGust/,'실사 바람을 겹쳐 붙이지 않는다');
 assert.match(shader.fragmentShader,/toonWaveColor\(vTfWorld\)\*vec3\(1\.000\)/,'원래 명도와 무관한 물결색');
 assert.match(shader.fragmentShader,/gl_FragColor\.a=min\(gl_FragColor\.a,\.5\)/,'외곽선 제외 표시');
 assert.match(g.customProgramCacheKey(),/^roadside-grass-wind-v1\|toon-foliage-v1-grass/);
 const blades=new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide});blades.customProgramCacheKey=()=>'forest-blades-wind-v3-understory';
 assert.equal(convert(blades,{kind:'prop'}).userData.toonFoliage?.kind,'grass','숲 바닥 풀잎도 풀밭');
 const kindOf=name=>patchFoliage(new THREE.MeshToonMaterial({name}),{name,pine:true}).userData.toonFoliage.kind;
 assert.equal(kindOf('pine_tree_01_twig'),'needle');
 assert.equal(kindOf('pine_sapling_medium_twig'),'grass','길가 어린 소나무는 풀 덤불');assert.equal(kindOf('pine_sapling_medium_bark'),'bark');
 const rock=convert(new THREE.MeshStandardMaterial({name:'rock_09',color:0x503d2a}),{kind:'nature'});
 const c=rock.color,spread=Math.max(c.r,c.g,c.b)-Math.min(c.r,c.g,c.b);
 assert.ok(spread/Math.max(c.r,c.g,c.b)<.2&&rock.userData.toonRock,'갈색이 아닌 회색(채도 낮음)');
 const bark=convert(new THREE.MeshStandardMaterial({name:'pine_tree_01_bark',color:0x3f3831}),{kind:'nature'});
 assert.equal(bark.color.getHex(),0x3f3831,'바위가 아닌 재질은 그대로');
});

test('보정: 광장 바닥(캔버스 텍스처 + 흰 틴트)은 평균색 바탕 + 3단 약한 무늬, 지형은 고도·암반으로 바위', ()=>{
 const {convert,materialFactory}=createToonMaterials({gradientMap:createGradientMap()});
 const map=new THREE.CanvasTexture({width:4,height:4});
 const floor=convert(new THREE.MeshStandardMaterial({color:0xffeedd,map,vertexColors:true}),{kind:'prop'});
 assert.equal(floor.map,map,'무늬용으로 텍스처를 남긴다');assert.ok(floor.userData.toonPattern);
 assert.ok(floor.color.r<.5&&floor.vertexColors,'밝은 틴트 그대로가 아니다');
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
 floor.onBeforeCompile(shader);assert.match(shader.fragmentShader,/tpDark/);assert.match(shader.fragmentShader,/tpFade/);
 const t=materialFactory.terrain(),ts={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
 t.onBeforeCompile(ts);assert.match(ts.fragmentShader,/altRock/);assert.match(ts.fragmentShader,/ttFbm/);
 assert.doesNotMatch(ts.fragmentShader,/landPatch|ttBlob/,'사인 띠 얼룩(멀리서 줄·소용돌이)을 쓰지 않는다');
 assert.match(t.customProgramCacheKey(),/toon-terrain-v7-season/);
});

test('보정: 근거리 광원 상한은 방향광 전에 들어가고, 노을 그늘 올림은 노을에만', ()=>{
 createToonMaterials({gradientMap:createGradientMap()});
 const f=THREE.ShaderLib.toon.fragmentShader,cap=f.indexOf('toon-local-light-cap'),dir=f.indexOf('NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
 assert.ok(cap>0&&dir>cap,'점·스폿 합만 자른다');assert.equal(f.split('toon-local-light-cap').length,2,'한 번만 설치');
 // 노을 그늘 올림은 남기되 약하게(4단계: 역광 숲·바위는 하늘보다 어두운 실루엣, 08_01).
 assert.ok(gradeFor(SUNSET).shadowGain>.2&&gradeFor(SUNSET).shadowGain<.8);assert.equal(gradeFor(DAY).shadowGain,0);assert.equal(gradeFor(NIGHT).shadowGain,0);
});
