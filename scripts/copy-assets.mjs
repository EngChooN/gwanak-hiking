import {inventory} from '../assets/realistic/inventory.mjs';
import {writeFileSync,existsSync} from 'node:fs';
import {cpSync,mkdirSync} from 'node:fs';
mkdirSync('dist/assets/data',{recursive:true});
cpSync('assets/manifest.json','dist/assets/manifest.json');
cpSync('assets/data','dist/assets/data',{recursive:true});
for(const name of ['summit-approach-lod1.glb','hiker-170-lod0.glb'])cpSync(`assets/${name}`,`dist/assets/${name}`);
console.log('게임 GLB·보행 데이터 정적 배포 복사 완료');

mkdirSync("dist/assets/realistic/generated",{recursive:true});
cpSync("assets/realistic/generated","dist/assets/realistic/generated",{recursive:true});
writeFileSync("dist/assets/realistic/generated/inventory.json",JSON.stringify(inventory()));
if(existsSync("assets/realistic/models"))cpSync("assets/realistic/models","dist/assets/realistic/models",{recursive:true});
