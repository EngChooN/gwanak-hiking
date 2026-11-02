import * as THREE from 'three';
import {mix,nearestRoute} from './geo.js';

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
    if(hit.distance>hit.width/2+.08){add('rock_09','rock',{x,z,scale:1.2+random()*4.5,yaw:random()*Math.PI*2,embed:.006});grass.push({x:x+(random()-.5)*.3,z:z+(random()-.5)*.3,scale:.6+random()*.8,yaw:random()*Math.PI*2});}
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
 const root=new THREE.Group();root.name='길가 풀 군집';const groups=new Map();
 for(const p of placements){const key=`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const vertices=[];for(let i=0;i<5;i++){const a=i*2.399,x=Math.cos(a)*.09,z=Math.sin(a)*.09;vertices.push(x-.018,0,z,x+.018,0,z,x+.05,.16+i*.018,z+.025);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:0x596342,roughness:1,side:THREE.DoubleSide});
 const dummy=new THREE.Object3D();
 for(const list of groups.values()){const mesh=new THREE.InstancedMesh(geometry,material,list.length);
  list.forEach((p,i)=>{dummy.position.set(p.x,height(p.x,p.z)-.025,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}
