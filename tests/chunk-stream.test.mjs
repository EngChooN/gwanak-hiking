import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createChunkStreamer,disposeObject3D} from '../src/chunk-stream.js';

const chunks=[];
for(let j=0;j<5;j++)for(let i=0;i<10;i++)chunks.push({id:`${i}_${j}`,i,j,x0:-1000+i*200,z0:-1000+j*200});
const at=(i,j)=>({x:-1000+i*200+100,z:-1000+j*200+100});
const tick=()=>new Promise(r=>setImmediate(r));
const flush=async(n=5)=>{for(let k=0;k<n;k++)await tick();};

function makeObj(){
  const tex=new T.Texture(),tex2=new T.Texture();
  const mat=new T.MeshStandardMaterial({map:tex,normalMap:tex2});
  const geo=new T.BoxGeometry();
  const counts={geo:0,mat:0,tex:0};
  geo.addEventListener('dispose',()=>counts.geo++);mat.addEventListener('dispose',()=>counts.mat++);tex.addEventListener('dispose',()=>counts.tex++);tex2.addEventListener('dispose',()=>counts.tex++);
  const g=new T.Group();g.add(new T.Mesh(geo,mat));
  return {g,counts,tex,mat,geo};
}
function harness(opts={}){
  const scene=new T.Scene(),made=new Map(),attached=[],aborted=[];
  const s=createChunkStreamer({chunks,radius:1,...opts,
    load:async(chunk,signal)=>{signal.addEventListener('abort',()=>aborted.push(chunk.id));if(opts.delay)await opts.delay(chunk,signal);const o=makeObj();made.set(chunk.id,o);return o.g;},
    attach:(obj,chunk)=>{scene.add(obj);attached.push(chunk.id);}});
  return {s,scene,made,attached,aborted};
}

test('프레임당 attach 1개, radius 안 9개 로드',async()=>{
  const h=harness();const p=at(5,2);
  h.s.update(p);await flush();
  assert.equal(h.s.status().inFlight,0);
  assert.equal(h.attached.length,0);
  for(let n=1;n<=3;n++){h.s.update(p);assert.equal(h.attached.length,n);}// 프레임당 1개
  for(let k=0;k<20;k++){h.s.update(p);await flush(2);}
  assert.equal(h.attached.length,9);assert.equal(h.scene.children.length,9);
  assert.equal(h.s.status().loaded,9);assert.equal(h.s.status().pending,0);
  assert.deepEqual(h.attached[0],'5_2');// 가장 가까운 청크 먼저
});

test('모서리 위치는 존재하는 청크만 로드',async()=>{
  const h=harness();h.s.update({x:-1000+10,z:-1000+10});await flush();
  for(let k=0;k<10;k++)h.s.update({x:-990,z:-990});
  assert.equal(h.attached.length,4);
});

test('범위 이탈 시 해제하고 geometry·material·texture를 dispose',async()=>{
  const h=harness();
  for(let k=0;k<12;k++){h.s.update(at(2,2));await flush(2);}
  assert.equal(h.s.status().loaded,9);
  for(let k=0;k<30;k++){h.s.update(at(8,2));await flush(2);}
  const st=h.s.status();
  assert.equal(st.loaded,9);
  assert.ok(!st.ids.some(id=>Number(id.split('_')[0])<=3));
  assert.deepEqual(st.disposed,{geometries:9,materials:9,textures:18});
  for(const id of ['1_1','2_2','3_3']){const o=h.made.get(id);assert.equal(o.counts.geo,1);assert.equal(o.counts.mat,1);assert.equal(o.counts.tex,2);assert.equal(o.g.parent,null);}
});

test('히스테리시스: unloadRadius 안에서는 왕복해도 해제·재로드 없음',async()=>{
  const h=harness();
  for(let k=0;k<12;k++){h.s.update(at(5,2));await flush(2);}
  const loads=h.made.size;
  for(let n=0;n<6;n++){
    for(let k=0;k<4;k++){h.s.update(at(6,2));await flush(1);}// 한 칸 이동: 4_*는 거리 2 = unloadRadius 이내
    for(let k=0;k<4;k++){h.s.update(at(5,2));await flush(1);}
  }
  assert.equal(h.s.status().disposed.geometries,0);
  assert.ok(h.s.status().ids.includes('4_2'));
  for(let k=0;k<8;k++){h.s.update(at(6,2));await flush(2);}
  assert.ok(h.s.status().ids.includes('4_2'),'unloadRadius 이내라 유지');
  for(let k=0;k<8;k++){h.s.update(at(7,2));await flush(2);}
  assert.ok(!h.s.status().ids.includes('4_2'),'거리 3이면 해제');
  assert.ok(h.made.size>loads);
});

