import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';
const b=readFileSync('/Users/pc-2311001/gwanak-hiking/assets/realistic/models/hiker/Hiker.glb');
const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
g.scene.updateMatrixWorld(true);
g.scene.traverse(o=>{if(!o.isSkinnedMesh)return;const bb=new Box3().setFromBufferAttribute(o.geometry.attributes.position);console.log(o.name,o.geometry.attributes.position.count,'bbox',bb.min.toArray().map(v=>v.toFixed(3)),bb.max.toArray().map(v=>v.toFixed(3)),'uv',!!o.geometry.attributes.uv,'bindId',o.bindMatrix.equals(new (o.bindMatrix.constructor)()),'bones',o.skeleton.bones.length);});
const sk=[];g.scene.traverse(o=>{if(o.isSkinnedMesh&&!sk.length)sk.push(o.skeleton);});
const s=sk[0];const names=s.bones.map(b=>b.name.replace('mixamorig',''));console.log(names.join(','));
for(const n of ['Hips','Spine','Spine1','Spine2','Neck','Head','HeadTop_End','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot']){const i=names.indexOf(n);if(i<0){console.log(n,'missing');continue;}const m=s.boneInverses[i].clone().invert();const p=new Vector3().setFromMatrixPosition(m);console.log(n,i,p.toArray().map(v=>v.toFixed(3)).join(','));}
console.log('anims',g.animations.map(a=>a.name).join(','));
