// 원본 작업 트리를 덮어쓰지 않고 보존한 수정 전 파일만 Vite load 단계에서 제공한다.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const before=process.argv[2]==='before';
const files=['src/main.js','src/rendering.js','src/terrain.js','src/realistic-models.js','assets/realistic/load-landscape.js'];
const original=new Map();
if(before)for(const file of files)original.set(resolve(root,file),await readFile(resolve(process.env.BEFORE_SOURCE??'/private/tmp/hiking-performance-before',file),'utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:5176,strictPort:true},plugins:[{name:'performance-before-source',enforce:'pre',load(id){return original.get(id.split('?')[0])??null;}}]});
await server.listen();server.printUrls();
console.log(before?'성능 측정: 수정 전 보존 소스 제공 중':'성능 측정: 현재 작업 트리 제공 중');
