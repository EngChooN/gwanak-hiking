// 로컬 파일만 사용하는 8방향 소나무 베이크·실제 자산 감사. 기존 GLB/PNG는 변경하지 않는다.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json','.wasm':'application/wasm'};
let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1100,height:690},deviceScaleFactor:1});
 // 포트 바인딩 없이 Playwright가 로컬 파일 응답을 공급한다. 외부 요청은 전부 차단한다.
 await page.route('**/*',async route=>{try{
  const url=new URL(route.request().url());if(url.origin!=='http://pine-atlas.local'){await route.abort();return;}
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><title>소나무 아틀라스 검수</title>'});return;}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep)){await route.abort();return;}
  await route.fulfill({contentType:mime[extname(path)]??'application/octet-stream',body:await readFile(path)});
 }catch{await route.fulfill({status:404,body:'로컬 파일 없음'});}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://pine-atlas.local/');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {MeshoptDecoder}=await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const {twigCutout}=await import('/assets/realistic/foliage-material.js');
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),audit=[];let pine;
  for(const id of ['pine_tree_01','pine_sapling_medium','tree_small_02','island_tree_01'])for(let lod=0;lod<3;lod++){
   const path=`/assets/realistic/generated/nature/${id}-lod${lod}.glb`,gltf=await loader.loadAsync(path),model=gltf.scene;
   model.updateMatrixWorld(true);let triangles=0;const mats=new Set(),textures=new Set(),planes=[];
   model.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}
    if(id==='pine_tree_01'&&lod>0){const p=g.attributes.position,idx=g.index;
     for(let i=0;i<(idx?.count??p.count);i+=3){const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(o.matrixWorld));
      const n=new T.Vector3().subVectors(v[1],v[0]).cross(new T.Vector3().subVectors(v[2],v[0])).normalize();
      const angle=((Math.atan2(n.x,n.z)*180/Math.PI)%180+180)%180;planes.push(Math.round(angle*10)/10);}
    }
   });
   const b=new T.Box3().setFromObject(model);audit.push({id,lod,path,triangles,materials:mats.size,materialDetails:[...mats].map(m=>({name:m.name,color:m.color.toArray(),map:!!m.map,alphaMap:!!m.alphaMap,alphaTest:m.alphaTest,opacity:m.opacity,transparent:m.transparent})),bounds:{min:b.min.toArray(),max:b.max.toArray()},textures:[...textures].map(t=>({width:t.image.width,height:t.image.height,colorSpace:t.colorSpace})),planeNormalAzimuthDegrees:[...new Set(planes)].sort((a,b)=>a-b)});
   if(id==='pine_tree_01'&&lod===0)pine=model;
  }
  const img=new Image();img.src='/assets/realistic/generated/nature/pine_tree_01-impostor.png';await img.decode();
  const oldCanvas=document.createElement('canvas');oldCanvas.width=img.width;oldCanvas.height=img.height;const oldCtx=oldCanvas.getContext('2d');oldCtx.drawImage(img,0,0);
  const oldPixels=oldCtx.getImageData(0,0,img.width,img.height).data;let oldOpaque=0,oldTransparent=0;
  for(let i=3;i<oldPixels.length;i+=4){if(oldPixels[i]===0)oldTransparent++;if(oldPixels[i]===255)oldOpaque++;}
  const originalBox=new T.Box3().setFromObject(pine),center=originalBox.getCenter(new T.Vector3()),height=originalBox.max.y-originalBox.min.y;
  pine.position.add(new T.Vector3(-center.x,-originalBox.min.y,-center.z));pine.updateMatrixWorld(true);
  const b=new T.Box3().setFromObject(pine),azimuths=[0,45,90,135,180,225,270,315];let halfWidth=0;
  for(const deg of azimuths){const a=deg*Math.PI/180;for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z])halfWidth=Math.max(halfWidth,Math.abs(x*Math.cos(a)-z*Math.sin(a)));}
  const size=Math.max(height*512/480,2*halfWidth*512/480),renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(512,512);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;
  pine.traverse(o=>{if(!o.isMesh)return;const convert=m=>{
   const material=twigCutout(new T.MeshBasicMaterial({map:m.map,color:m.color.clone().multiplyScalar(1.8),side:T.DoubleSide,alphaTest:m.alphaTest,transparent:false}),m.name);
   const cutout=material.onBeforeCompile;material.onBeforeCompile=shader=>{cutout(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n diffuseColor.a = 1.0;');};
   material.customProgramCacheKey=()=>`pine-atlas-solid-cutout-${m.name}`;return material;
  };o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
  const scene=new T.Scene();scene.add(pine);const camera=new T.OrthographicCamera(-size/2,size/2,size/2,-size/2,.01,1000);
  const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=1024;const ctx=atlas.getContext('2d',{willReadFrequently:true});
  const cells=[];const cameraY=240/512*size;
  for(let i=0;i<8;i++){
   const a=azimuths[i]*Math.PI/180;camera.position.set(Math.sin(a)*60,cameraY,Math.cos(a)*60);camera.lookAt(0,cameraY,0);renderer.render(scene,camera);
   const x=i%4*512,y=Math.floor(i/4)*512;ctx.drawImage(renderer.domElement,x,y);const image=ctx.getImageData(x,y,512,512),d=image.data;
   let minX=512,minY=512,maxX=-1,maxY=-1,pixels=0;
   for(let py=0;py<512;py++)for(let px=0;px<512;px++)if(d[(py*512+px)*4+3]>0){minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);pixels++;}
   if(!pixels||minX<8||minY<8||maxX>503||maxY>503)throw Error(`셀 ${i} 여백·빈 이미지 검사 실패`);
   ctx.putImageData(image,x,y);cells.push({index:i,azimuthDegrees:azimuths[i],alphaBounds:{min:[minX,minY],max:[maxX,maxY]},nonzeroAlphaPixels:pixels});
  }
  const url=atlas.toDataURL('image/png');renderer.dispose();
  return {url,audit,existingPng:{path:'assets/realistic/generated/nature/pine_tree_01-impostor.png',width:img.width,height:img.height,opaquePixels:oldOpaque,transparentPixels:oldTransparent},atlas:{texture:'pine-impostor-atlas-v1.png',size:[2048,1024],grid:[4,2],cellSize:[512,512],cellPivotPixelsTopLeft:[256,496],azimuthDegrees:azimuths,elevationDegrees:0,modelHeightMeters:height,planeSizeMeters:size,modelNormalizationTranslation:[-center.x,-originalBox.min.y,-center.z],colorMode:'diffuse unlit + twigCutout, color×1.8, NeutralToneMapping, surviving fragment alpha=1 (AA coverage preserved)',rgbDilationPixels:0,mipmaps:'PNG에 밉 없음. 셀별 밉 생성 또는 최대 mip 레벨 제한 필요',rgba8BaseBytes:8388608,rgba8FullMipBytes:11184812,cells}};
 });
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(result.atlas.cells.length,8);
 const png=Buffer.from(result.url.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),2048);assert.equal(png.readUInt32BE(20),1024);
 await writeFile(resolve(root,'assets/pine-impostor-atlas-v1.png'),png);
 const {url,...meta}=result;await writeFile(resolve(root,'assets/pine-impostor-atlas-v1.json'),JSON.stringify({...meta,errors},null,2));
 await page.evaluate(url=>{document.body.style.cssText='margin:0;background:#e9edf0;font:16px sans-serif;color:#172c24';
 const heading=document.createElement('p');heading.textContent='소나무 실모델 8방향 · 위 0° / 45° / 90° / 135° · 아래 180° / 225° / 270° / 315°';heading.style.margin='20px';document.body.append(heading);
 const img=new Image();img.src=url;img.style.cssText='display:block;width:1024px;height:512px;margin:20px;background:repeating-conic-gradient(#dbe0db 0% 25%,#f4f6f3 0% 50%) 0/24px 24px';document.body.append(img);},result.url);
 await page.waitForFunction(()=>document.images.length===1&&document.images[0].complete);
 await mkdir(resolve(root,'artifacts'),{recursive:true});await page.screenshot({path:resolve(root,'artifacts/pine-impostor-atlas-v1-preview.png')});
 console.log(JSON.stringify({pngBytes:png.length,audit:meta.audit.map(({id,lod,triangles,materials})=>({id,lod,triangles,materials})),atlas:meta.atlas,errors},null,2));
}finally{if(browser)await browser.close();}
