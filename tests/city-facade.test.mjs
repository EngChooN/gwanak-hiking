import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,MeshStandardMaterial,PerspectiveCamera,Vector3} from 'three';
import {createCityGrid,facadeUse,buildingAppearance,buildingBounds,EQUIPMENT_MIN_HEIGHT} from '../src/city-grid.js';
import {CITY_TYPES,windowLightAmount,duskAmount,updateCityLight,CITY_LIGHT,cityFacadeMaterial} from '../src/city-facade.js';
import {landmarkGeometry} from '../src/city-landmarks.js';
import {seoulRoadLights,seoulBridgeStructure,seoulWaterMaterial} from '../src/city-water.js';

const square=(x,z,size,height,extra={})=>({id:Math.round(x*7+z*13+size),ground:10,height,footprint:[[x,z],[x+size,z],[x+size,z+size],[x,z+size]],...extra});
const slab=(x,z,height)=>({id:777,ground:0,height,use:'house',footprint:[[x,z],[x+60,z],[x+60,z+14],[x,z+14]]});

test('용도 미상의 높은 건물은 판상이면 아파트, 아니면 업무로 다시 나누고 낮은 건물은 그대로 둔다',()=>{
 assert.equal(facadeUse(slab(0,0,45)),'apartment');
 assert.equal(facadeUse({...square(0,0,40,80),use:'house'}),'office');
 assert.equal(facadeUse({...square(0,0,20,9),use:'house'}),'house');
 assert.equal(facadeUse({...square(0,0,20,90),use:'apartment'}),'apartment');
 // 같은 용도라도 건물마다 외벽색이 다르다(상자 같은 단색 방지).
 const colors=new Set(Array.from({length:40},(_,i)=>buildingAppearance({use:'apartment',id:i*37+1}).color.getHexString()));
 assert.ok(colors.size>=10,`색 ${colors.size}가지`);
});

test('옥상 설비는 건물 높이·범위 안에 들어가고 셰이더 속성(용도·고유값·밑동·높이)이 모든 정점에 있다',async()=>{
 const material=new MeshStandardMaterial(),city=createCityGrid({parent:new Group(),material});
 const tall=square(0,0,40,80,{use:'office'}),low=square(200,0,30,EQUIPMENT_MIN_HEIGHT-5);
 city.addBuildings([tall,low]);await city.finalize();
 const camera=new PerspectiveCamera(65,1,.1,10000);camera.position.set(0,30,0);city.update(camera,1,{inFrustum:()=>true});await city.settle(); // 칸 지오메트리는 가까워질 때 만든다
 const cell=[...city.cells.values()][0],[full]=cell.geometries;full.computeBoundingBox();
 assert.ok(full.boundingBox.max.y<=cell.bounds.max.y+1e-6);assert.ok(Math.abs(full.boundingBox.max.y-90)<1e-6);
 const type=full.attributes.seoulType.array,info=full.attributes.seoulInfo;
 assert.equal(info.count,full.attributes.position.count);
 assert.ok(type.includes(CITY_TYPES.equipment),'옥상 설비');assert.ok(type.includes(CITY_TYPES.beacon),'60m 이상 항공장애등');
 for(let i=0;i<info.count;i++){assert.ok(info.getX(i)>=0&&info.getX(i)<=1);assert.ok(Number.isFinite(info.getY(i))&&info.getZ(i)>0);}
 const far=city.root.children[0].geometry;assert.equal(far.attributes.seoulInfo.count,far.attributes.position.count);
 city.dispose();material.dispose();
});

test('전용 모델이 있는 랜드마크 자리의 OSM 중복 건물(63빌딩 252m)은 빼고 주변 건물은 남긴다',()=>{
 const m=JSON.parse(readFileSync('assets/realistic/generated/manifest.json')),p=m.landmarks.find(l=>l.id==='63-building');
 const exclude=[{x:p.x,z:p.z,radius:45,minHeight:p.height*.5}],status={};
 const city=createCityGrid({parent:new Group(),material:new MeshStandardMaterial(),status,exclude});
 const dup={id:1,ground:15,height:252,footprint:[[p.x-20,p.z-15],[p.x+20,p.z-15],[p.x+20,p.z+15],[p.x-20,p.z+15]]};
 const neighbour={id:2,ground:15,height:40,footprint:[[p.x+30,p.z],[p.x+50,p.z],[p.x+50,p.z+20],[p.x+30,p.z+20]]};
 assert.equal(city.addBuildings([dup,neighbour]),1);assert.equal(status.cityExcluded,1);city.dispose();
});

