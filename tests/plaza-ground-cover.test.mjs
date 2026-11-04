import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {forestLayers} from '../assets/realistic/generated/nature/forest-layers.js';
import {nearDetailPlacements} from '../assets/realistic/near-detail.js';
import {clearEntranceEntries,entranceLocal} from '../assets/realistic/entrance-scenery.js';
import {plazaFootprint} from '../assets/realistic/entrance-plaza.js';
import {scenerySites,clearSceneryPlacements} from '../assets/realistic/section-scenery.js';
import {groundCoverMask,HARD_SURFACES} from '../assets/realistic/ground-cover-mask.js';
import {indexRoute} from '../assets/realistic/geo.js';

// 실제 코스(입구 광장·문 안쪽 포장길 포함)로 숲 층위를 만든다. 높이는 완만한 가짜 지형.
const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const height=(x,z)=>50+x*.01+z*.02;
const sites=scenerySites(route,height);
const landscape={route,floorHeight:height,group:new THREE.Group(),status:{sectionScenery:{sites}},update(){}};
forestLayers(landscape);
const instances=name=>{const m=new THREE.Matrix4(),v=new THREE.Vector3(),out=[];
 for(const mesh of landscape.group.children.find(g=>g.name===name).children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);v.setFromMatrixPosition(m);out.push({x:v.x,z:v.z});}
 return out;};
const grass=instances('숲 층위 · 바람 풀'),shrubs=instances('덤불층 · 바람');
const nearest=indexRoute(route);
const inPlaza=p=>{const q=entranceLocal(route,p.x,p.z);return plazaFootprint(q.x,q.z);};
const onHard=(p,reach)=>{const h=nearest(p.x,p.z);return [route[h.index],route[h.index+1]].some(r=>HARD_SURFACES.includes(r.material))&&h.distance<h.width/2+reach;};

test('입구 광장·문 앞 아스팔트·경계석·문 안쪽 포장길 위 풀·덤불은 0개다',()=>{
 assert.ok(grass.length>1e5);
 assert.equal(grass.filter(inPlaza).length,0);
 assert.equal(shrubs.filter(inPlaza).length,0);
 // 포기 반경까지 포함해도 포장에 걸치지 않는다(풀 .35m, 덤불 .8×배율 ≥ .35m).
 const mask=groundCoverMask(route);
 assert.equal(grass.filter(p=>mask.entrance(p.x,p.z,.3)).length,0);
 assert.equal(shrubs.filter(p=>mask.entrance(p.x,p.z,.3)).length,0);
 assert.ok(landscape.status.scenery.pavedGrassCleared>0);
});

test('포장 가장자리 바깥(화단·생울타리, 문 안쪽 길 양옆)에는 풀이 남는다',()=>{
 const ring=grass.filter(p=>{const q=entranceLocal(route,p.x,p.z);return !plazaFootprint(q.x,q.z)&&plazaFootprint(q.x,q.z,3);});
 assert.ok(ring.length>500,`포장 둘레 3m 풀 ${ring.length}포기`);
 // 문 안쪽 길(좌우 ±3.5m) 양옆에 모두 남는다.
 const side=s=>ring.filter(p=>{const q=entranceLocal(route,p.x,p.z);return q.z<-2&&Math.sign(q.x)===s;}).length;
 assert.ok(side(-1)>50&&side(1)>50);
});

test('포장·계단·데크 노면과 구간 시설 위에는 풀·덤불·낙엽을 두지 않는다',()=>{
 assert.equal(grass.filter(p=>onHard(p,.3)).length,0);
 assert.equal(shrubs.filter(p=>onHard(p,.3)).length,0);
 assert.equal(grass.filter(p=>sites.some(s=>Math.hypot(p.x-s.x,p.z-s.z)<s.supportRadius)).length,0);
 // 길가 하층 식생(풀·관목·낙엽)은 load-landscape addGrass와 같은 순서로 입구·시설을 비운다.
 const detail=nearDetailPlacements(route).grass;
 const kept=clearSceneryPlacements(clearEntranceEntries([{kind:'grass',placements:detail}],route)[0].placements,sites);
 assert.ok(kept.length>1000);
 assert.equal(kept.filter(inPlaza).length,0);
 assert.equal(kept.filter(p=>onHard(p,(p.kind==='litter'?.36:.2)*p.scale-1e-6)).length,0);
});
