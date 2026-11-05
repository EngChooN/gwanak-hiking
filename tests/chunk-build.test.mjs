import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const gen=new URL('assets/realistic/generated/',root);
const dir=new URL('assets/shared/chunks/',root);
const read=u=>JSON.parse(readFileSync(u,'utf8'));
const manifest=read(new URL('manifest.json',gen)),near=manifest.near;
const raw=readFileSync(new URL(near.file,gen));
const grid=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const index=read(new URL('index.json',dir));

test('index.json 형식',()=>{
  assert.equal(index.schemaVersion,1);assert.equal(index.chunkSize,200);
  assert.equal(index.spacing,near.spacing);assert.deepEqual(index.origin,{x0:near.x0,z0:near.z0});
  assert.equal(index.cols,Math.ceil((near.width-1)/25));assert.equal(index.rows,Math.ceil((near.height-1)/25));
  assert.ok(index.chunks.length>0&&index.chunks.length<=index.cols*index.rows);
  const ids=new Set();
  for(const c of index.chunks){
    assert.equal(c.id,`${c.i}_${c.j}`);assert.ok(!ids.has(c.id));ids.add(c.id);
    assert.equal(c.x0,index.origin.x0+c.i*200);assert.equal(c.z0,index.origin.z0+c.j*200);
    assert.deepEqual(Object.keys(c.files).sort(),['route','terrain','vegetation']);
    for(const f of Object.values(c.files))assert.ok(existsSync(new URL(f,dir)),f);
    for(const k of ['terrainWidth','terrainHeight','routePoints','vegetation'])assert.ok(Number.isInteger(c.counts[k]),k);
  }
});

test('청크 높이는 원본 near 격자 표본과 동일(경계 1칸 겹침)',()=>{
  for(const c of index.chunks){
    const buf=readFileSync(new URL(c.files.terrain,dir));
    const a=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
    const {terrainWidth:w,terrainHeight:h}=c.counts;
    assert.equal(a.length,w*h);
    const c0=c.i*25,r0=c.j*25;
    assert.equal(w,Math.min(26,near.width-c0));assert.equal(h,Math.min(26,near.height-r0));
    for(let r=0;r<h;r++)for(let q=0;q<w;q++)if(a[r*w+q]!==grid[(r0+r)*near.width+c0+q])assert.fail(`${c.id} (${q},${r}) 불일치`);
  }
  // 인접 청크 경계가 같은 값을 공유
  const byId=new Map(index.chunks.map(c=>[c.id,c]));
  const load=c=>{const b=readFileSync(new URL(c.files.terrain,dir));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
  let checked=0;
  for(const c of index.chunks){const e=byId.get(`${c.i+1}_${c.j}`);if(!e)continue;const a=load(c),b=load(e);const h=Math.min(c.counts.terrainHeight,e.counts.terrainHeight);for(let r=0;r<h;r++)assert.equal(a[r*c.counts.terrainWidth+25],b[r*e.counts.terrainWidth]);checked++;}
  assert.ok(checked>0);
});

test('식생·경로 개수가 원본과 보존',()=>{
  const nature=read(new URL('nature/index.json',gen));
  const total=nature.instances.reduce((s,g)=>s+g.placements.length,0);
  let sum=0,perType={};
  for(const c of index.chunks){
    const v=read(new URL(c.files.vegetation,dir));let n=0;
    for(const g of v.groups){n+=g.placements.length;perType[g.id]=(perType[g.id]||0)+g.placements.length;for(const p of g.placements){assert.ok(p.x>=c.x0&&p.x<c.x0+200&&p.z>=c.z0&&p.z<c.z0+200,`${c.id} 범위 밖 식생`);}}
    assert.equal(n,c.counts.vegetation);sum+=n;
  }
  assert.equal(sum,total);
  const src={};for(const g of nature.instances)src[g.id]=(src[g.id]||0)+g.placements.length;
  assert.deepEqual(perType,src);
  const route=read(new URL('route.json',gen));
  assert.equal(index.chunks.reduce((s,c)=>s+c.counts.routePoints,0),route.length);
  for(const c of index.chunks){const r=read(new URL(c.files.route,dir));for(const [a,b]of r.ranges)assert.ok(a<=b&&b<route.length);assert.equal(r.points.length,r.ranges.reduce((s,[a,b])=>s+b-a+1,0));}
});

test('카툰 에셋: 텍스처 없는 GLB와 3단 gradientMap',()=>{
  const g=readFileSync(new URL('assets/toon/gradients/toon3.png',root));
  assert.equal(g.readUInt32BE(16),3);assert.equal(g.readUInt32BE(20),1);
  const glb=readFileSync(new URL('assets/toon/models/hiker/Hiker.glb',root));
  const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
  assert.ok(!json.images&&!json.textures);
  for(const m of json.materials){assert.ok(!m.pbrMetallicRoughness.baseColorTexture);assert.ok(!m.normalTexture);}
  const idx=JSON.stringify(read(new URL('assets/toon/nature/index.json',root)));
  assert.ok(!/impostor.*\.png/.test(idx));
});
