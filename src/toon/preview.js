// 카툰 모드 화면 확인용(vite dev: /src/toon/preview.html). 큐브·나무·풀밭·도시 상자와 시간 슬라이더.
// 실제 게임과 같은 createToonStyle 인터페이스만 쓴다. 외부 자료는 불러오지 않는다.
import * as THREE from 'three';
import {createToonStyle} from './index.js';
import {composeEnvironment} from '../daytime.js';
import {sunDirection} from '../look-profile.js';
import {foliageUniforms} from '../../assets/realistic/foliage-shader.js';

const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0xc9d6e3,120,2600);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,30000);
camera.position.set(-15,9,26);camera.lookAt(-2,4,-30);
const toon=await createToonStyle({renderer,scene,camera,mobile:false});
const f=toon.materialFactory;

// 빛: 해/달 방향광 + 반구광.
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:220});sun.shadow.bias=-.0005;
scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xbfdcff,0x5a6b3a,1);scene.add(hemi);

// 지형: 완만한 언덕 + 급경사 바위 벽(경사 기반 색 확인).
const ground=new THREE.PlaneGeometry(1600,1600,220,220);ground.rotateX(-Math.PI/2);
// 높이는 해석식 하나로 지형·배치에 함께 쓴다(레이캐스트 없이 빠르게).
function heightAt(x,z){
 let y=Math.sin(x*.05)*2.2+Math.cos(z*.045)*2+Math.sin((x+z)*.11)*.6;
 // 오른쪽(동쪽)만 바위 절벽·능선, 왼쪽은 열려 있어 원경 도시가 보인다.
 const side=Math.max(0,Math.min(1,(x-2)/26)),cliff=Math.max(0,Math.min(1,(-z-40)/14))*side;
 y+=cliff*cliff*28+Math.max(0,-z-54)*.15*side+(x>30?(x-30)*.9:0);
 // 왼쪽 앞은 서서히 내려가 도시가 지평선 위로 드러난다.
 y-=Math.max(0,-z-60)*.05*(1-side)+Math.max(0,-x-40)*.04;
 return y;
}
const gp=ground.attributes.position;
for(let i=0;i<gp.count;i++)gp.setY(i,heightAt(gp.getX(i),gp.getZ(i)));
ground.computeVertexNormals();
const terrain=new THREE.Mesh(ground,f.terrain());terrain.receiveShadow=true;scene.add(terrain);

// 등산로 띠(soil·rock·stairs).
const trailKinds=['soil','rock','stairs','deck_stairs','paved','ridge'];
trailKinds.forEach((kind,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(2.2,8).rotateX(-Math.PI/2),f.trail(kind));m.position.set(-4+i*.05,heightAt(-4,14-i*8)+.06,14-i*8);m.rotation.y=.15*i;m.receiveShadow=true;scene.add(m);});

// 실사 재질 상자(toonify 대상): 바위·시설.
const props=new THREE.Group();
const rocks=[[6,-6,3,0x9aa0a6],[12,2,2.2,0xb1b5b8],[-10,-12,4,0x8f8a80]];
for(const [x,z,s,c]of rocks){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),new THREE.MeshStandardMaterial({color:c,roughness:1}));m.position.set(x,heightAt(x,z)+s*.5,z);m.rotation.set(x,z,0);m.castShadow=m.receiveShadow=true;props.add(m);}
const bench=new THREE.Mesh(new THREE.BoxGeometry(3,.5,1),new THREE.MeshPhysicalMaterial({color:0xa0764a}));bench.position.set(0,heightAt(0,4)+.5,4);bench.castShadow=true;props.add(bench);
const sign=new THREE.Mesh(new THREE.BoxGeometry(.2,2.4,.2),new THREE.MeshBasicMaterial({color:0x6b4e36}));sign.position.set(2,heightAt(2,6)+1.2,6);props.add(sign);
scene.add(toon.toonify(props,{kind:'prop'}));

// 나무: 줄기(인스턴스) + 잎 카드(toonAlphaCutout → 덩어리 메시로 바뀜). 인스턴스 색 = 잎 색.
const trees=new THREE.Group(),trunkGeo=new THREE.CylinderGeometry(.25,.4,6,7).translate(0,3,0);
const cards=new THREE.BufferGeometry();{const pos=[],idx=[];for(let k=0;k<12;k++){const a=k*2.4,y=4+(k%4)*1.3,r=2.6-(k%4)*.45,cx=Math.cos(a)*r*.5,cz=Math.sin(a)*r*.5,o=pos.length/3;pos.push(cx-1.5,y-1.2,cz,cx+1.5,y-1.2,cz,cx+1.5,y+1.2,cz,cx-1.5,y+1.2,cz);idx.push(o,o+1,o+2,o,o+2,o+3);}cards.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));cards.setIndex(idx);cards.computeVertexNormals();}
const leafMat=new THREE.MeshStandardMaterial({color:0x5f8a3a,alphaTest:.5,side:THREE.DoubleSide,name:'pine_leaves'});leafMat.userData.toonAlphaCutout=true;
const placements=[];for(let i=0;i<46;i++){const a=i*2.39996,r=14+Math.sqrt(i)*9;const x=Math.cos(a)*r+8,z=Math.sin(a)*r-24;if(z<-46)continue;placements.push([x,z,.8+((i*37)%10)/14,a]);}
const trunks=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:0x6b4e36,name:'trunk_bark'}),placements.length);
const crowns=new THREE.InstancedMesh(cards,leafMat,placements.length);
const tint=[0x4f8a3c,0x6c9b4a,0x3f7a4a,0x88a84a,0xc98a3a];
placements.forEach(([x,z,s,a],i)=>{const m=new THREE.Matrix4().compose(new THREE.Vector3(x,heightAt(x,z)-.2,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,a,0)),new THREE.Vector3(s,s,s));trunks.setMatrixAt(i,m);crowns.setMatrixAt(i,m);crowns.setColorAt(i,new THREE.Color(tint[i%tint.length]));});
trunks.castShadow=crowns.castShadow=true;trunks.receiveShadow=crowns.receiveShadow=true;trees.add(trunks,crowns);
scene.add(toon.toonify(trees,{kind:'nature'}));

