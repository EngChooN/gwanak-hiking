import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
for(const id of [152336,3769500]){
 const file=`assets/realistic/raw/han-river-${id}-full.json`;let data;
 try{data=JSON.parse(await readFile(file,'utf8'));}catch{const url=`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`;data=JSON.parse(execFileSync('curl',['-f','-sS','--max-time','120',url],{maxBuffer:100000000}).toString());data.source=url;data.retrieved=new Date().toISOString();await writeFile(file,JSON.stringify(data));}
 const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const ways=new Map(data.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
 const relation=data.elements.find(e=>e.type==='relation'&&e.id===id);if(!relation?.members)throw Error('한강 relation members 누락');
 const members=relation.members.map(m=>m.type==='way'?{...m,geometry:ways.get(m.ref)?.nodes.map(id=>({lat:nodes.get(id).lat,lon:nodes.get(id).lon}))}:m);
 const output={elements:[{...relation,members}],source:data.source,retrieved:data.retrieved,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors'};
 await writeFile(`assets/realistic/generated/han-river-${id}-water.json`,JSON.stringify(output));console.log(id,members.length);
}
const file='assets/realistic/generated/manifest.json',m=JSON.parse(await readFile(file,'utf8'));
// 완전 relation을 먼저 읽어 이전 tags-only 항목이 seen 집합에서 실제 수면을 막지 않도록 한다.
m.water=[...new Set(['han-river-152336-water.json','han-river-3769500-water.json',...m.water])];await writeFile(file,JSON.stringify(m));
