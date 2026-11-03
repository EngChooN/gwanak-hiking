// 미실행. 승인 후 README 명령으로 실행. src/와 기존 GLB는 변경하지 않는다.
import {readFile,writeFile,mkdir,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fromArrayBuffer} from 'geotiff';
import sharp from 'sharp';
import {project,unproject,alignRoute} from '../geo.js';
import {placeReference} from '../skyline-reference.js';
import {buildingProfile} from '../../../scripts/seoul-building-profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(path.join(root,'config.json'),'utf8'));
const generated=path.join(root,'generated'), raw=path.join(root,'raw');
await mkdir(generated,{recursive:true});await mkdir(raw,{recursive:true});
const records=[];
async function get(url,name,maxBytes=180000000){
  const target=path.join(raw,name);let bytes;
  try{bytes=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!bytes){
    const r=await fetch(url,{headers:{'User-Agent':'GwanakHiking-asset-preparation/1.0'},signal:AbortSignal.timeout(180000)});
    if(!r.ok)throw new Error(`${r.status} ${url}`);
    if(Number(r.headers.get('content-length'))>maxBytes)throw new Error(`다운로드 상한 초과: ${name}`);
    const chunks=[];let total=0;
    for await(const chunk of r.body){total+=chunk.byteLength;if(total>maxBytes)throw new Error(`다운로드 상한 초과: ${name}`);chunks.push(chunk);}
    bytes=Buffer.concat(chunks);await writeFile(target,bytes);
  }
  records.push({url,file:`raw/${name}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  return bytes;
}
const json=(file,value)=>writeFile(path.join(generated,file),JSON.stringify(value));
const csv=await readFile(new URL('../../../data/GPX추출-계곡코스-상행.csv',import.meta.url),'utf8');
const points=csv.trim().split(/\r?\n/).slice(1).map(line=>{
  const [index,lat,lon,,y]=line.split(',').map(Number);
  if(![index,lat,lon,y].every(Number.isFinite))throw new Error('GPX CSV 숫자 오류');
  return {index,lat,lon,y,...project(lat,lon)};
});
if(points.length!==337)throw new Error('경로 개수 변경: 원본 확인 필요');
const tiles=[];
for(const east of [126,127]){
  const url=config.dem.url.replaceAll('E126',`E${east}`);
  const bytes=await get(url,`N37_E${east}.tif`);
  const tiff=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const image=await tiff.getImage();
  const values=await image.readRasters({samples:[0],interleave:true});
  const [ox,oy]=image.getOrigin(),[rx,ry]=image.getResolution();
  const pixelIsArea=image.getGeoKeys().GTRasterTypeGeoKey===1;
  tiles.push({east,image,values,ox,oy,rx,ry,offset:pixelIsArea ? .5 : 0});
}
function demHeight(x,z){
  const {lat,lon}=unproject(x,z),t=tiles.find(t=>Math.floor(lon)===t.east);
  if(!t)throw new Error(`DEM 타일 누락 ${lat},${lon}`);
  const u=(lon-t.ox)/t.rx-t.offset,v=(lat-t.oy)/t.ry-t.offset;
  const width=t.image.getWidth(),height=t.image.getHeight();
  const i=Math.max(0,Math.min(width-2,Math.floor(u))),j=Math.max(0,Math.min(height-2,Math.floor(v)));
  const fx=Math.max(0,Math.min(1,u-i)),fy=Math.max(0,Math.min(1,v-j));
  const at=(x,y)=>Number(t.values[y*width+x]);
  const h=(1-fy)*((1-fx)*at(i,j)+fx*at(i+1,j))+fy*((1-fx)*at(i,j+1)+fx*at(i+1,j+1));
  if(!Number.isFinite(h)||h< -100||h>3000)throw new Error('DEM NoData/비정상 표고');
  return h;
}
// 정상 목표는 이번 지시의 632m. 입구 실측값은 없어 중심 DSM을 잠정 유지한다.
// 이것은 경로 표고 보정이며 원시 DEM/근경·원경 격자의 표고를 바꾸지 않는다.
const summitReference={lat:37.445184,lon:126.964135,height:632,tolerance:10};
const summitPoint=points.at(-1),summitPosition=project(summitReference.lat,summitReference.lon);
if(Math.hypot(summitPoint.x-summitPosition.x,summitPoint.z-summitPosition.z)>10)throw new Error('정상 기준과 GPX 끝점 위치 불일치');
const route=alignRoute(points,demHeight,{summitHeight:summitReference.height});
await json('elevation-audit.json',{
  verticalDatum:config.dem.verticalDatum,gpxVerticalDatum:'unknown',geoidCorrectionApplied:false,
  tiles:tiles.map(t=>({east:t.east,origin:[t.ox,t.oy],resolution:[t.rx,t.ry],rasterType:t.image.getGeoKeys().GTRasterTypeGeoKey,pixelOffset:t.offset})),
  summit:{...summitReference,rawDem:demHeight(summitPosition.x,summitPosition.z),aligned:route.at(-1).y,correction:route.at(-1).elevationCorrection},
  start:{lat:points[0].lat,lon:points[0].lon,rawDem:route[0].demCenterY,aligned:route[0].y,referenceSource:'DSM provisional; actual entrance elevation unverified',actualToleranceVerified:false},
  limitations:['정상 기준에 맞춘 경로 보정은 DEM 정확도 검증이 아님','입구 실측 표고 미확보','경로와 원시 지형의 높이 차이·접지·급한 법면 렌더 확인 필요']
});
const b=config.dem.routeBuffer;
const bounds={x0:Math.floor((Math.min(...points.map(p=>p.x))-b)/8)*8,z0:Math.floor((Math.min(...points.map(p=>p.z))-b)/8)*8,x1:Math.max(...points.map(p=>p.x))+b,z1:Math.max(...points.map(p=>p.z))+b};
async function makeGrid(name,bounds,spacing){
  const width=Math.ceil((bounds.x1-bounds.x0)/spacing)+1,height=Math.ceil((bounds.z1-bounds.z0)/spacing)+1;
  const buffer=Buffer.alloc(width*height*4);
  for(let j=0;j<height;j++)for(let i=0;i<width;i++)buffer.writeFloatLE(demHeight(bounds.x0+i*spacing,bounds.z0+j*spacing),(j*width+i)*4);
  await writeFile(path.join(generated,`${name}.f32`),buffer);
  return {x0:bounds.x0,z0:bounds.z0,width,height,spacing,file:`${name}.f32`,format:'float32-little-endian',bytes:buffer.length};
}
const near=await makeGrid('near',bounds,config.dem.nearSpacing);
const f=config.dem.farHalfExtent;
const far=await makeGrid('far',{x0:-f,z0:-f,x1:f,z1:f},config.dem.farSpacing);
await json('route.json',route);
await json('elevation-deltas.json',route.map(p=>({index:p.index,gpx:p.originalY,demCenter:p.demCenterY,elevationCorrection:p.elevationCorrection,demAligned:p.y,delta:p.y-p.originalY})));
const materials={};
for(const [key,entry] of Object.entries(config.materials)){
  const metadata=JSON.parse(await get(`https://api.polyhaven.com/files/${entry.id}`,`${entry.id}-files.json`,5000000));
  const files={};
  for(const channel of ['diff','nor_gl','rough']){
    // Poly Haven API 키는 Diffuse·nor_gl·Rough. 출력 이름은 diff·nor_gl·rough를 유지한다.
    const apiKey={diff:'Diffuse',nor_gl:'nor_gl',rough:'Rough'}[channel];
    const variants=(metadata[apiKey]??metadata[channel])?.['1k'];
    const item=variants?.png||variants?.jpg;
    if(!item?.url)throw new Error(`재질 맵 없음: ${entry.id}/${channel}`);
    const image=await get(item.url,`${entry.id}-${channel}${new URL(item.url).pathname.endsWith('.png')?'.png':'.jpg'}`,60000000);
    const name=`${key}-${channel}.${channel==='nor_gl'?'png':'jpg'}`;
    let processor=sharp(image).resize(config.budget.textureSize,config.budget.textureSize,{fit:'fill'});
    // 노멀은 색 공간 변환을 하지 않고 리사이즈한다. 밉맵 정규화는 셰이더에서 한다.
    await (channel==='nor_gl'?processor.png():processor.jpeg({quality:83})).toFile(path.join(generated,name));
    files[channel]=name;
  }
  materials[key]={...entry,...files,license:'CC0-1.0',source:`https://polyhaven.com/a/${entry.id}`};
}
const skyFiles=JSON.parse(await get(`https://api.polyhaven.com/files/${config.hdri}`,`${config.hdri}-files.json`,5000000));
const skyURL=skyFiles.hdri?.['1k']?.hdr?.url;
if(!skyURL)throw new Error('HDRI 1K HDR 없음');
const sky=await get(skyURL,'sky.hdr',15000000);await writeFile(path.join(generated,'sky.hdr'),sky);
const cityChunks=[],cityMissing=[];
// 서울 전체 범위는 Overpass가 504로 거절한다. 작은 칸으로 나눠 순서대로 받고, 실패하면 대기 후 다른 서버로 재시도한다.
// 받은 칸은 raw/에 남으므로 다시 실행하면 실패한 칸만 새로 받는다. 끝내 실패한 칸은 건너뛰고 manifest에 기록한다.
const overpassServers=[config.overpass,...(config.overpassMirrors||[])];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function overpass(query,name){
  const delays=[0,20000,60000];
  let lastError;
  for(const delay of delays)for(const server of overpassServers){
    if(delay)await wait(delay);
    try{
      const source=JSON.parse(await get(`${server}?data=${encodeURIComponent(query)}`,name,140000000));
      if(source.remark){await rm(path.join(raw,name),{force:true});throw new Error(`Overpass 부분 응답: ${source.remark}`);}
      return source;
    }catch(e){lastError=e;console.warn(`Overpass 재시도 (${name}): ${e.message.slice(0,80)}`);}
  }
  throw lastError;
}
const tileStep=config.cityTileDegrees||.03;
// 한 칸이 서버 하나에 오래 묶이지 않도록, 서버마다 일꾼 하나를 두고 칸 대기열을 함께 나눠 받는다.
// 실패한 칸은 대기열 뒤로 보내 다른 서버가 받게 하고, 서버 수만큼 실패하면 건너뛴다.
async function fetchTiles(jobs){
  const queue=jobs.map(job=>({...job,tries:0})),results=new Map();
  let done=0;
  const ask=(server,job)=>get(`${server}?data=${encodeURIComponent(job.query)}`,job.name,140000000).then(b=>{
    const source=JSON.parse(b);
    if(source.remark)return rm(path.join(raw,job.name),{force:true}).then(()=>{throw new Error(`Overpass 부분 응답: ${source.remark}`);});
    return source;
  });
  await Promise.all(overpassServers.map(async server=>{
    while(queue.length){
      const job=queue.shift();
      try{results.set(job.name,await ask(server,job));console.log(`건물 칸 ${++done}/${jobs.length} 완료`);}
      catch(e){
        job.tries++;job.error=e;console.warn(`Overpass 재시도 (${job.name}): ${e.message.slice(0,80)}`);
        if(job.tries<overpassServers.length*2){queue.push(job);await wait(10000);}
        else{done++;cityMissing.push({id:job.id,tile:job.tile,reason:e.message.slice(0,200)});console.warn(`건물 칸 건너뜀: ${job.id} ${job.tile}`);}
      }
    }
  }));
  return results;
}
for(const {id,bbox} of config.cityBboxes){
  // 읽기 전용 공개 지리 쿼리. 건물 윤곽과 물 폴리곤을 내려받는다.
  const [s,w,n,e]=bbox,elements=new Map(),jobs=[];
  for(let lat=s,i=0;lat<n-1e-9;lat+=tileStep,i++)for(let lon=w,j=0;lon<e-1e-9;lon+=tileStep,j++){
    const tile=[lat,lon,Math.min(n,lat+tileStep),Math.min(e,lon+tileStep)].map(v=>+v.toFixed(5)).join(',');
    jobs.push({id,tile,name:`${id}-${i}-${j}-osm.json`,query:`[out:json][timeout:180];way[building](${tile});out tags geom;`});
  }
  for(const source of (await fetchTiles(jobs)).values())for(const el of source.elements||[])elements.set(`${el.type}/${el.id}`,el);
  let waterSource={elements:[]};
  try{waterSource=await overpass(`[out:json][timeout:180];(way[natural=water](${bbox.join(',')});relation[natural=water](${bbox.join(',')}););out body geom;`,`${id}-water-osm.json`);}
  catch(err){cityMissing.push({id,tile:'water',reason:err.message.slice(0,200)});console.warn(`물 자료 건너뜀: ${id}`);}
  const buildings=[],water=[...waterSource.elements||[]];
  for(const e of elements.values()){
    if(e.type!=='way'||!e.geometry||e.geometry.length<4)continue;
    const footprint=e.geometry.map(p=>{const {x,z}=project(p.lat,p.lon);return [x,z];});
    if(Math.hypot(footprint[0][0]-footprint.at(-1)[0],footprint[0][1]-footprint.at(-1)[1])>.5)continue;
    const heightTag=Number.parseFloat(e.tags?.height),levels=Number.parseFloat(e.tags?.['building:levels']);
    const height=heightTag>0?heightTag:levels>0?levels*3:9;
    const cx=footprint.reduce((s,p)=>s+p[0],0)/footprint.length,cz=footprint.reduce((s,p)=>s+p[1],0)/footprint.length;
    buildings.push({id:e.id,footprint,height:Math.min(height,600),heightSource:heightTag>0?'height':levels>0?'levels*3':'assumed-9m',...buildingProfile(e.tags,e.id),ground:demHeight(cx,cz)});
  }
  const limit=config.budget.cityChunkLimit;
  for(let start=0;start<buildings.length;start+=limit){
    const file=`${id}-${start/limit}.json`,items=buildings.slice(start,start+limit);
    await json(file,{license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',buildings:items});
    cityChunks.push({id:`${id}-${start/limit}`,file,buildings:items.length,bytes:(await stat(path.join(generated,file))).size});
  }
  // 물 원자료는 별도 DB로 유지한다. relation은 원자료에 보존하며 시각화 보완 대상이다.
  await json(`${id}-water.json`,{elements:water,license:'ODbL-1.0'});
}
const landmarks=config.landmarks.map(p=>{
  const placed=placeReference(p,config.observation);
  return {...placed,ground:p.ground??demHeight(placed.x,placed.z)};
});
const coreFiles=['near.f32','route.json','sky.hdr',...Object.values(materials).flatMap(m=>[m.diff,m.nor_gl,m.rough])];
let initialBytes=0;for(const file of coreFiles)initialBytes+=(await stat(path.join(generated,file))).size;
// JS/캐릭터 여유 2MB를 포함한다. 별도 원경 파일은 첫 로딩에 포함하지 않는다.
if(initialBytes+2000000>config.budget.firstLoadBytes)throw new Error(`첫 로딩 예산 초과: ${initialBytes}+2000000`);
await json('sources.json',records);
await json('manifest.json',{
  version:1,state:'generated-awaiting-render-verification',releaseApproved:false,
  origin:config.origin,units:'metres',north:'-Z',near,far,materials,hdri:'sky.hdr',
  observation:config.observation,atmosphere:config.atmosphere,directionCaptures:config.directionCaptures,
  route:'route.json',cityChunks,cityMissing,water:config.cityBboxes.map(b=>`${b.id}-water.json`),landmarks,
  initialBytes,reservedRuntimeBytes:2000000,firstLoadBudget:config.budget.firstLoadBytes,
  capturePoints:config.capturePoints,sourceResolutionMetres:30,
  limitations:['8m 격자는 30m DSM 보간이며 실측 해상도 향상이 아님','DSM은 수목·시설을 포함','암종 후보 확인 대기','수종·인체 최종 모델 미포함','실기기·경험자 승인 대기']
});
console.log(JSON.stringify({generated,initialBytes,cityChunks:cityChunks.length,releaseApproved:false},null,2));
