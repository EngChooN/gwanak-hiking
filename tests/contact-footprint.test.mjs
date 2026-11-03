import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BufferGeometry,Float32BufferAttribute,Matrix4,Vector3,Quaternion,Euler,LOD,Group,InstancedMesh,MeshBasicMaterial} from 'three';
import {contactFootprint,placedContact,seatContactInstance,instanceContactMatrix,contactGroundError} from '../src/contact-footprint.js';

test('일반 바위는 묻힘을 보존하고 회랑 하강만 따라가며 떠 있는 경우 내린다',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-.3,0,-.3,.3,0,.3,0,4.4,0],3));
 const material=new MeshBasicMaterial();
 for(const [before,ground,reference,expected] of [[95,100,100,95],[95,98,100,93],[102,98,100,98],[95,101,100,95]]){
  const lod=new LOD();lod.position.y=90;
  for(const distance of [0,50]){const group=new Group(),mesh=new InstancedMesh(geometry,material,1);mesh.setMatrixAt(0,new Matrix4().makeTranslation(2,before-90,3));group.add(mesh);lod.addLevel(group,distance);}
  const footprint=contactFootprint(lod.levels[0].object.children,'rock');
  const point=seatContactInstance(lod,0,footprint,ground,{kind:'rock',id:'rock_face_02',nearDetail:false,referenceGround:reference});
  assert.ok(point.heightCorrection<=0);assert.ok(Math.abs(point.y-expected)<1e-5);
  assert.equal(contactGroundError(point,ground),0);
  for(const level of lod.levels){const p=placedContact(footprint,instanceContactMatrix(level.object.children[0],0,lod.position),{kind:'rock'});assert.ok(Math.abs(p.y-expected)<1e-5);assert.equal(p.x,2);assert.equal(p.z,3);}
 }
 assert.equal(contactGroundError({y:95,nearDetail:true},100),5);
 assert.equal(contactGroundError({y:100.1,nearDetail:false},100)> .05,true);
 assert.equal(contactGroundError({y:95,nearDetail:false},undefined),null);
 geometry.dispose();material.dispose();
});

test('회랑으로 낮아진 렌더 지형에 모든 바위 LOD를 같은 양만큼 내린다',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-.3,0,-.3,.3,0,.3,0,1,0],3));
 const material=new MeshBasicMaterial(),lod=new LOD();lod.position.set(590,275,2442);
 for(const distance of [0,50]){const group=new Group(),mesh=new InstancedMesh(geometry,material,1);mesh.setMatrixAt(0,new Matrix4().makeTranslation(.58,.19,.45));group.add(mesh);lod.addLevel(group,distance);}
 const footprint=contactFootprint(lod.levels[0].object.children,'rock');
 const point=seatContactInstance(lod,0,footprint,274.48,{kind:'rock',id:'rock_09'});
 assert.ok(Math.abs(point.heightCorrection+.71)<.0001);assert.ok(Math.abs(point.y-274.48)<.0001);
 for(const level of lod.levels){const placed=placedContact(footprint,instanceContactMatrix(level.object.children[0],0,lod.position),{kind:'rock'});assert.ok(Math.abs(placed.y-274.48)<.0001);assert.ok(Math.abs(placed.x-590.58)<.0001);assert.ok(Math.abs(placed.z-2442.45)<.0001);}
 assert.equal(point.opacity,.36);assert.equal(point.terrainAligned,true);geometry.dispose();material.dispose();
});

test('작은 길가 돌은 약한 국소 음영, 큰 바위는 기존 차폐율을 유지한다',()=>{
 const rock=r=>placedContact(new Box3(new Vector3(-r,0,-r),new Vector3(r,.1,r)),new Matrix4(),{kind:'rock'});
 const small=rock(.15),medium=rock(.4),large=rock(1);
 assert.equal(small.radius,.45);assert.equal(small.opacity,.02);
 assert.ok(medium.radius<1.2);assert.equal(medium.opacity,large.opacity);
 assert.equal(rock(.3).opacity,.36);assert.ok(rock(.225).opacity>.18&&rock(.225).opacity<.20);
 assert.equal(rock(.11).opacity,.02);
 assert.equal(large.opacity,.36);assert.equal(large.radius,1.4);
 assert.equal(small.baseRadius,.15);
});

test('수관은 접촉 반경에서 제외하고 편향된 밑동·실제 배치 변환을 보존한다',()=>{
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute([2,0,-.1,2.2,0,.1,2.1,.1,0,-8,8,-8,8,8,8],3));
 const meshes=[{geometry}],footprint=contactFootprint(meshes,'tree');
 assert.ok(footprint.min.x>1.9);assert.ok(footprint.max.x<2.3);
 assert.equal(contactFootprint(meshes,'tree'),footprint);
 const matrix=new Matrix4().compose(new Vector3(10,3,20),new Quaternion().setFromEuler(new Euler(0,Math.PI/2,0)),new Vector3(2,2,2));
 const point=placedContact(footprint,matrix,{kind:'understory',id:'작은나무'});
 assert.ok(Math.abs(point.x-10)<.001);assert.ok(Math.abs(point.z-15.8)<.001);
 assert.equal(point.y,3);assert.equal(point.kind,'understory');assert.ok(point.radius<=1.2);assert.equal(point.opacity,.26);
 geometry.dispose();
});
test('빈 형상은 음영을 만들지 않고 큰 바위도 차폐율과 반경을 제한한다',()=>{
 assert.equal(contactFootprint([],'rock'),null);assert.equal(placedContact(null,new Matrix4(),{kind:'rock'}),null);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-10,0,-10,10,0,10,0,4,0],3));
 const point=placedContact(contactFootprint([{geometry}],'rock'),new Matrix4(),{kind:'rock',nearDetail:true});
 assert.equal(point.radius,4);assert.equal(point.opacity,.36);assert.equal(point.nearDetail,true);geometry.dispose();
});
