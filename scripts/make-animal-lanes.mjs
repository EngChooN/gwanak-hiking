// 동물 출현 구역의 등산로 옆 허용 폭(2026-11-07 산풍경). 개발 서버(vite)를 띄운 뒤:
//   node scripts/make-animal-lanes.mjs [http://127.0.0.1:5341] [출력 폴더]
// 결과: src/animal-lanes.js(ANIMAL_LANES 자료, 산개발이 animal-zones.js에 연결), <출력 폴더>/animal-lanes.json(구역별 요약·금지 영역)
// 좌표는 animal-zones.js와 같다: u = 코스 수평거리(m), v = 길 가운데선에서 옆으로(+ = side +1 = 오르는 방향 오른쪽).
// ① 허용 폭(벽처럼 이어지는 것): u 5m마다·양쪽마다 길 가장자리에서 바깥으로 0.25m씩 나가며 처음 막히는 곳을 찾는다.
//  - cliff: 지형 경사 40° 넘음(옆·길 방향 0.5m 차분 중 큰 쪽, 화면 지형 window.__surface)
//  - water: 계곡 물줄기 띠·호수(water-clearance.js) + 0.3m
//  - road: 다른 구간 노면(굽은 길·갈지자에서 옆 길로 넘어감) + 0.3m
//  허용 폭 = 처음 막힌 곳 − 0.3m(동물 몸 반 길이), 10m 넘게 안 막히면 10.
// ② 금지 영역(점처럼 흩어진 것): 원 [x, z, r]. 동물 자리가 원 안이면 다른 자리를 고른다.
//  - rock: 바위 몸체(숲 청크의 rock 인스턴스, 수평 반경 ≥ 0.25m, 더 작은 돌은 동물보다 낮다) + 0.15m. 허용 폭 띠 안(가장자리 10m + 반경)에 걸치는 것만.
//  - site: 시설·소품 받침(정상 시설·구간 시설·상호작용 소품·즐길거리) + 0.2m
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const [base='http://127.0.0.1:5341',out='artifacts/animal-lanes-2026-11-07']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const STEP=5,REACH=10,BODY=.3;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
let template;{const ctx=await browser.newContext({viewport:{width:640,height:400}});const page=await ctx.newPage();await page.goto(`${base}/hiking/?start=entrance&quality=low`);
 template=await page.evaluate(async()=>{const {initialState}=await import('/src/movement.js');return initialState({start:'demo'});});await ctx.close();}
