// 배치/LOD 거리·형상을 보존하고 기존 사진판 GLB의 이미지만 교체한다.
import {NodeIO} from '@gltf-transform/core';
import {KHRMaterialsUnlit} from '@gltf-transform/extensions';
import {readFileSync} from 'node:fs';
const io=new NodeIO().registerExtensions([KHRMaterialsUnlit]);
for(const id of ['pine_tree_01','pine_sapling_medium','tree_small_02','island_tree_01']){
 const image=new Uint8Array(readFileSync(new URL(`../generated/nature/${id}-impostor.png`,import.meta.url)));
 for(const level of [1,2]){
  const path=new URL(`../generated/nature/${id}-lod${level}.glb`,import.meta.url).pathname;
  const doc=await io.read(path);
  for(const texture of doc.getRoot().listTextures())texture.setImage(image).setMimeType('image/png');
  await io.write(path,doc);
 }
 console.log(id,'LOD1/2 이미지 교체');
}
