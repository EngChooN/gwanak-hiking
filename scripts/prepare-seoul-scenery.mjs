import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import sharp from '../assets/realistic/tools/node_modules/sharp/lib/index.js';
import {project,gridHeight} from '../assets/realistic/geo.js';
import {placeReference} from '../assets/realistic/skyline-reference.js';
import {buildingProfile} from './seoul-building-profile.mjs';
const folder='assets/realistic/generated/',raw='assets/realistic/raw/';
const manifest=JSON.parse(await readFile(folder+'manifest.json','utf8'));
const tags=new Map();for(const file of await readdir(raw))if(/-\d+-\d+-osm.json$/.test(file))for(const e of JSON.parse(await readFile(raw+file,'utf8')).elements??[])tags.set(e.id,e.tags??{});
const audit={buildings:0,heightSources:{},uses:{},source:'© OpenStreetMap contributors',license:'ODbL-1.0',estimatedHeights:'용도별 결정적 시각 추정. 실측/도시 통계가 아님'};
const buildingMasks=[];
for(const chunk of manifest.cityChunks){const data=JSON.parse(await readFile(folder+chunk.file,'utf8'));for(const b of data.buildings){Object.assign(b,buildingProfile(tags.get(b.id),b.id));audit.buildings++;audit.heightSources[b.heightSource]=(audit.heightSources[b.heightSource]??0)+1;audit.uses[b.use]=(audit.uses[b.use]??0)+1;buildingMasks.push(b.footprint);}await writeFile(folder+chunk.file,JSON.stringify(data));chunk.bytes=(await stat(folder+chunk.file)).size;}
const source=new Map();for(const id of ['north','south']){let data;try{data=JSON.parse(await readFile(raw+`seoul-surface-${id}-osm.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;(audit.surfaceMissing??=[]).push(id);continue;}for(const e of data.elements??[])source.set(e.id,e);}
const polygons=[],roads=[];
for(const e of source.values()){if(!e.geometry?.length)continue;const t=e.tags??{},points=e.geometry.map(p=>{const a=project(p.lat,p.lon);return [a.x,a.z];});if(t.highway){if(t.tunnel==='yes')continue;const lanes=parseFloat(t.lanes),width=parseFloat(t.width);roads.push({id:e.id,points,kind:t.highway,bridge:t.bridge&&t.bridge!=='no',width:width>0?width:lanes>0?lanes*3.3:/motorway|trunk/.test(t.highway)?26:/primary/.test(t.highway)?22:/secondary/.test(t.highway)?16:11});}else if(points.length>=4){const green=/forest|grass|meadow|recreation_ground|allotments|farmland|orchard|vineyard/.test(t.landuse??'')||t.leisure==='park'||t.natural;polygons.push({id:e.id,points,kind:green?'green':'urban',tags:t});}}
const px=x=>(x+30000)/60000*4096,pts=points=>points.map(([x,z])=>`${px(x).toFixed(1)},${px(z).toFixed(1)}`).join(' ');
// 건물 주위의 불투명 지면 추정은 OSM 폴리곤이 없는 구역의 보조 마스크다.
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096"><rect width="4096" height="4096" fill="#536646"/>';
for(const p of buildingMasks){const x=p.reduce((s,p)=>s+p[0],0)/p.length,z=p.reduce((s,p)=>s+p[1],0)/p.length;svg+=`<rect x="${px(x)-3}" y="${px(z)-3}" width="6" height="6" fill="#969085"/>`;}
for(const kind of ['urban','green'])for(const p of polygons.filter(p=>p.kind===kind))svg+=`<polygon points="${pts(p.points)}" fill="${kind==='green'?'#496b3d':'#9b9185'}"/>`;
for(const r of roads)svg+=`<polyline points="${pts(r.points)}" fill="none" stroke="#44494b" stroke-width="${r.width/60000*4096}" stroke-linejoin="round"/>`;
svg+='</svg>';await sharp(Buffer.from(svg)).png().toFile(folder+'seoul-landcover.png');
await writeFile(folder+'seoul-surface.json',JSON.stringify({roads,polygons:polygons.map(p=>({id:p.id,kind:p.kind,points:p.points})),license:'ODbL-1.0',attribution:'© OpenStreetMap contributors'}));
manifest.seoulSurface='seoul-surface.json';manifest.seoulLandcover='seoul-landcover.png';
// 산리서치의 재계산 표와 동일한 방위·거리. 높이 과장 없음.
const refs={'63-building':[345.6,8560,249],'n-seoul-tower':[10.2,11980,236.7],'lotte-world-tower':[58.5,14340,555.65],'bukhansan':[6.1,24110,836.5]};
manifest.landmarks=manifest.landmarks.map(p=>refs[p.id]?placeReference({...p,bearing:refs[p.id][0],distance:refs[p.id][1],height:p.shape==='reference'?p.height:refs[p.id][2]},manifest.observation):p);
await writeFile(folder+'manifest.json',JSON.stringify(manifest));
audit.roads=roads.length;audit.bridges=roads.filter(r=>r.bridge).length;audit.polygons=polygons.length;await writeFile(folder+'seoul-scenery-audit.json',JSON.stringify(audit,null,2));console.log(audit);
