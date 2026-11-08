// 별도 검토 GLB를 정면·측면 / 3인칭 보행 두 이미지로 촬영. 아직 실행하지 않았다.
// 준비: 기존 로컬 dev 서버, node scripts/prepare-hiker-revision.mjs의 검토본.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const port=process.env.PORT??5175,errors=[];
const files=['artifacts/hiker-revision-front-side.png','artifacts/hiker-revision-third-walk.png','artifacts/hiker-revision-capture.json'];
files.forEach(p=>assert(!existsSync(p),`기존 검토 결과를 덮어쓰지 않음: ${p}`));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/hiking/?start=demo`);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {loadRealisticHiker}=await import('/src/realistic-hiker.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,900);
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'2147483647'});document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d7dde1');
  scene.add(new THREE.HemisphereLight(0xffffff,0x60645a,2));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,-4);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:'#94998d'}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const h=await loadRealisticHiker('/assets/realistic/models/hiker/review-v1/Hiker.glb');scene.add(h.scene);
  const required=['HikingPole.Left','HikingPole.Right','HikingPole.Left.Grip','HikingPole.Left.Tip','HikingPole.Right.Grip','HikingPole.Right.Tip'];
  for(const name of required)if(!h.model.getObjectByName(name))throw Error(`검토본 노드 없음: ${name}`);
  const hat=h.model.getObjectByName('Human.hat');if(!hat?.parent?.name.includes('Head'))throw Error('모자가 Head의 자식이 아님');
  const cameras=[new THREE.PerspectiveCamera(35,720/900,.01,100),new THREE.PerspectiveCamera(35,720/900,.01,100)];
  cameras[0].position.set(0,.95,-3.3);cameras[1].position.set(3.3,.95,0);cameras.forEach(c=>c.lookAt(0,.88,0));
  const third=new THREE.PerspectiveCamera(40,1440/900,.01,100);third.position.set(1.6,1.9,3.3);third.lookAt(0,.95,0);
  const renderPair=()=>{renderer.setScissorTest(true);for(let i=0;i<2;i++){renderer.setViewport(i*720,0,720,900);renderer.setScissor(i*720,0,720,900);renderer.render(scene,cameras[i]);}renderer.setScissorTest(false);};
  // 믹서를 직접 샘플링하여 정면·측면에 동일한 Walk 위상을 고정한다.
  Object.values(h.actions).forEach(a=>a.stop());h.actions.Walk.play();h.mixer.setTime(h.actions.Walk.getClip().duration*.15);h.scene.updateMatrixWorld(true);renderPair();
  let time=0,frames=0;const stats=[];
  window.__hikerRevisionReview={
   startWalk(){Object.values(h.actions).forEach(a=>a.stop());h.actions.Walk.play();renderer.setViewport(0,0,1440,900);
    renderer.setAnimationLoop(()=>{time+=1/60;h.mixer.setTime(time);h.scene.updateMatrixWorld(true);renderer.render(scene,third);frames++;
     if(frames<=120){const row={time};for(const side of ['Left','Right'])row[side]=h.model.getObjectByName(`HikingPole.${side}.Grip`).getWorldPosition(new THREE.Vector3()).toArray();stats.push(row);}});},
   stop(){renderer.setAnimationLoop(null);return {frames,stats,clips:h.animations.map(a=>a.name),height:1.7,animStep:.6336,scope:'별도 평면 검토 장면, 실제 등산로 접지·스틱 접지 IK 검증 아님'};}
  };
  return {hatParent:hat.parent.name,requiredNodes:required};
 });
 await (await waitChunks(page)).screenshot({path:files[0]});
 await page.evaluate(()=>window.__hikerRevisionReview.startWalk());await page.waitForTimeout(2000);
 const walk=await page.evaluate(()=>window.__hikerRevisionReview.stop());
 await (await waitChunks(page)).screenshot({path:files[1]});assert.equal(errors.length,0);
 assert(walk.frames>1);for(const side of ['Left','Right']){
  const start=walk.stats[0][side];assert(walk.stats.some(f=>f[side].some((v,i)=>Math.abs(v-start[i])>.005)),`${side} 손·스틱이 움직이지 않음`);
 }
 writeFileSync(files[2],JSON.stringify({result,walk,errors},null,2),{flag:'wx'});
 console.log('검토 캡처:',files.slice(0,2));
}finally{await browser.close();}
