import assert from 'node:assert/strict';
import {NodeIO,getBounds} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
import {inventory} from '../inventory.mjs';
import {gridHeight,nearestRoute,cutHeight,mix} from '../geo.js';
const base=new URL('../generated/nature/',import.meta.url),index=JSON.parse(readFileSync(new URL('index.json',base))),io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const models=[];for(const file of new Set(index.library.flatMap(e=>e.levels))){
 const doc=await io.read(new URL(file,base).pathname),bounds=getBounds(doc.getRoot().getDefaultScene());let triangles=0;
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){triangles+=p.getIndices().getCount()/3;assert.equal(p.getMode(),4);}
 for(const tex of doc.getRoot().listTextures()){const m=await sharp(tex.getImage()).metadata();assert.ok(m.width<=1024&&m.height<=1024);}
 assert.ok(triangles>0);assert.ok(bounds.max.every(Number.isFinite));models.push({file,triangles,bounds,bytes:readFileSync(new URL(file,base)).length});
}
assert.equal(models.length,27);
const meta=inventory().near,bytes=readFileSync(new URL('../near.f32',base)),grid={...meta,values:new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))},route=JSON.parse(readFileSync(new URL('../route.json',base)));
let maxYError=0,trees=0,rocks=0,understory=0,minPathDistance=Infinity;
for(const e of index.instances){assert.equal(e.levels.length,3);const ps=e.placements;assert.ok(Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x))<=128);assert.ok(Math.max(...ps.map(p=>p.z))-Math.min(...ps.map(p=>p.z))<=128);
 for(const p of ps){if(e.kind==='rock')assert.ok(Number.isFinite(p.supportDrop)&&p.supportDrop>=0);const hit=nearestRoute(route,p.x,p.z),a=route[hit.index],b=route[hit.index+1],raw=gridHeight(grid,p.x,p.z),floor=cutHeight(raw+mix(a.elevationCorrection??0,b.elevationCorrection??0,hit.t)*Math.exp(-((hit.distance/300)**2)),hit);maxYError=Math.max(maxYError,Math.abs(floor-p.y));minPathDistance=Math.min(minPathDistance,hit.distance);assert.ok(hit.distance>(e.kind==='tree'?7:e.kind==='understory'?2.9:4));if(e.kind==='tree')trees++;else if(e.kind==='understory')understory++;else rocks++;}}
assert.ok(maxYError<.001);assert.deepEqual({trees,rocks,understory},index.counts);
const result={status:'통과',models,counts:index.counts,chunks:index.instances.length,maxYError,minPathDistance,canopySource:index.canopySource};writeFileSync(new URL('verification.json',base),JSON.stringify(result,null,2));console.log({status:result.status,models:models.length,trees,rocks,maxYError,minPathDistance});
