import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import {stairTerrainClearance} from '../assets/realistic/terrain-clearance.js';
import {surfaceIndex} from '../assets/realistic/surface-index.js';

test('꼭짓점 사이를 지나는 계단 회랑을 지형 삼각형이 덮지 않는다',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-2,15,-2,2,15,-2,-2,15,2,2,15,2],3));geometry.setIndex([0,2,1,1,2,3]);
 const route=[{x:-1,y:10,z:0,width:1,material:'deck_stairs'},{x:1,y:10.18,z:0,width:1,material:'soil'}];
 stairTerrainClearance(route)(geometry);
 const group=new Group(),material=new MeshBasicMaterial({side:DoubleSide});group.add(new Mesh(geometry,material));
 const terrainHeight=surfaceIndex(group);assert.ok(terrainHeight(0,0)<10);
 assert.equal(geometry.index.count,6);assert.ok(geometry.attributes.normal);
 material.dispose();geometry.dispose();
});

test('계단이 아닌 회랑은 지형을 변경하지 않는다',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,15,0,2,15,0,0,15,2],3));geometry.setIndex([0,2,1]);
 stairTerrainClearance([{x:0,y:10,z:0,width:1,material:'soil'},{x:2,y:10,z:0,width:1}])(geometry);
 assert.equal(geometry.attributes.position.getY(0),15);geometry.dispose();
});
