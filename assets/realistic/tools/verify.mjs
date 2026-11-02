// 미실행. 실제 생성물이 없으면 성공 처리하지 않는다.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {project,unproject,gridHeight,cutHeight,alignRoute,nearestRoute,headingDistance} from '../geo.js';
import {placeReference,measureReference,angularDifference,contrastAt,directionRows} from '../skyline-reference.js';
const folder=fileURLToPath(new URL('../generated/',import.meta.url));
const results=[];
const check=(name,fn)=>{fn();results.push({name,passed:true});};
check('기준점과 동·북 방향',()=>{
  assert.deepEqual(project(37.46803,126.946528),{x:0,z:0});
  const east=project(37.46803,126.947528),north=project(37.46903,126.946528);
  assert.ok(east.x>88&&east.x<89);assert.ok(north.z< -110&&north.z> -112);
  const p=unproject(east.x,north.z);assert.ok(Math.abs(p.lat-37.46903)<1e-10);assert.ok(Math.abs(p.lon-126.947528)<1e-10);
});
check('평면 고도 격자의 중심·경계·범위 밖',()=>{
  const g={x0:0,z0:0,spacing:10,width:2,height:2,values:[0,10,20,30]};
  assert.equal(gridHeight(g,5,5),15);assert.equal(gridHeight(g,10,10),30);
  assert.throws(()=>gridHeight(g,-1,0),RangeError);
});
check('중심 고도·횡단 수평·원본 보존',()=>{
  const original=[{x:0,z:0,y:300},{x:10,z:0,y:400}];
  const r=alignRoute(original,(x,z)=>100+x*.1+z*.2);
  assert.equal(original[0].y,300);assert.equal(original[0].alignedY,undefined);
  assert.equal(r[0].y,100);
  for(const z of [-1,0,1])assert.equal(cutHeight(100+z*.2,nearestRoute(r,0,z)),r[0].y);
  assert.ok(Math.abs(r[1].s-Math.hypot(10,1))<1e-8);
});
check('고도 기준 보정·수평거리 보간·GPX 수직 기준 독립성',()=>{
  const points=[{x:0,z:0,y:999},{x:10,z:0,y:-999},{x:40,z:0,y:999}];
  const r=alignRoute(points,x=>50+x,{summitHeight:632});
  assert.equal(r[0].y,50);assert.equal(r.at(-1).y,632);
  assert.equal(r[1].y,60+(632-90)/4);
  assert.equal(r[1].demCenterY,60);assert.equal(r[1].originalY,-999);
  const controlled=alignRoute(points,x=>50+x,{startHeight:75,summitHeight:632});
  assert.equal(controlled[0].y,75);assert.equal(controlled.at(-1).y,632);
  assert.deepEqual(alignRoute([],()=>NaN),[]);
  assert.throws(()=>alignRoute(points,()=>NaN));
});
check('방위각: 북 0·동 90·남 180',()=>{
  const from={x:0,z:0};
  assert.ok(Math.abs(headingDistance(37.47803,126.946528,from).bearing)<1e-8);
  assert.equal(headingDistance(37.46803,126.956528,from).bearing,90);
  assert.equal(headingDistance(37.45803,126.946528,from).bearing,180);
});
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
check('서울 원경 확정 기준·네 방향·헤이즈',()=>{
  const expected={'n-seoul-tower':[10,12000],'63-building':[346,8600],'lotte-world-tower':[59,14300],'hangang-bridge':[356,7900],'bukhansan':[6,24100]};
  for(const [id,[bearing,distance]] of Object.entries(expected)){
    const p=config.landmarks.find(p=>p.id===id);assert.ok(p);assert.equal(p.bearing,bearing);assert.equal(p.distance,distance);
  }
  assert.equal(config.landmarks.find(p=>p.id==='lotte-world-tower').height,555);
  assert.deepEqual(config.directionCaptures.bearings,[0,60,340,200]);
  assert.equal(config.atmosphere.haze.toUpperCase(),'#C9D6E3');
  for(const d of [8000,9000,10000,11000,12000]){const c=contrastAt(d,config.atmosphere.contrastStops);assert.ok(c>=.35&&c<=.45);}
  assert.equal(angularDifference(356,0),-4);assert.equal(angularDifference(0,340),20);
});
check('동서남북 배치축과 연주대 기준 독립성',()=>{
  const anchor=project(config.observation.lat,config.observation.lon);
  const north=placeReference({bearing:0,distance:1000},config.observation);
  const east=placeReference({bearing:90,distance:1000},config.observation);
  assert.ok(Math.abs(north.x-anchor.x)<1e-8);assert.ok(Math.abs(north.z-(anchor.z-1000))<1e-8);
  assert.ok(Math.abs(east.x-(anchor.x+1000))<1e-8);assert.ok(Math.abs(east.z-anchor.z)<1e-8);
});
const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
const route=JSON.parse(await readFile(path.join(folder,manifest.route),'utf8'));
const elevationAudit=JSON.parse(await readFile(path.join(folder,'elevation-audit.json'),'utf8'));
check('정상 632m±10m·원시 DEM 보존·입구 잠정 상태 명시',()=>{
  assert.ok(Math.abs(route.at(-1).y-632)<=10);
  assert.equal(route[0].y,route[0].demCenterY);
  assert.equal(elevationAudit.start.actualToleranceVerified,false);
  assert.equal(elevationAudit.geoidCorrectionApplied,false);
  assert.equal(elevationAudit.summit.rawDem,route.at(-1).demCenterY);
  for(const p of route)assert.ok(Math.abs(p.y-p.demCenterY-p.elevationCorrection)<1e-8);
});
check('생성된 실제 배치·원경 범위·대기 프리셋',()=>{
  assert.deepEqual(manifest.observation,config.observation);assert.deepEqual(manifest.atmosphere,config.atmosphere);
  for(const expected of config.landmarks){
    const p=manifest.landmarks.find(p=>p.id===expected.id);assert.ok(p);
    const actual=measureReference(p,config.observation);
    assert.ok(Math.abs(angularDifference(actual.bearing,expected.bearing))<.01);
    assert.ok(Math.abs(actual.distance-expected.distance)<.1);
    assert.ok(p.x>=manifest.far.x0&&p.z>=manifest.far.z0);
    assert.ok(p.x<=manifest.far.x0+(manifest.far.width-1)*manifest.far.spacing);
    assert.ok(p.z<=manifest.far.z0+(manifest.far.height-1)*manifest.far.spacing);
  }
  const rows=directionRows(manifest.landmarks,config.observation,0,80);
  assert.equal(rows.find(p=>p.id==='n-seoul-tower').inHorizontalFrame,true);
  assert.equal(rows.find(p=>p.id==='lotte-world-tower').inHorizontalFrame,false);
});
check('337점·폭·유한 좌표·누적 거리',()=>{
  assert.equal(route.length,337);
  route.forEach((p,i)=>{for(const key of ['x','y','z','s','width','originalY'])assert.ok(Number.isFinite(p[key]));assert.ok(p.width>=1.8&&p.width<=2.2);if(i)assert.ok(p.s>route[i-1].s);});
});
for(const key of ['near','far']){
  const m=manifest[key],bytes=await readFile(path.join(folder,m.file));
  check(`${key} 격자 크기·NoData`,()=>{
    assert.equal(bytes.length,m.width*m.height*4);
    for(let i=0;i<bytes.length;i+=4){const h=bytes.readFloatLE(i);assert.ok(Number.isFinite(h)&&h>=-100&&h<=3000);}
  });
}
const files=[manifest.near.file,manifest.route,manifest.hdri,...Object.values(manifest.materials).flatMap(m=>[m.diff,m.nor_gl,m.rough])];
let bytes=0;for(const file of files)bytes+=(await stat(path.join(folder,file))).size;
check('첫 로딩 30MB 예산(런타임 예약 포함)',()=>{assert.ok(bytes+manifest.reservedRuntimeBytes<=30000000);assert.equal(bytes,manifest.initialBytes);});
check('서울 원경 별도 청크·필수 랜드마크',()=>{
  assert.ok(manifest.cityChunks.length>0);
  for(const id of ['n-seoul-tower','63-building','lotte-world-tower'])assert.ok(manifest.landmarks.some(p=>p.id===id));
  assert.ok(manifest.landmarks.find(p=>p.id==='63-building').fromSummit.bearing>300);
});
for(const c of manifest.cityChunks){
  const city=JSON.parse(await readFile(path.join(folder,c.file),'utf8'));
  check(`${c.id} OSM 건물·높이`,()=>{assert.equal(city.license,'ODbL-1.0');assert.equal(city.buildings.length,c.buildings);city.buildings.forEach(b=>{assert.ok(b.footprint.length>=4&&b.height>0&&b.height<=600);});});
}
const report={date:new Date().toISOString(),results,firstLoadBytes:bytes,elevation:{summitAligned:route.at(-1).y,summitRawDem:elevationAudit.summit.rawDem,actualEntranceVerified:false},renderVerified:false,mobileVerified:false,releaseApproved:false};
await writeFile(path.join(folder,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
