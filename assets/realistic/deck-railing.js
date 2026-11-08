// 산풍경 자체 모델. 깔딱고개 나무계단의 안전 난간·이정표(후기 서술 근거, 위치·치수 추정·현장 확인 전).
// 노면(등산로 노면) 묶음과 따로 두어 보행 접지 raycast에 잡히지 않는다. 충돌 없음.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {textPanel} from './entrance-scenery.js';

export const RAILING={spacing:2.4,offset:.12,height:.95,midHeight:.5,post:.09,rail:.065,chunkMetres:60};
const wood=new THREE.MeshStandardMaterial({color:0x7b5b3e,roughness:.9});
const signWood=new THREE.MeshStandardMaterial({color:0x5f4630,roughness:.92});

// 디딤판 높이(stairRibbonPart와 같은 규칙): 각 단의 앞뒤 점 중 높은 쪽 + 1.5cm.
const treadY=(points,i)=>Math.max(points[i].y,points[Math.min(points.length-1,i+1)].y)+.015;

/** 연속한 deck_stairs 구간마다 RAILING.spacing 간격의 기둥 위치를 고른다. */
export function railingPosts(points,material='deck_stairs'){
 const runs=[];let run=null;
 for(let i=0;i<points.length-1;i++){
  if(points[i].material!==material){run=null;continue;}
  if(!run){run=[];runs.push(run);}
  const p=points[i],last=run.at(-1);
  if(!last||p.s-last.s>=RAILING.spacing||points[i+1].material!==material)run.push({s:p.s,x:p.x,z:p.z,y:treadY(points,i),nx:p.nx,nz:p.nz,width:p.width});
 }
 return runs.filter(r=>r.length>1);
}

function bar(a,b,size){
 const v=new THREE.Vector3().subVectors(b,a),g=new THREE.BoxGeometry(size,size,v.length());
 g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize()));
 g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);return g;
}

// gaps = [{x,z,r}]: 이 원 안의 기둥은 빼고 그 양옆 가로대도 끊는다(계단 옆 벤치 앞 출입구).
export function createDeckRailings(points,{gaps=[]}={}){
 const root=new THREE.Group();root.name='깔딱고개 나무계단 난간 · 추정';root.userData.metricKind='계단 난간';
 const runs=railingPosts(points),chunks=new Map();let posts=0,gapPosts=0;
 const push=(s,g)=>{const k=Math.floor(s/RAILING.chunkMetres);if(!chunks.has(k))chunks.set(k,[]);chunks.get(k).push(g);};
 for(const run of runs)for(const side of [-1,1]){
  const tops=run.map(p=>{const o=p.width/2+RAILING.offset;return new THREE.Vector3(p.x+p.nx*o*side,p.y,p.z+p.nz*o*side);});
  const open=tops.map(t=>gaps.some(g=>Math.hypot(t.x-g.x,t.z-g.z)<g.r));gapPosts+=open.filter(Boolean).length;
  tops.forEach((base,i)=>{
   if(open[i])return;
   const g=new THREE.BoxGeometry(RAILING.post,RAILING.height+.25,RAILING.post);g.translate(base.x,base.y+(RAILING.height+.25)/2-.25,base.z);push(run[i].s,g);posts++;
   if(i===0||open[i-1])return;
   const prev=tops[i-1];
   for(const h of [RAILING.height,RAILING.midHeight])push(run[i].s,bar(new THREE.Vector3(prev.x,prev.y+h,prev.z),new THREE.Vector3(base.x,base.y+h,base.z),h===RAILING.height?RAILING.rail:RAILING.rail*.7));
  });
 }
 for(const parts of chunks.values()){
  const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,wood);mesh.receiveShadow=true;root.add(mesh);
 }
 // 계단 시작부 이정표. 글자는 후기 서술 기준(연주샘·연주대 방향), 실제 표지 문구·위치 미확인.
 const first=runs[0]?.[0],second=runs[0]?.[1];
 if(first&&second){
  const side=-1,o=first.width/2+.7,x=first.x+first.nx*o*side,z=first.z+first.nz*o*side;
  const sign=new THREE.Group();sign.name='깔딱고개 이정표 · 문구·위치 추정';
  const pole=new THREE.Mesh(new THREE.BoxGeometry(.12,2.1,.12),signWood);pole.position.y=1.05;sign.add(pole);
  const board=new THREE.Mesh(new THREE.BoxGeometry(1.25,.36,.05),signWood);board.position.set(0,1.78,0);sign.add(board);
  const text=textPanel('연주샘·연주대 ↑ 깔딱고개',1.17,.29,{background:'#4a3726',color:'#f3e6c8'});
  if(text){text.position.set(0,1.78,.03);sign.add(text);}
  sign.position.set(x,first.y-.015,z);
  // 판 앞면(+Z)이 올라오는 사람 쪽(진행 반대 방향)을 보게 한다.
  sign.rotation.y=Math.atan2(first.x-second.x,first.z-second.z);
  root.add(sign);
 }
 root.userData.counts={runs:runs.length,posts,gapPosts};
 return root;
}
