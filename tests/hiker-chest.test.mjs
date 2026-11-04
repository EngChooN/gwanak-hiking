import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {flattenChest} from '../src/realistic-hiker.js';

async function loadScene(){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL('../assets/realistic/models/hiker/Hiker.glb',import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return (await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'')).scene;}finally{console.warn=warn;}
}
// 상의 앞면 최대 깊이(z): 가슴 양쪽(|x| 6~9cm) − 가운데(|x|<2cm), 높이 1.24~1.28m
function bulge(scene){let jacket;scene.traverse(o=>{if(o.isSkinnedMesh&&/jacket/i.test(o.name))jacket=o;});
 const p=jacket.geometry.attributes.position;let side=-1,mid=-1;
 for(let i=0;i<p.count;i++){const x=Math.abs(p.getX(i)),y=p.getY(i),z=p.getZ(i);if(y<1.24||y>1.28)continue;if(x>.06&&x<.09)side=Math.max(side,z);if(x<.02)mid=Math.max(mid,z);}
 return side-mid;}

test('남성 가슴: 상의 가슴 양쪽이 가운데보다 5mm 넘게 튀어나오지 않고, 두 번 적용해도 한 번만 바뀐다',async()=>{
 const scene=await loadScene(),before=bulge(scene);
 flattenChest(scene);const after=bulge(scene);flattenChest(scene);
 assert.ok(before>.01,`원본 돌출 ${before}`);
 assert.ok(after<.005,`수정 후 돌출 ${after}`);
 assert.equal(bulge(scene),after);
});