// 풀밭: 작은 원뿔 인스턴스에 patchFoliage(바람 흔들림 + 연두↔청록 물결).
const grassGeo=new THREE.ConeGeometry(.12,.7,4).translate(0,.35,0);
const grassMat=toon.patchFoliage(f.basic(0x8fbf5a).clone(),{kind:'grass'});
const grass=new THREE.InstancedMesh(grassGeo,grassMat,9000);
for(let i=0;i<grass.count;i++){const x=-34+((i*7919)%6800)/100,z=-30+((i*104729)%5200)/100;const s=.7+((i*13)%7)/10;grass.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,heightAt(x,z),z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,i,0)),new THREE.Vector3(s,s*(.8+((i*29)%9)/10),s)));}
grass.receiveShadow=true;scene.add(grass);

// 원경 도시 상자: city-grid.js와 같은 정점 속성(color, seoulInfo=[seed,base,height]).
const city=new THREE.Group();city.name='미리보기 도시';scene.add(city);
const cityStyle=toon.styleCity({material:new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),nightLights:[]});
cityStyle.apply(city);
{
 const parts=[];
 for(let i=0;i<260;i++){
  const a=-.95+(i%52)/52*1.9,ring=Math.floor(i/52),d=650+ring*380+((i*97)%140);
  const x=Math.sin(a)*d+10,z=-Math.cos(a)*d-60,w=18+((i*31)%30),h=20+((i*53)%90)+(ring<2?20:0),dd=16+((i*17)%24);
  const g=new THREE.BoxGeometry(w,h,dd).translate(x,h/2-6,z);
  const n=g.attributes.position.count,seed=((i*0.61803)%1)||.5,info=new Float32Array(n*3),col=new Float32Array(n*3);
  for(let k=0;k<n;k++){info.set([seed,-6,h],k*3);col.set([.7,.7,.72],k*3);}
  g.setAttribute('seoulInfo',new THREE.BufferAttribute(info,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));parts.push(g);
 }
 const {mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
 city.add(new THREE.Mesh(mergeGeometries(parts),new THREE.MeshStandardMaterial()));
 parts.forEach(g=>g.dispose());
}
toon.createSky();

// 시간: 슬라이더의 태양 고도(방위는 노을 쪽 서남서 고정)로 environment와 같은 env를 만든다.
const input=document.getElementById('elevation'),text=document.getElementById('elevationText'),info=document.getElementById('info');
let env,elevation=+input.value;
const sunVec=new THREE.Vector3(),moonVec=new THREE.Vector3();
function setElevation(el){
 elevation=el;input.value=el;text.textContent=`${el}°`;
 const azimuth=el>15?200:245;
 env=composeEnvironment({sun:{elevation:el,azimuth},moon:{elevation:38,azimuth:120,illumination:.8}});
 sunVec.fromArray(sunDirection(el,azimuth));moonVec.fromArray(sunDirection(38,120));
 const light=env.light,dir=light.elevation===el?sunVec:moonVec;
 sun.position.copy(dir).multiplyScalar(90);sun.target.position.set(0,0,0);
 // 미리보기는 노을 앞면도 따뜻하게 받도록 낮은 해를 조금 보탠다(실제 게임 빛은 rendering.js가 맡는다).
 sun.color.setRGB(...light.color,THREE.SRGBColorSpace);sun.intensity=Math.max(.05,light.intensity)*1.15+(el>-1.5&&el<12?1.2:0);sun.castShadow=light.castShadow;
 hemi.intensity=.06+env.ambient*1.1;hemi.color.setRGB(...env.hemiColor,THREE.SRGBColorSpace);
 scene.fog.color.setRGB(...env.fogColor,THREE.SRGBColorSpace);
 renderer.toneMappingExposure=env.exposureMul;
 toon.updateSky(env,sunVec,moonVec);
 const s=toon.pipeline.update(env);
 info.textContent=`낮 ${s.phase.day.toFixed(2)} · 노을 ${s.phase.sunset.toFixed(2)} · 밤 ${s.phase.night.toFixed(2)}\n블룸 문턱 ${s.bloom.threshold.toFixed(2)} / 세기 ${s.bloom.strength.toFixed(2)} · 외곽선 ${s.outline.color}`;
}
input.addEventListener('input',()=>setElevation(+input.value));
document.querySelectorAll('[data-el]').forEach(b=>b.addEventListener('click',()=>setElevation(+b.dataset.el)));
const q=new URLSearchParams(location.search);
setElevation(q.has('el')?+q.get('el'):elevation);

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const dpr=Math.min(devicePixelRatio,2);renderer.setPixelRatio(dpr);toon.pipeline.resize(Number(q.get('quality')??2),innerWidth,innerHeight,dpr);}
addEventListener('resize',resize);resize();

const clock=new THREE.Clock();let frames=0;
renderer.setAnimationLoop(()=>{
 const dt=clock.getDelta();foliageUniforms.foliageTime.value+=dt;
 toon.updateSky(env,sunVec,moonVec);toon.pipeline.render(dt);frames++;
});
// 캡처 스크립트용.
window.toonPreview={setElevation,get frames(){return frames;},status:toon.status,renderer};
