import {execFileSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
for(const [id,bbox] of [['north','37.49,126.80,37.64,127.14'],['south','37.40,126.88,37.49,127.08']]){
 const file=`assets/realistic/raw/seoul-surface-${id}-osm.json`;
 try{await readFile(file);console.log('캐시',id);continue;}catch{}
 const q=`[out:json][timeout:90];(way[landuse](${bbox});way[leisure=park](${bbox});way[natural~"wood|scrub|grassland"](${bbox});way[highway~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"](${bbox}););out tags geom;`;
 let ok=false;for(const host of ['https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']){try{const data=JSON.parse(execFileSync('curl',['-f','-sS','--max-time','150','-G',host,'--data-urlencode','data='+q],{maxBuffer:100000000}).toString());if(data.remark)throw Error(data.remark);await writeFile(file,JSON.stringify({...data,source:host,query:q,retrieved:new Date().toISOString(),license:'ODbL-1.0',attribution:'© OpenStreetMap contributors'}));console.log(id,data.elements.length);ok=true;break;}catch(e){console.error(id,e.message);}}if(!ok)throw Error('OSM 자료 확보 실패 '+id);
}