test('랜드마크 3곳 모델은 실제 높이까지 서고, 유한하며, 제출 1회에 가벼운 크기다',()=>{
 const m=JSON.parse(readFileSync('assets/realistic/generated/manifest.json'));
 for(const [id,top,maxTriangles] of [['63-building',274,4000],['lotte-world-tower',555.65,12000],['n-seoul-tower',236.7,4000]]){
  const p=m.landmarks.find(l=>l.id===id),g=landmarkGeometry({...p,x:0,z:0,ground:0});
  g.computeBoundingBox();const tris=g.attributes.position.count/3;
  assert.ok(Math.abs(g.boundingBox.min.y)<1.5,`${id} 밑동 ${g.boundingBox.min.y}`);
  assert.ok(g.boundingBox.max.y>=top-1&&g.boundingBox.max.y<=top+3,`${id} 꼭대기 ${g.boundingBox.max.y}`);
  assert.ok(tris<maxTriangles,`${id} 삼각형 ${tris}`);
  assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite));
  assert.ok(g.attributes.seoulType.array.includes(CITY_TYPES.beacon),`${id} 항공장애등`);
  g.dispose();
 }
});

test('창 불빛은 낮엔 꺼지고 해가 지면 켜지며, 노을 반사는 해질녘에만 있다',()=>{
 assert.equal(windowLightAmount(40),0);assert.equal(windowLightAmount(-10),1);assert.ok(windowLightAmount(-2)>.3&&windowLightAmount(-2)<1);
 assert.equal(duskAmount(40),0);assert.equal(duskAmount(-20),0);assert.ok(duskAmount(-3)>.5);
 const noon=updateCityLight({now:1e6,search:'?time=12:00',camera:{zoom:1},quality:2});
 assert.equal(noon.night,0);
 const night=updateCityLight({now:2e6,search:'?time=21:00',camera:{zoom:1},quality:0});
 assert.equal(night.night,1);assert.equal(night.detail,0);
 const bino=updateCityLight({now:2e6+10,search:'?time=21:00',camera:{zoom:8},quality:0});
 assert.equal(bino.detail,1,'휴대폰도 쌍안경을 쓰면 세부 단계');
 assert.ok(Math.abs(CITY_LIGHT.citySun.value.length()-1)<1e-6);
});

test('밤 거리 불빛은 도로·다리를 따라 놓이고 다리 불빛은 데크 높이에 있다',()=>{
 const road={points:[[0,0],[400,0]],width:22,kind:'primary'},bridge={points:[[0,500],[400,500]],width:22,bridge:true};
 const lights=seoulRoadLights([road,bridge],()=>5),pos=lights.geometry.attributes.position;
 assert.ok(pos.count>=20);let bridgeLamps=0;
 for(let i=0;i<pos.count;i++){assert.ok(Number.isFinite(pos.getY(i)));if(Math.abs(pos.getZ(i)-500)<20){bridgeLamps++;assert.ok(Math.abs(pos.getY(i)-27.5)<1e-6);}}
 assert.ok(bridgeLamps>=30);
 lights.userData.update(0);assert.ok(lights.geometry.drawRange.count<pos.count);lights.userData.update(2);assert.equal(lights.geometry.drawRange.count,pos.count);
 const structure=seoulBridgeStructure([road,bridge],()=>5),p=structure.attributes.position;
 const ys=Array.from(p.array).filter((_,i)=>i%3===1);
 assert.ok(Math.min(...ys)<=4,'교각이 수면 아래까지');assert.ok(Math.max(...ys)<=26+1e-6);
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getZ(i)-500)<20,'일반 도로엔 교량 구조 없음');
 lights.geometry.dispose();lights.material.dispose();structure.dispose();
});

test('도시·한강 재질은 서로 다른 셰이더 캐시 키를 쓴다',()=>{
 const lit=cityFacadeMaterial(new MeshStandardMaterial()),basic=cityFacadeMaterial(null,{basic:true}),water=seoulWaterMaterial();
 const keys=new Set([lit,basic,water].map(m=>m.customProgramCacheKey()));assert.equal(keys.size,3);
 assert.ok(new Vector3().copy(CITY_LIGHT.citySun.value).length()>0);
});