test('로딩 중 범위를 벗어나면 AbortController로 취소',async()=>{
  const gates=new Map();
  const h=harness({delay:(chunk,signal)=>new Promise(res=>{gates.set(chunk.id,res);})});
  h.s.update(at(1,1));await flush();
  assert.ok(h.s.status().inFlight>0);
  const pendingIds=[...gates.keys()];
  h.s.update(at(8,3));await flush();
  for(const id of pendingIds)assert.ok(h.aborted.includes(id),`${id} 취소`);
  for(const r of gates.values())r();// 뒤늦게 끝나도 attach되지 않음
  await flush();
  for(let k=0;k<5;k++)h.s.update(at(8,3));
  assert.ok(!h.attached.some(id=>pendingIds.includes(id)&&Number(id.split('_')[0])<4));
  assert.equal(h.scene.children.every(c=>true),true);
});

test('ready: radius 안 청크가 모두 붙으면 resolve',async()=>{
  const h=harness();const p=at(4,2);let done=false;
  const r=h.s.ready(p).then(()=>{done=true;});
  await flush();assert.equal(done,false);
  for(let k=0;k<8;k++){h.s.update(p);await flush(1);}
  assert.equal(done,false,'9개 중 일부만 attach됨');
  for(let k=0;k<5;k++){h.s.update(p);await flush(1);}
  await r;assert.equal(done,true);
  assert.equal(h.s.status().loaded,9);
});

test('load가 null이면 빈 청크로 처리하고 ready에 영향 없음, 실패도 ready를 막지 않음',async()=>{
  const s=createChunkStreamer({chunks,load:async c=>{if(c.id==='4_2')return null;if(c.id==='5_2')throw new Error('x');return new T.Group();},attach:()=>{}});
  const p=at(4,2);const r=s.ready(p);
  for(let k=0;k<15;k++){s.update(p);await flush(1);}
  await r;const st=s.status();assert.equal(st.failed,1);assert.ok(st.ids.includes('4_2'));
});

test('dispose: 남은 청크 전부 해제, 대기 중 ready 해소',async()=>{
  const h=harness();
  for(let k=0;k<14;k++){h.s.update(at(5,2));await flush(1);}
  const r=h.s.ready(at(5,2));h.s.dispose();await r;
  assert.equal(h.s.status().disposed.geometries,9);assert.equal(h.s.status().loaded,0);assert.equal(h.scene.children.length,0);
});

test('disposeObject3D: userData.shared·keep 자원은 건너뜀, InstancedMesh 처리',()=>{
  const sharedTex=new T.Texture();sharedTex.userData.shared=true;
  const keepTex=new T.Texture(),ownTex=new T.Texture(),emTex=new T.Texture();
  const sharedGeo=new T.BoxGeometry();sharedGeo.userData.shared=true;
  const mat=new T.MeshStandardMaterial({map:sharedTex,aoMap:keepTex,roughnessMap:ownTex,emissiveMap:emTex});
  const inst=new T.InstancedMesh(sharedGeo,mat,4);
  let instDisposed=0;inst.addEventListener('dispose',()=>instDisposed++);
  const geo2=new T.BoxGeometry(),mat2=new T.MeshBasicMaterial();
  const mat3=new T.MeshBasicMaterial();mat3.userData.shared=true;
  const root=new T.Group();root.add(inst,new T.Mesh(geo2,[mat2,mat3]));
  const hit=[];for(const [n,t] of Object.entries({sharedTex,keepTex,ownTex,emTex}))t.addEventListener('dispose',()=>hit.push(n));
  const c=disposeObject3D(root,{keep:new Set([keepTex])});
  assert.deepEqual(hit.sort(),['emTex','ownTex']);
  assert.equal(instDisposed,1);
  assert.deepEqual(c,{geometries:1,materials:2,textures:2});
  // 같은 자원 중복 방문 시 한 번만
  const g=new T.BoxGeometry(),m=new T.MeshBasicMaterial();const r2=new T.Group();r2.add(new T.Mesh(g,m),new T.Mesh(g,m));
  assert.deepEqual(disposeObject3D(r2),{geometries:1,materials:1,textures:0});
});