// 숲 청크는 출발 자리 둘레 약 1km만 붙는다. 다섯 자리에서 열어 바위를 모은다.
const rocks=new Map();let lanes=null;
const starts=[400,1400,2400,3400,4400];
for(const s of starts){
 const ctx=await browser.newContext({viewport:{width:640,height:400}});
 const save=JSON.stringify({...template,s,lateral:0,zone:'route',view:'third'});
 await ctx.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await ctx.newPage();page.on('pageerror',e=>console.error('pageerror',e.message));
 await page.goto(`${base}/hiking/?time=11:00&weather=clear&season=summer&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady,null,{timeout:300000});
 await page.evaluate(()=>window.hiking.chunks.ready());await page.waitForTimeout(1000);
 const found=await page.evaluate(()=>{let root=window.__hiker.scene;while(root.parent)root=root.parent;root.updateMatrixWorld(true);
  const V=window.__hiker.scene.position.constructor,M=new root.matrixWorld.constructor(),P=new V(),S=new V(),Q=window.__hiker.scene.quaternion.clone(),list=[];
  root.traverse(o=>{if(o.userData?.natureKind!=='rock'||!o.levels?.length)return;o.levels[0].object.traverse(m=>{if(!m.isInstancedMesh)return;m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,rx=Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),rz=Math.max(Math.abs(b.min.z),Math.abs(b.max.z));
   for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);M.premultiply(m.matrixWorld);M.decompose(P,Q,S);list.push([+P.x.toFixed(2),+P.z.toFixed(2),+Math.hypot(rx*Math.abs(S.x),rz*Math.abs(S.z)).toFixed(2)]);}});});
  return list;});
 for(const r of found)rocks.set(`${Math.round(r[0]*10)},${Math.round(r[1]*10)}`,r);
 console.error('start',s,'rocks',found.length,'total',rocks.size);
 if(s===starts.at(-1))lanes=await page.evaluate(async({rocks,STEP,REACH,BODY})=>{
  const L=window.__landscape,S=L.status,H=window.__surface;
  const {routeMeasure}=await import('/assets/realistic/interaction-sites.js'),{waterClearance}=await import('/assets/realistic/water-clearance.js'),{ANIMAL_ZONES}=await import('/src/interaction-data.js');
  const me=routeMeasure(L.route),water=waterClearance(L.route);
  const sites=[...(S.summitFacilities?.sites??[]),...(S.sectionScenery?.sites??[]),...S.interactionProps.sites,...S.trailProps.sites].map(s=>({id:s.id,x:s.x,z:s.z,r:s.clearRadius??s.supportRadius??s.radius??1}));
  const slopeAt=(x,z,tx,tz)=>{const d=.5,a=Math.abs(H(x-tz*d,z+tx*d)-H(x+tz*d,z-tx*d))/(2*d),b=Math.abs(H(x+tx*d,z+tz*d)-H(x-tx*d,z-tz*d))/(2*d);return Math.atan(Math.max(a,b))*180/Math.PI;};
  const rows=[],blocks=[];
  for(let u=0;u<=me.length;u+=STEP){const p=me.at(u),hw=p.width/2,row={u,hw:+hw.toFixed(2),lane:{},why:{}};
   for(const side of [1,-1]){let lane=REACH,why=null;
    for(let e=0;e<=REACH;e+=.25){const v=hw+e,x=p.x-p.tz*v*side,z=p.z+p.tx*v*side;let w=null;
     const n=me.nearest(x,z);
     if(Math.abs(n.m-u)>15&&n.d<me.at(n.m).width/2+.3)w='road';
     else if(water.blocked(x,z,.3))w='water';
     else if(e>.25&&slopeAt(x,z,p.tx,p.tz)>40)w='cliff';
     if(w){lane=Math.max(0,e-BODY);why=w;blocks.push({u,side,e,why:w,x:+x.toFixed(1),z:+z.toFixed(1)});break;}}
    row.lane[side]=+lane.toFixed(2);row.why[side]=why;}
   rows.push(row);}
  // 금지 원: 허용 폭 띠(길 가장자리 + 허용 폭) 안에 몸체가 걸치는 바위·시설
  const laneAt=(u,side)=>{const i=Math.max(0,Math.min(rows.length-1,Math.round(u/STEP)));return rows[i].lane[side];};
  const inBand=(x,z,r)=>{const n=me.nearest(x,z);if(n.d-r>me.at(n.m).width/2+REACH)return false;const q=me.at(n.m),side=((x-q.x)*-q.tz+(z-q.z)*q.tx)>=0?1:-1;return n.d-r<=q.width/2+laneAt(n.m,side)+BODY;};
  const forbid=[...rocks.filter(r=>r[2]>=.25).map(r=>({kind:'rock',x:r[0],z:r[1],r:r[2]+.15})),...sites.map(s=>({kind:'site',id:s.id,x:s.x,z:s.z,r:s.r+.2}))].filter(c=>inBand(c.x,c.z,c.r));
  for(const c of forbid)c.u=+me.nearest(c.x,c.z).m.toFixed(1);
  // 구역 요약: 양쪽 허용 폭의 10%·50% 값, 막힌 이유 수, 동물별 최소 폭(ANIMAL_STYLE offset[0])을 못 채우는 u 비율
  const zones=ANIMAL_ZONES.filter(z=>!z.box).map(z=>{const rs=rows.filter(r=>r.u>=z.from&&r.u<Math.min(z.to,me.length));const q=(a,f)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)*f)]:null;};
   const out={id:z.id,from:z.from,to:Math.min(z.to,Math.round(me.length)),samples:rs.length};
   for(const side of [1,-1]){const a=rs.map(r=>r.lane[side]),why={};for(const r of rs)if(r.why[side])why[r.why[side].split(':')[0]]=(why[r.why[side].split(':')[0]]??0)+1;out[side>0?'plus':'minus']={p10:q(a,.1),p50:q(a,.5),min:Math.min(...a),why};}
   const fz=forbid.filter(c=>c.u>=z.from&&c.u<z.to);out.forbid={rock:fz.filter(c=>c.kind==='rock').length,site:fz.filter(c=>c.kind==='site').map(c=>c.id)};
   // 허용 폭 띠 중 금지 원이 덮는 비율(0.5m 격자 표본)
   let all=0,hit=0;for(const r of rs)for(const side of [1,-1])for(let e=0;e<=r.lane[side];e+=.5){const p=me.at(r.u),v=r.hw+e,x=p.x-p.tz*v*side,zz=p.z+p.tx*v*side;all++;if(fz.some(c=>Math.hypot(c.x-x,c.z-zz)<c.r))hit++;}
   out.forbidShare=all?+(hit/all).toFixed(3):0;
   return out;});
  return {rows,zones,blocks,forbid};},{rocks:[...rocks.values()],STEP,REACH,BODY});
 await ctx.close();
}
await browser.close();
// src/animal-lanes.js: u 5m마다 [plus, minus] 허용 폭(길 가장자리에서 m, 0.1m 단위로 내림)
const pack=lanes.rows.map(r=>[Math.floor(r.lane[1]*10)/10,Math.floor(r.lane[-1]*10)/10]);
const js=`// 동물 출현 구역의 등산로 옆 허용 폭(자동 생성: scripts/make-animal-lanes.mjs, ${new Date().toISOString().slice(0,10)} 산풍경). 손으로 고치지 않는다.
// u = 코스 수평거리(m, animal-zones.js의 u와 같다), ${STEP}m 간격. 값 = [side +1 쪽, side −1 쪽]의 허용 폭(m) = 길 가장자리에서 처음 막히는 곳(절벽 40°·물·다른 구간 노면) − ${BODY}m.
// ${REACH}m 안에서 막히지 않으면 ${REACH}. 쓰는 법: offset 상한 = min(ANIMAL_STYLE offset[1], zone.maxOffset, laneLimit(u, side)). offset[0]보다 작으면 그 자리·그 쪽은 나오지 않게 한다.
export const ANIMAL_LANE_STEP=${STEP};
export const ANIMAL_LANE_REACH=${REACH};
export const ANIMAL_LANES=Object.freeze(${JSON.stringify(pack)});
// 금지 영역 원 [x, z, r](월드 m, 0.1m 단위): 바위 몸체 + 0.15m, 시설·소품 받침 + 0.2m. 허용 폭 띠에 걸치는 것만(${lanes.forbid.length}개).
export const ANIMAL_FORBID=Object.freeze(${JSON.stringify(lanes.forbid.map(c=>[Math.round(c.x*10)/10,Math.round(c.z*10)/10,Math.ceil(c.r*10)/10]))});
// u에서 side(+1·−1) 쪽 허용 폭. 앞뒤 칸 중 좁은 쪽을 쓴다(칸 사이에서 막힌 곳을 넘지 않게).
export function laneLimit(u,side){const i=Math.max(0,Math.min(ANIMAL_LANES.length-1,Math.floor(u/ANIMAL_LANE_STEP))),j=Math.min(ANIMAL_LANES.length-1,i+1),k=side>=0?0:1;return Math.min(ANIMAL_LANES[i][k],ANIMAL_LANES[j][k]);}
// (u, v)가 허용 폭 안인지. halfWidth = 그 자리 노면 반폭(animal-zones.js와 같은 함수).
export function laneAllows(u,v,halfWidth=()=>1.1){const e=Math.abs(v)-halfWidth(u);return e<=laneLimit(u,v>=0?1:-1);}
// (x, z)가 금지 원 안인지. 8m 칸 색인은 처음 부를 때 한 번 만든다.
let forbidGrid=null;const FORBID_CELL=8,cellKey=(i,j)=>i*100003+j;
export function inForbid(x,z){if(!forbidGrid){forbidGrid=new Map();for(const c of ANIMAL_FORBID){const k=cellKey(Math.floor(c[0]/FORBID_CELL),Math.floor(c[1]/FORBID_CELL));if(!forbidGrid.has(k))forbidGrid.set(k,[]);forbidGrid.get(k).push(c);}}
 const i=Math.floor(x/FORBID_CELL),j=Math.floor(z/FORBID_CELL);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const c of forbidGrid.get(cellKey(i+a,j+b))??[])if(Math.hypot(x-c[0],z-c[1])<c[2])return true;return false;}
`;
writeFileSync('src/animal-lanes.js',js);
writeFileSync(`${out}/animal-lanes.json`,JSON.stringify({step:STEP,reach:REACH,body:BODY,rocks:rocks.size,zones:lanes.zones,blocks:lanes.blocks,forbid:lanes.forbid},null,1));
for(const z of lanes.zones)console.log(z.id,z.from,z.to,'plus',JSON.stringify(z.plus),'minus',JSON.stringify(z.minus),'forbid',JSON.stringify(z.forbid),z.forbidShare);
