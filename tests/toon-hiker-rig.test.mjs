// 첫 로딩 단축(2026-11-06): 게임은 뼈대만 남긴 HikerRig.glb(14KB)를 받는다. 원본 Hiker.glb(2MB)로 만든 동동이와 뼈·동작이 같아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildToonHikerGltf} from '../src/toon/link-hiker.js';
import {rigOnlyGlb} from '../assets/source/build-toon-hiker-rig.mjs';

const file=name=>readFileSync(new URL(`../assets/toon/models/hiker/${name}`,import.meta.url));
async function parse(buf){globalThis.self??=globalThis;return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');}
const dump=g=>{const rows=[];g.scene.updateMatrixWorld(true);g.scene.traverse(o=>rows.push([o.name,o.type,...o.matrixWorld.elements.map(v=>Math.round(v*1e6))]));return rows;};

test('HikerRig.glb는 원본에서 다시 만든 것과 같고(메시·동작·버퍼 없음), 20KB 아래다',()=>{
 const rig=file('HikerRig.glb');
 assert.deepEqual(rig,rigOnlyGlb(file('Hiker.glb')),'npm run assets:build로 다시 만들 것');
 assert.ok(rig.length<20000,`${rig.length} bytes`);
 const json=JSON.parse(rig.toString('utf8',20,20+rig.readUInt32LE(12)));
 assert.ok(!json.meshes&&!json.animations&&!json.buffers&&!json.accessors);
 assert.ok(json.skins[0].joints.length>20,'뼈 표시(skin.joints)는 남긴다');
});

test('뼈대 GLB로 만든 동동이는 원본으로 만든 것과 장면·동작 값이 같다',async()=>{
 const full=buildToonHikerGltf(await parse(file('Hiker.glb'))),rig=buildToonHikerGltf(await parse(file('HikerRig.glb')));
 assert.deepEqual(dump(rig),dump(full));
 assert.deepEqual(rig.animations.map(c=>c.name),full.animations.map(c=>c.name));
 full.animations.forEach((clip,c)=>clip.tracks.forEach((track,t)=>{const other=rig.animations[c].tracks[t];assert.equal(other.name,track.name);assert.deepEqual([...other.times],[...track.times]);assert.deepEqual([...other.values],[...track.values]);}));
});
