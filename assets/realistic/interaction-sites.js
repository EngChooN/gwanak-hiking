// 상호작용 소품 배치 자료. 위치 근거는 docs/상호작용-자료.md(산리서치, 2026-11-04)이고 모델은 interaction-props.js에 있다.
// 위치를 바꿀 때는 이 표만 고친다. s = GPX 시작점부터 코스를 따라간 수평거리(m, 자료 문서와 같은 기준).
// lat/lon이 있으면 그 점에서 가장 가까운 코스 옆으로 놓고, 없으면 s 지점에서 side(+1 = 오르는 방향 오른쪽) 쪽 길가에 놓는다.
// anchor: 'gate' = 일주문 기준 좌표(x 좌우, z 광장 쪽 +), 'marker'·'eungjinjeon' = 정상 시설 기준 좌표(+Z 시설 정면).
// snap: 좌표가 코스에서 몇 m 떨어져 있어도 길가(노면 가장자리 + clear)에 붙인다(스탬프함은 길에서 바로 찍을 수 있어야 한다).
// 모든 자리는 지도·GPX 후보이고 현장 확인 전이다(status). 길 위에 걸리지 않게 노면 가장자리에서 clear(m)만큼 떨어뜨린다.
import * as THREE from 'three';
import {createPropLod,lodStats,squirrelModel,magpieModel,looseStone} from './interaction-props.js';
import {project} from './geo.js';

