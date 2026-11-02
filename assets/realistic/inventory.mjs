import {readdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import config from './config.json' with {type:'json'};
import {placeReference} from './skyline-reference.js';
const folder=fileURLToPath(new URL('./generated/',import.meta.url));
export function inventory(){
 const files=readdirSync(folder);const route=JSON.parse(readFileSync(folder+'route.json'));
 const grid=(file,x0,z0,width,height,spacing)=>{const bytes=statSync(folder+file).size;if(bytes!==width*height*4)throw new Error(`${file} 격자 크기 불일치`);return {file,x0,z0,width,height,spacing,bytes};};
 const b=config.dem.routeBuffer,spacing=config.dem.nearSpacing;
 const x0=Math.floor((Math.min(...route.map(p=>p.x))-b)/8)*8,z0=Math.floor((Math.min(...route.map(p=>p.z))-b)/8)*8;
 const near=grid('near.f32',x0,z0,Math.ceil((Math.max(...route.map(p=>p.x))+b-x0)/spacing)+1,Math.ceil((Math.max(...route.map(p=>p.z))+b-z0)/spacing)+1,spacing);
 const f=config.dem.farHalfExtent,fs=config.dem.farSpacing;
 return {...config,version:1,inventoryFallback:true,near,far:grid('far.f32',-f,-f,Math.ceil(2*f/fs)+1,Math.ceil(2*f/fs)+1,fs),route:'route.json',hdri:'sky.hdr',
 materials:Object.fromEntries(Object.entries(config.materials).map(([k,m])=>[k,{...m,diff:`${k}-diff.jpg`,nor_gl:`${k}-nor_gl.png`,rough:`${k}-rough.jpg`}])),
 cityChunks:files.filter(f=>/^(seoul|anyang|gwacheon).*\-\d+\.json$/.test(f)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(file=>({id:file.slice(0,-5),file})),water:files.filter(f=>f.endsWith('-water.json')),
 landmarks:config.landmarks.map(p=>({...placeReference(p,config.observation),ground:p.ground??0}))};
}
