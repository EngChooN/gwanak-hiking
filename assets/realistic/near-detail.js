import * as THREE from 'three';
import {mix,nearestRoute} from './geo.js';
import {foliageUniforms} from './foliage-shader.js';
import {HARD_SURFACES} from './ground-cover-mask.js';

// 기존 CC0 모델을 재사용한 시각 보완. 현장 개체 위치를 뜻하지 않는다.
// 64m 청크·고정 난수. 길 중앙은 비우고 정상 직전에는 낮은 관목만 둔다.
export function nearDetailPlacements(route){
 let seed=20261103;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const groups=new Map(),grass=[];
 function add(id,kind,p){const key=`${id}:${Math.floor(p.x/64)}:${Math.floor(p.z/64)}`;
  if(!groups.has(key))groups.set(key,{id,kind,nearDetail:true,levels:id==='rock_09'?[{url:'rock_09-lod2.glb',distance:0}]:[0,1,2].map((i)=>({url:`${id}-lod${i}.glb`,distance:[0,48,110][i]})),placements:[]});
  groups.get(key).placements.push(p);
 }
 let next=0;
 for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],length=Math.hypot(b.x-a.x,b.z-a.z)||1;
  while(next<=b.s){const t=Math.max(0,Math.min(1,(next-a.s)/(b.s-a.s||1))),cx=mix(a.x,b.x,t),cz=mix(a.z,b.z,t),y=mix(a.y,b.y,t),width=mix(a.width,b.width,t);
   for(const side of [-1,1]){
    const offset=width/2+.18+random()*.85,x=cx-(b.z-a.z)/length*offset*side,z=cz+(b.x-a.x)/length*offset*side;
    const hit=nearestRoute(route,x,z);
    if(hit.distance>hit.width/2+.08){
     add('rock_09','rock',{x,z,scale:1.2+random()*4.5,yaw:random()*Math.PI*2,embed:.006});
     // 분포 미확정으로 수종명을 붙이지 않는다. 길가·경사면의 임시 표현.
     for(let band=0;band<3;band++){
      const d=width/2+.3+band*1.8+random()*1.5;
      const gx=cx-(b.z-a.z)/length*d*side,gz=cz+(b.x-a.x)/length*d*side;
      const gh=nearestRoute(route,gx,gz);
      if(gh.distance<=gh.width/2+.15)continue;
      const roll=random(),kind=roll<.48?'litter':roll<.9?'grass':'shrub';
      if(y>600&&kind==='shrub')continue;
      const scale=.65+random()*.7,yaw=random()*Math.PI*2;
      // 포장·계단·데크 노면에는 포기 가장자리(낙엽 .36m, 풀·관목 .2m × 배율)도 걸치지 않게 한다. 난수는 이미 뽑아 순서를 지킨다.
      if(HARD_SURFACES.includes(route[gh.index]?.material)||HARD_SURFACES.includes(route[gh.index+1]?.material))if(gh.distance<gh.width/2+(kind==='litter'?.36:.2)*scale)continue;
      grass.push({x:gx,z:gz,kind,scale,yaw});
     }
    }
    if(y>430&&next%12<2){const d=width/2+2.5+random()*6,px=cx-(b.z-a.z)/length*d*side,pz=cz+(b.x-a.x)/length*d*side;
     const h=nearestRoute(route,px,pz);if(h.distance>h.width/2+1.5)add(y<600&&random()<.25?'pine_tree_01':'pine_sapling_medium','tree',{x:px,z:pz,scale:y<600?.36+random()*.28:.22+random()*.12,yaw:random()*Math.PI*2,embed:.035});
    }
   }
   next+=2;
  }
 }
 return {entries:[...groups.values()],grass};
}

export function grassClumps(placements,height){
 const root=new THREE.Group();root.name='길가 하층 식생 · 임시 표현';const groups=new Map();
 for(const p of placements){const key=`${p.kind??'grass'}:${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const resources=new Map();
 for(const [kind,color] of [['grass',0x596342],['litter',0x786044],['shrub',0x4b5939]]){
  const vertices=[];
  for(let i=0;i<(kind==='shrub'?8:5);i++){
   const a=i*2.399,x=Math.cos(a)*.17,z=Math.sin(a)*.17;
   if(kind==='litter')vertices.push(x-.09,.025,z,x+.09,.025,z,x,.04,z+.19);
   else {const h=kind==='shrub'?.45+i*.025:.18+i*.018;vertices.push(x-.035,0,z,x+.035,0,z,x+.08,h,z+.025);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  // 이전 하층 식생도 같은 눈높이에 맞춘다. 낙엽 크기는 유지한다.
  if(kind!=='litter')geometry.scale(.65,kind==='shrub'?.45:.65,.65);
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide});
  // 길가 풀·관목도 숲 풀과 같은 시각으로 끝부분이 흔들린다. 낙엽은 바닥에 붙어 있어 고정한다.
  if(kind!=='litter'){
   material.onBeforeCompile=shader=>{
    shader.uniforms.foliageTime=foliageUniforms.foliageTime;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float foliageTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
     #ifdef USE_INSTANCING
     vec3 roadsideAnchor=instanceMatrix[3].xyz;float roadsideTip=position.y*position.y*${kind==='shrub'?'4.':'9.'};
     transformed.x+=sin(foliageTime*1.5+roadsideAnchor.x*.08+roadsideAnchor.z*.06)*roadsideTip*.35;
     transformed.z+=sin(foliageTime*1.1+roadsideAnchor.z*.07)*roadsideTip*.2;
     #endif`);
   };
   material.customProgramCacheKey=()=>`roadside-${kind}-wind-v1`;
  }
  resources.set(kind,{geometry,material});
 }
 const dummy=new THREE.Object3D();
 for(const list of groups.values()){const {geometry,material}=resources.get(list[0].kind??'grass');const mesh=new THREE.InstancedMesh(geometry,material,list.length);
  list.forEach((p,i)=>{dummy.position.set(p.x,height(p.x,p.z)-.025,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.userData.fullCount=list.length;mesh.userData.metricKind='하층 식생';
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}

// 고정 난수 순서의 접두부만 사용하여 화질 변경 시 재생성·행렬 업로드를 피한다.
export function updateGroundCover(mesh,distance,quality){
 const far=[28,45,65][quality],near=[10,16,24][quality];
 mesh.visible=distance<far;
 const density=[.25,.5,1][quality]*(distance<near?1:.35);
 mesh.count=Math.ceil(mesh.userData.fullCount*density);
}