const SRC='docs/상호작용-자료.md';
export const INTERACTION_SITES=Object.freeze([
 // ① 스탬프 6곳(§①). 번호·글자는 산디자인 수첩 시안(門·瀑·亭·塔·庵·臺)과 같다.
 {id:'stamp-1',kind:'stampBox',number:1,name:'일주문',anchor:'gate',local:[-7.4,9.6],localYaw:Math.PI/2,source:`${SRC} §① #1`,status:'광장 안 임의 자리(서울둘레길 스탬프는 입구 안내소·화장실 앞이라는 2014~15 기록뿐)'},
 {id:'stamp-2',kind:'stampBox',snap:true,number:2,name:'인공폭포',s:1316,lat:37.457176,lon:126.947670,side:-1,source:`${SRC} §① #2`},
 {id:'stamp-3',kind:'stampBox',snap:true,number:3,name:'팔각정',s:2392,lat:37.448868,lon:126.947136,side:1,source:`${SRC} §① #3`},
 {id:'stamp-4',kind:'stampBox',snap:true,number:4,name:'돌탑 공터',s:3774,lat:37.444874,lon:126.958221,side:-1,source:`${SRC} §① #4`},
 {id:'stamp-5',kind:'stampBox',snap:true,number:5,name:'연주암 갈림길',s:4474,lat:37.441902,lon:126.964920,side:-1,source:`${SRC} §① #5`},
 {id:'stamp-6',kind:'stampBox',number:6,name:'연주대 정상석',anchor:'marker',local:[-2.3,.9],localYaw:.35,source:`${SRC} §① #6`},
 // ② 코스 이정표(§② 표, GPX 2022 기록 지명만). 첫 지명 = 오르는 쪽, 둘째 = 내려가는 쪽, 나머지 = 옆길(방향은 추정).
 {id:'sign-518',kind:'trailSign',s:518,side:1,boards:['연주대 · 관악산 야외식물원','관악산공원 입구','호압사']},
 // 1,071m 이정표는 기존 제1광장 쉼터 모델(section-scenery.js junction)의 이정표가 맡는다.
 {id:'sign-1071',kind:'trailSign',s:1071,boards:['연주대','관악산공원 입구','제1광장 · 삼성산'],existing:'section-scenery junction'},
 {id:'sign-1352',kind:'trailSign',s:1352,side:1,boards:['연주대','호수공원','이름 모를 산길']},
 {id:'sign-1935',kind:'trailSign',s:1935,side:1,boards:['연주대','호수공원','모자봉'],contentId:'바위:모자봉'},
 {id:'sign-2585',kind:'trailSign',s:2585,side:-1,boards:['연주대','호수공원','무너미고개']},
 {id:'sign-3249',kind:'trailSign',s:3249,side:1,boards:['연주대','서울대공대','제4쉼터'],status:'제4쉼터 표지 위치 불일치(📍)'},
 {id:'sign-3303',kind:'trailSign',s:3303,side:-1,boards:['연주대','서울대 공대','학바위 능선'],contentId:'바위:학바위 능선'},
 {id:'sign-4474',kind:'trailSign',s:4474,side:1,boards:['연주대 · 연주암','서울대','삼막사','안양유원지 · 팔봉능선']},
 {id:'sign-4484',kind:'trailSign',s:4484,side:-1,offset:3.2,boards:['연주대','서울대방향','과천방향']},
 {id:'sign-4569',kind:'trailSign',s:4569,side:1,boards:['연주대','연주암','사당역 · 연주샘 · 관악사지']},
 {id:'sign-4640',kind:'trailSign',s:4640,side:-1,boards:['연주대','연주암','안양방향']},
 {id:'sign-4753',kind:'trailSign',s:4753,side:1,boards:['연주대','연주암','소머리바위방향'],contentId:'바위:소머리바위'},
 // ② 해설 안내판(본문은 화면 패널, 판에는 제목만). contentId = 자료 문서 §②의 소제목.
 {id:'board-valley',kind:'infoBoard',s:1578,side:1,title:'관악산 계곡',subtitle:'화강암 계곡 · 평상 · 나무다리',contentId:'계곡'},
 {id:'board-yeonjuam',kind:'infoBoard',s:4482,side:1,offset:4.2,title:'연주암',subtitle:'과천시 · 삼층석탑(경기도 유형문화재)',contentId:'연주암'},
 {id:'board-eungjinjeon',kind:'infoBoard',anchor:'eungjinjeon',local:[3.2,5.4],localYaw:-.3,title:'응진전 · 말바위',subtitle:'연주대 절벽 위 기와집',contentId:'응진전'},
 {id:'board-summit',kind:'summitBoard',anchor:'marker',local:[2.7,.7],localYaw:-.35,title:'관악산 정상 · 연주대',subtitle:'정상석 629m 표기 · 포털 632m',contentId:'정상석'},
 // ④ 약수터·돌탑(§④).
 {id:'spring',kind:'spring',s:260,lat:37.465912,lon:126.947372,clear:1.4,source:`${SRC} §④`,status:'GPX 지점(코스 11m 옆). 물이 지금 나오는지·식수 여부 확인 전(📍)'},
 {id:'cairn',kind:'cairnField',s:3774,lat:37.444874,lon:126.958221,side:1,offset:4.6,source:`${SRC} §④`,status:'GPX "공터 옆 수많은 돌탑". 개수·크기·모양 추정(📍)'},
]);
// ⑤ 동물 나타나는 자리(정적 배치 아님). 산개발이 계절 가중으로 가끔 띄운다. 까치는 관악산 근거가 없어 입구 쪽만.
export const ANIMAL_SPAWNS=Object.freeze([
 {id:'squirrel-1',kind:'squirrel',s:1640,side:-1,offset:3.4,season:{autumn:1,summer:.6,spring:.4,winter:.1}},
 {id:'squirrel-2',kind:'squirrel',s:2250,side:1,offset:3,season:{autumn:1,summer:.6,spring:.4,winter:.1}},
 {id:'squirrel-3',kind:'squirrel',s:2950,side:-1,offset:2.8,season:{autumn:1,summer:.6,spring:.4,winter:.1}},
 {id:'squirrel-4',kind:'squirrel',s:3700,side:1,offset:3.2,season:{autumn:1,summer:.6,spring:.4,winter:.1}},
 {id:'squirrel-5',kind:'squirrel',s:4120,side:-1,offset:2.6,season:{autumn:1,summer:.6,spring:.4,winter:.1}},
 {id:'magpie-1',kind:'magpie',anchor:'gate',local:[-3.8,15],localYaw:2.2,season:{autumn:1,summer:1,spring:1,winter:1}},
 {id:'magpie-2',kind:'magpie',anchor:'gate',local:[4.3,-5.5],localYaw:-.8,season:{autumn:1,summer:1,spring:1,winter:1}},
 {id:'magpie-3',kind:'magpie',s:140,side:1,offset:3.5,season:{autumn:1,summer:1,spring:1,winter:1}},
 {id:'magpie-4',kind:'magpie',s:650,side:-1,offset:4,season:{autumn:1,summer:1,spring:1,winter:1}},
]);
// 소품 종류별 바닥 반경(나무·풀 비우기, 걷기 막기)과 길가 여유.
// vegetation = 나무·풀·덤불을 비우는 반경(약수터·돌탑 공터는 둘레가 트인 빈터로 본다).
export const PROP_FOOTPRINT={trailSign:{radius:.6,clear:.7,collision:.12,vegetation:.9},infoBoard:{radius:.9,clear:.9,collision:.7,vegetation:1.4},summitBoard:{radius:.9,clear:.9,collision:.8,vegetation:1.2},stampBox:{radius:.5,clear:.8,collision:.25,vegetation:.9},spring:{radius:1.3,clear:1.4,collision:1.0,vegetation:3.2},cairnField:{radius:3,clear:1.5,collision:.6,vegetation:4.2},squirrel:{radius:0,clear:0,collision:0,vegetation:.4},magpie:{radius:0,clear:0,collision:0,vegetation:.4}};

