// 카툰 등산객 뼈대 GLB(2026-11-06 첫 로딩 단축). src/toon/link-hiker.js의 buildToonHikerGltf는 원본 Hiker.glb에서
// Mixamo 뼈대(노드 변환)만 복제하고 몸·동작은 직접 만든다. 그래서 메시·동작·버퍼(약 2MB)를 빼고 노드와 skin.joints만 남긴다.
// skin.joints가 있어야 GLTFLoader가 그 노드를 Bone으로 만든다(inverseBindMatrices는 쓰지 않으니 뺀다).
// 사용: node assets/source/build-toon-hiker-rig.mjs  (npm run assets:build에 포함)
import {readFileSync,writeFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const input=new URL('assets/toon/models/hiker/Hiker.glb',root),output=new URL('assets/toon/models/hiker/HikerRig.glb',root);

export function rigOnlyGlb(glb){
 if(glb.readUInt32LE(0)!==0x46546c67)throw new Error('GLB가 아님');
 const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
 const out={asset:{...json.asset,generator:'gwanak-hiking build-toon-hiker-rig'},scene:json.scene??0,scenes:json.scenes,
  nodes:json.nodes.map(({mesh,skin,...node})=>node),
  skins:(json.skins??[]).map(({inverseBindMatrices,...skin})=>skin)};
 let text=JSON.stringify(out);while(Buffer.byteLength(text)%4)text+=' ';
 const body=Buffer.from(text),header=Buffer.alloc(20);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+body.length,8);header.writeUInt32LE(body.length,12);header.writeUInt32LE(0x4e4f534a,16);
 return Buffer.concat([header,body]);
}

if(import.meta.url===`file://${process.argv[1]}`){
 const rig=rigOnlyGlb(readFileSync(input));writeFileSync(output,rig);
 console.log(`HikerRig.glb ${rig.length} bytes (원본 ${readFileSync(input).length} bytes)`);
}
