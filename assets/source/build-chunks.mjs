import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// near 격자(Copernicus)·route.json·식생 배치를 200m 청크 파일로 나눈다. 입력은 읽기만 한다.
const root=new URL('../../',import.meta.url);
const gen=new URL('assets/realistic/generated/',root);
const outDir=new URL('assets/shared/chunks/',root);
const CHUNK=200;
const manifest=JSON.parse(readFileSync(new URL('manifest.json',gen),'utf8'));
const near=manifest.near;
const buf=readFileSync(new URL(near.file,gen));
const grid=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
if(grid.length!==near.width*near.height)throw new Error('near.f32 크기가 manifest와 다릅니다');
const cells=Math.round(CHUNK/near.spacing);
if(cells*near.spacing!==CHUNK)throw new Error('청크 크기가 격자 간격의 배수가 아닙니다');
const cols=Math.ceil((near.width-1)/cells),rows=Math.ceil((near.height-1)/cells);
const idOf=(i,j)=>`${i}_${j}`;
const chunkOf=(x,z)=>[Math.floor((x-near.x0)/CHUNK),Math.floor((z-near.z0)/CHUNK)];
const inGrid=(i,j)=>i>=0&&j>=0&&i<cols&&j<rows;

for(const d of ['terrain','route','vegetation'])rmSync(new URL(`${d}/`,outDir),{recursive:true,force:true});
for(const d of ['terrain','route','vegetation'])mkdirSync(new URL(`${d}/`,outDir),{recursive:true});

const route=JSON.parse(readFileSync(new URL('route.json',gen),'utf8'));
const nature=JSON.parse(readFileSync(new URL('nature/index.json',gen),'utf8'));
const routeBy=new Map(),vegBy=new Map();
// 경로: 청크 안 점의 연속 구간. 청크 경계를 넘는 선분이 끊기지 않도록 앞뒤 1점을 포함한다.
route.forEach((p,k)=>{const [i,j]=chunkOf(p.x,p.z);if(!inGrid(i,j))return;const id=idOf(i,j);(routeBy.get(id)||routeBy.set(id,[]).get(id)).push(k);});
let outsideVeg=0;
for(const g of nature.instances)for(const p of g.placements){const [i,j]=chunkOf(p.x,p.z);if(!inGrid(i,j)){outsideVeg++;continue;}const id=idOf(i,j);let m=vegBy.get(id);if(!m)vegBy.set(id,m=new Map());let e=m.get(g.id);if(!e)m.set(g.id,e={id:g.id,kind:g.kind,placements:[]});e.placements.push(p);}

const chunks=[];let bytes=0,routePoints=0,vegCount=0;
for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const c0=i*cells,r0=j*cells,w=Math.min(cells+1,near.width-c0),h=Math.min(cells+1,near.height-r0);
  const a=new Float32Array(w*h);let finite=0;
  for(let r=0;r<h;r++)for(let c=0;c<w;c++){const v=grid[(r0+r)*near.width+c0+c];a[r*w+c]=v;if(Number.isFinite(v))finite++;}
  if(!finite)continue;
  const id=idOf(i,j),files={terrain:`terrain/${id}.f32`,route:`route/${id}.json`,vegetation:`vegetation/${id}.json`};
  const x0=near.x0+i*CHUNK,z0=near.z0+j*CHUNK;
  writeFileSync(new URL(files.terrain,outDir),Buffer.from(a.buffer));bytes+=a.byteLength;
  const idx=routeBy.get(id)||[],ranges=[];
  for(const k of idx){const last=ranges[ranges.length-1];if(last&&k===last[1]+1)last[1]=k;else ranges.push([k,k]);}
  for(const r of ranges){r[0]=Math.max(0,r[0]-1);r[1]=Math.min(route.length-1,r[1]+1);}
  const merged=[];for(const r of ranges){const l=merged[merged.length-1];if(l&&r[0]<=l[1]+1)l[1]=Math.max(l[1],r[1]);else merged.push([...r]);}
  const pts=[];for(const [s,e]of merged)for(let k=s;k<=e;k++)pts.push(route[k]);
  const own=idx.length;routePoints+=own;
  writeFileSync(new URL(files.route,outDir),JSON.stringify({id,ranges:merged,points:pts}));
  const groups=[...(vegBy.get(id)?.values()||[])],vcount=groups.reduce((s,g)=>s+g.placements.length,0);vegCount+=vcount;
  writeFileSync(new URL(files.vegetation,outDir),JSON.stringify({id,groups}));
  chunks.push({id,i,j,x0,z0,files,counts:{terrainWidth:w,terrainHeight:h,routePoints:own,vegetation:vcount}});
}
const index={schemaVersion:1,chunkSize:CHUNK,spacing:near.spacing,origin:{x0:near.x0,z0:near.z0},cols,rows,chunks};
writeFileSync(new URL('index.json',outDir),JSON.stringify(index));
console.log(`청크 ${chunks.length}개 (격자 ${cols}x${rows}), 경로점 ${routePoints}/${route.length}, 식생 ${vegCount} (격자 밖 ${outsideVeg} 제외), 지형 ${(bytes/1e6).toFixed(2)}MB`);