// 코스 수평거리 색인. route는 풍경의 경로점(x,z,width). 자료 문서 s와 같은 수평 누적거리를 다시 잰다.
export function routeMeasure(route){
 const cum=[0];for(let i=1;i<route.length;i++)cum.push(cum[i-1]+Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z));
 const at=m=>{m=Math.max(0,Math.min(cum.at(-1),m));let lo=0,hi=cum.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(cum[mid]<=m)lo=mid;else hi=mid;}
  const a=route[lo],b=route[hi],t=(m-cum[lo])/((cum[hi]-cum[lo])||1),dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz)||1;
  return {x:a.x+dx*t,z:a.z+dz*t,width:(a.width??2.2)+((b.width??2.2)-(a.width??2.2))*t,tx:dx/n,tz:dz/n,m};};
 const nearest=(x,z)=>{let best={d:Infinity,m:0};for(let i=0;i<route.length-1;i++){const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(d<best.d)best={d,m:cum[i]+t*(cum[i+1]-cum[i])};}return best;};
 return {length:cum.at(-1),at,nearest};
}
function localToWorld(frame,[lx,lz],localYaw=0){const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);return {x:frame.x+lx*c+lz*s,z:frame.z-lx*s+lz*c,yaw:frame.yaw+localYaw};}
// 자리 하나를 월드 좌표로 푼다. height = 화면 지형 높이(노면 밖은 보이는 지형과 같은 값).
export function resolveSite(spec,{measure,height,frames={},avoid=[]}){
 const foot=PROP_FOOTPRINT[spec.kind]??{radius:.5,clear:.8,collision:.3};
 let x,z,yaw,m=null,side=spec.side??1,pathPoint=null;
 if(spec.anchor){const frame=frames[spec.anchor];if(!frame)return null;({x,z,yaw}=localToWorld(frame,spec.local??[0,0],spec.localYaw??0));}
 else{
  // lat/lon이 있으면 그 점의 코스 위 거리와 옆쪽을 쓴다(자료 s와 몇 m 다를 수 있다).
  if(Number.isFinite(spec.lat)){const p=project(spec.lat,spec.lon),hit=measure.nearest(p.x,p.z),q=measure.at(hit.m),cross=(p.x-q.x)*-q.tz+(p.z-q.z)*q.tx;m=hit.m;if(hit.d>1.5&&spec.side===undefined)side=Math.sign(cross)||1;spec={...spec,offset:Math.max(spec.offset??0,spec.snap?0:hit.d)};}
  else m=spec.s;
  pathPoint=measure.at(m);
  const place=(sd,extra=0)=>{const d=Math.max(spec.offset??0,pathPoint.width/2+(spec.clear??foot.clear)+foot.radius*.5)+extra;return {x:pathPoint.x-pathPoint.tz*d*sd,z:pathPoint.z+pathPoint.tx*d*sd};};
  // 다른 시설 받침과 겹치면 반대쪽, 그래도 겹치면 바깥으로 1.5m씩 민다.
  const clash=p=>avoid.some(a=>Math.hypot(p.x-a.x,p.z-a.z)<(a.supportRadius??a.radius??1)+foot.radius+.5);
  let p=place(side);if(clash(p)&&!clash(place(-side))){side=-side;p=place(side);}
  for(let k=1;k<=3&&clash(p);k++)p=place(side,1.5*k);
  ({x,z}=p);
  // 정면이 오르는 사람 쪽(코스 5m 아래)을 보게 한다.
  const back=measure.at(m-5);yaw=Math.atan2(back.x-x,back.z-z);
 }
 // 받침 둘레 네 점과 가운데 중 가장 낮은 지면에 맞춘다(경사 위쪽은 기둥·받침이 묻힌다).
 const r=foot.radius*.6,ys=[[0,0],[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>height(x+dx,z+dz)).filter(Number.isFinite);
 const y=ys.length?Math.min(...ys):0;
 const out={...spec,side,x,y,z,yaw,routeMetres:m,supportRadius:foot.radius,vegetationRadius:foot.vegetation??foot.radius,collisionRadius:foot.collision,slope:ys.length?Math.max(...ys)-y:0,status:spec.status??'지도·GPX 후보 위치, 현장 확인 전'};
 if(spec.kind==='trailSign'&&pathPoint){
  // 판 방향: 오르는 쪽, 내려가는 쪽, 길 바깥쪽, 길 건너쪽 순(옆길 방향은 추정).
  const away=Math.atan2(x-pathPoint.x,z-pathPoint.z),fwd=Math.atan2(pathPoint.tx,pathPoint.tz),dirs=[fwd,fwd+Math.PI,away,away+Math.PI];
  out.boards=spec.boards.map((text,i)=>({text,angle:dirs[i]-yaw}));
 }
 return out;
}
export function resolveInteractionSites(route,height,{frames={},avoid=[]}={}){
 const measure=routeMeasure(route),placed=[],sites=[];
 for(const spec of INTERACTION_SITES){if(spec.existing)continue;const site=resolveSite(spec,{measure,height,frames,avoid:[...avoid,...placed]});if(site){sites.push(site);placed.push(site);}}
 const spawns=ANIMAL_SPAWNS.map(spec=>resolveSite(spec,{measure,height,frames,avoid})).filter(Boolean);
 return {sites,spawns};
}
// 장면 묶음. 소품마다 거리 단계(PROP_LOD)를 고르고, 동물은 previewAnimals일 때만 나타나는 자리에 세운다.
// 산개발 연결: items[i].userData = 자리 자료(id·kind·좌표·collisionRadius·contentId), prototypes로 동물·돌 원형을 만든다.
export function createInteractionProps(route,height,{frames={},avoid=[],previewAnimals=false}={}){
 const root=new THREE.Group();root.name='상호작용 소품 · 위치 추정';root.userData.metricKind='상호작용 소품';
 const {sites,spawns}=resolveInteractionSites(route,height,{frames,avoid}),items=[],animals=[];
 for(const site of sites){
  const lod=createPropLod(site.kind,site);lod.position.set(site.x,site.y,site.z);lod.rotation.y=site.yaw;lod.name=`${site.id} · ${site.kind}`;
  lod.userData={...site,top:lod.userData.top};root.add(lod);items.push(lod);
 }
 const animalRoot=new THREE.Group();animalRoot.name='동물 나타나는 자리(미리보기)';animalRoot.visible=previewAnimals;root.add(animalRoot);
 for(const spawn of spawns){const lod=createPropLod(spawn.kind);lod.position.set(spawn.x,spawn.y,spawn.z);lod.rotation.y=spawn.yaw;lod.userData={...spawn};animalRoot.add(lod);animals.push(lod);}
 root.updateMatrixWorld(true);
 const all=[...items,...animals];
 return {group:root,items,animals,sites,spawns,
  // 나무·풀 비우기용 자리(동물 제외).
  // 동물 자리도 풀을 조금 비운다(다람쥐 몸높이 약 8cm라 풀에 묻힌다). 광장 위 자리는 원래 풀이 없다.
  clearSites:[...sites,...spawns].map(s=>({id:s.id,x:s.x,z:s.z,supportRadius:s.vegetationRadius})),
  prototypes:{squirrel:squirrelModel,magpie:magpieModel,looseStone},
  setAnimalPreview(on){animalRoot.visible=!!on;},
  update(camera){for(const lod of all){if(!lod.parent.visible)continue;const d=camera.position.distanceTo(lod.position);let index=0;
   for(let i=1;i<lod.levels.length;i++)if(d>=lod.levels[i].distance*(lod.levels[i].object.visible?.92:1))index=i;
   lod.levels.forEach((l,i)=>{l.object.visible=i===index;});}},
  stats(){const byKind={};for(const lod of all){const k=lod.userData.kind;if(!byKind[k])byKind[k]={count:0,levels:lodStats(lod)};byKind[k].count++;}return byKind;},
 };
}
