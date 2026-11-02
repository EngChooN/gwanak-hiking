// 스캔 원본에서 한 변형을 선택, 표면 단순화·1K 텍스처·Meshopt GLB 생성.
import {NodeIO,getBounds,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,compactPrimitive,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const out=new URL('../generated/nature/',import.meta.url);mkdirSync(out,{recursive:true});
const ids=['pine_tree_01','pine_sapling_medium','tree_small_02','island_tree_01','rock_09','rock_face_01','rock_face_02','boulder_01','mountainside'];
const report=[];
for(const id of ids){
 if(process.argv[2]&&id!==process.argv[2])continue;
 const tree=ids.indexOf(id)<4,file=new URL(`../models-raw/polyhaven/${id}/${id}_1k.gltf`,import.meta.url);
 const doc=await io.read(file.pathname);doc.setLogger(new Logger(Logger.Verbosity.WARN));
 const scene=doc.getRoot().getDefaultScene(),keep=scene.listChildren()[0];
 for(const n of scene.listChildren())if(n!==keep)n.dispose();
 await doc.transform(prune());
 const bounds=getBounds(scene),height=bounds.max[1]-bounds.min[1],cx=(bounds.min[0]+bounds.max[0])/2,cz=(bounds.min[2]+bounds.max[2])/2;
 const translation=keep.getTranslation();keep.setTranslation([translation[0]-cx,translation[1]-bounds.min[1],translation[2]-cz]);
 const scale=tree?([12,5,9,10][ids.indexOf(id)]/height):1;
 const wrapper=doc.createNode('Y-up metre base=0').setScale([scale,scale,scale]);scene.removeChild(keep);wrapper.addChild(keep);scene.addChild(wrapper);
 for(const tex of doc.getRoot().listTextures()){
   const meta=await sharp(tex.getImage()).metadata(),alpha=meta.hasAlpha;
   const image=sharp(tex.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true});
   tex.setImage(await (alpha?image.png({compressionLevel:9}):image.jpeg({quality:82})).toBuffer()).setMimeType(alpha?'image/png':'image/jpeg');
 }
 for(const m of doc.getRoot().listMaterials())if(m.getAlphaMode()==='BLEND')m.setAlphaMode('MASK').setAlphaCutoff(.35);
 const initial=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0);
 const targets=tree?[350000,24000,5000]:[12000,3000,500];
 for(let level=0;level<targets.length;level++){
  const prims=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives());const total=prims.reduce((s,p)=>s+p.getIndices().getCount(),0);
  for(const prim of prims){
   const pos=prim.getAttribute('POSITION'),indices=Uint32Array.from(prim.getIndices().getArray());
   const target=Math.max(12,Math.floor(indices.length/total*targets[level])*3);
   if(indices.length>target){const [reduced]=MeshoptSimplifier.simplify(indices,pos.getArray(),3,target,tree?.12:.015,tree?['Permissive']:[]);prim.getIndices().setArray(reduced);compactPrimitive(prim);}
  }
  await doc.transform(prune());
  const triangles=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0);
  // 압축은 복제본에 적용하고 다음 단계 단순화에는 실수 속성을 유지한다.
  const {cloneDocument}=await import('@gltf-transform/functions');const packed=cloneDocument(doc);
  await packed.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const bytes=await io.writeBinary(packed);if(tree&&level===0){const bake=new URL('../models-raw/bake/',import.meta.url);mkdirSync(bake,{recursive:true});writeFileSync(new URL(`${id}.glb`,bake),bytes);}else writeFileSync(new URL(`${id}-lod${tree?level-1:level}.glb`,out),bytes);
  report.push({id,level:tree?level-1:level,initial,triangles,bytes:bytes.length,height:tree?[12,5,9,10][ids.indexOf(id)]:height,source:`https://polyhaven.com/a/${id}`,license:'CC0'});
  console.log(id,level,triangles,bytes.length);
 }
}
writeFileSync(new URL(process.argv[2]?`audit-${process.argv[2]}.json`:'model-audit.json',out),JSON.stringify(report,null,2));
