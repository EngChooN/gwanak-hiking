import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createToonNature,rockGeometry,TOON_NATURE_IDS} from '../src/toon/nature.js';
import {TOON_UNIFORMS,createToonMaterials} from '../src/toon/materials.js';
import {createGradientMap} from '../src/toon/gradient.js';
import {smoothRibbon} from '../src/toon/water.js';
import {GRASS_FIELD} from '../src/toon/grass-field.js';

// 카툰 2차 자연물(야숨 기준, 산풍경): 붓질·각진 바위·둥근 수관·층진 원뿔·가는 풀·물길 모서리·생울타리.
const nature=()=>createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS});
const compile=m=>{const s={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};m.onBeforeCompile(s,null);return s;};

test('지형·바위 셰이더: 풀밭 붓 자국, 바위는 회색 얼룩·이끼 칠(trcPaint), 갈라짐 선·층 띠·암반 붓 줄무늬는 없다', ()=>{
 const f=createToonMaterials({gradientMap:createGradientMap()}).materialFactory;
 const t=compile(f.terrain()).fragmentShader;
 assert.match(t,/bsStroke\(xz,toonWindDir/,'풀밭 붓 자국');assert.match(t,/=trcPaint\(vTtWorld/,'암반 칠');assert.match(t,/trcOcc=1\./,'셀 경계 그늘 없음');
 assert.doesNotMatch(t,/crack\*mix/);assert.doesNotMatch(t,/strata/,'가로 층 띠 없음');assert.doesNotMatch(t,/rockBrush|bsPlane\(vTtWorld/,'암반 붓 줄무늬(헤링본) 없음');
 const n=nature();
 for(const m of [n.materials.rock,n.materials.cliff]){const s=compile(m).fragmentShader;assert.match(s,/=trcPaint\(/);}
 assert.match(compile(f.rock()).fragmentShader,/=trcPaint\(vTsWorld/,'계곡 암반도 같은 칠');
 const soil=compile(f.trail('soil')).fragmentShader;assert.match(soil,/discard/,'흙길 가장자리 들쭉날쭉');assert.match(soil,/bsStroke/);
 assert.match(soil,/normal=normalize\(mix\(normal,\(viewMatrix\*vec4\(0\.,1\.,0\.,0\.\)\)\.xyz,\.85\)\)/,'길 마디가 어두운 단(가로 띠)으로 떨어지지 않게 법선을 세운다');
 const fol=compile(n.materials.foliage).fragmentShader;assert.match(fol,/tnLeaf/,'잎 무늬');assert.match(fol,/vColor\.g-vColor\.r/,'줄기 제외');
});

test('바위 부품은 이웃 면과 법선을 나눈 둥근 명암(각진 판지가 아님), 어린 나무는 둥근 관목', ()=>{
 for(const id of TOON_NATURE_IDS.rocks){
  const g=rockGeometry(id);assert.ok(g.index,`${id} 정점 공유`);
  let bent=0;const nm=g.attributes.normal,ix=g.index;
  for(let i=0;i<ix.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(nm,ix.getX(i)),b=new THREE.Vector3().fromBufferAttribute(nm,ix.getX(i+1));if(a.dot(b)<.999)bent++;}
  assert.ok(bent>ix.count/3*.5,`${id} 둥근 명암 ${bent}`);
 }
 // 어린 나무(pine_sapling_medium)는 위로 뾰족한 원뿔이 아니다: 위(0.7~0.9H) 반지름이 아래 덩어리의 절반을 넘는다.
 const p=nature().natureParts('pine_sapling_medium-lod0.glb')[0].geometry.attributes.position,H=5;
 const band=(a,b)=>{let r=0;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y>a*H&&y<b*H)r=Math.max(r,Math.hypot(p.getX(i),p.getZ(i)));}return r;};
 assert.ok(band(.7,.9)>band(.25,.45)*.5,`둥근 관목 ${band(.7,.9)} ${band(.25,.45)}`);
});

test('활엽수는 덩어리 여러 개의 둥근 수관, 침엽수는 위로 좁아지는 원뿔', ()=>{
 const n=nature();
 const pine=n.natureParts('pine_tree_01-lod0.glb')[0].geometry,p=pine.attributes.position;
 // 높이 구간별 최대 반지름: 아래(0.2~0.4H) > 가운데 > 위(0.75~0.95H).
 const H=12.4,band=(a,b)=>{let r=0;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y>a*H&&y<b*H)r=Math.max(r,Math.hypot(p.getX(i),p.getZ(i)));}return r;};
 assert.ok(band(.2,.4)>band(.45,.65)&&band(.45,.65)>band(.75,.95),`원뿔 ${band(.2,.4)} ${band(.45,.65)} ${band(.75,.95)}`);
 // 줄기는 아래 0.25H 안쪽까지만 드러난다(수관이 0.25H 아래에서 시작).
 assert.ok(band(.1,.25)>1,'아래층 수관이 낮게 시작');
});

test('풀밭: 가는 잎(폭 6cm 미만)이 촘촘하고 길가 여유가 거의 없다', ()=>{
 const n=nature(),g=n.geometries.grass.field,p=g.attributes.position,f=g.attributes.toonFlower;
 let blades=0;for(let i=0;i<p.count;i+=15)if(f.getX(i)===0)blades++;
 assert.ok(blades>=16,`잎 ${blades}`);
 // 첫 잎 밑동 두 점 사이 폭
 const w=Math.hypot(p.getX(0)-p.getX(1),p.getZ(0)-p.getZ(1));assert.ok(w<.06,`폭 ${w}`);
 assert.ok(GRASS_FIELD.pathMargin<.1);
});

test('물 띠 모서리 둥글게: 가운데 정점은 그대로, 꺾인 자리의 옆 방향은 앞뒤 평균', ()=>{
 // 90° 꺾인 물 띠(행 7개 × 정점 7개)
 const cols=[-1,-.62,-.3,0,.3,.62,1],pts=[[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[3,3]],pos=[],frame=[];
 pts.forEach(([x,z],k)=>{const a=pts[Math.max(0,k-1)],b=pts[Math.min(6,k+1)],dx=a[0]-b[0],dz=a[1]-b[1],l=Math.hypot(dx,dz);const d=[dx/l,dz/l],sd=[d[1],-d[0]];
  for(const u of cols){pos.push(x+sd[0]*u*1.5,0,z+sd[1]*u*1.5);frame.push(d[0],d[1],sd[0],sd[1]);}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aFrame',new THREE.Float32BufferAttribute(frame,4));
 const before=g.attributes.position.array.slice();
 assert.equal(smoothRibbon(g,7,3),true);
 const P=g.attributes.position;
 for(let k=0;k<7;k++){const j=k*7+3;assert.ok(Math.abs(P.getX(j)-before[j*3])<1e-6&&Math.abs(P.getZ(j)-before[j*3+2])<1e-6,'가운데 그대로');}
 // 꺾인 행(k=3)과 이웃 행(k=2)의 옆 방향 차이가 줄었다.
 const side=k=>[g.attributes.aFrame.getZ(k*7),g.attributes.aFrame.getW(k*7)],ang=(a,b)=>Math.acos(Math.min(1,a[0]*b[0]+a[1]*b[1]));
 assert.ok(ang(side(2),side(3))<Math.PI/4*.75,`이웃 행 각 ${ang(side(2),side(3))}`);
 assert.equal(smoothRibbon(new THREE.BufferGeometry(),7,3),false);
});

test('입구 생울타리: 각진 면 법선을 둥글게 평균하고 잎 재질로, 다른 메시는 그대로', ()=>{
 const n=nature();
 const g=new THREE.IcosahedronGeometry(1,1);g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
 const src=new THREE.MeshStandardMaterial({color:0x4e6b3a,vertexColors:true}),mesh=new THREE.Mesh(g,src);
 assert.equal(n.swapGroundCover(mesh),true);assert.equal(mesh.userData.toonHedge,true);assert.notEqual(mesh.geometry,g,'원본 기하는 복제');
 // 같은 자리 정점의 법선이 같다(둥근 명암).
 const p=mesh.geometry.attributes.position,nm=mesh.geometry.attributes.normal,seen=new Map();
 for(let i=0;i<p.count;i++){const k=`${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`,v=[nm.getX(i),nm.getY(i),nm.getZ(i)];if(seen.has(k)){const w=seen.get(k);assert.ok(Math.abs(w[0]-v[0])+Math.abs(w[1]-v[1])+Math.abs(w[2]-v[2])<1e-4);}else seen.set(k,v);}
 assert.equal(n.swapGroundCover(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x4e6b3a}))),false,'정점색 없는 재질은 아님');
});
