// 정상 자유 이동 구역(zone 'summit'). 코스 끝 40m 앞부터 정상 둘레를 W/A/S/D로 걷는다.
// 범위: 마루(길 끝 80m 안 최고점) 둘레 원 안에서 지형 경사가 걸을 만한 곳. 실제 연주대 둘레의 평지·바위 지형은 아직 확인 전이라 추정이다.
// 좌표는 route.js 로컬(x=동, z=남). 높이·시설 위치는 ground.summit(walking-ground.js)이 풍경에서 읽어 넘긴다.
import {route,sample} from './route.js';
export const SUMMIT_BODY=.25;
export const SUMMIT_ZONE_BACK=40;
export const SUMMIT_ENTER_S=route.length-SUMMIT_ZONE_BACK;
// 정상 → 코스로 돌아가는 문턱은 입구보다 1m 아래다. 입구 근처 굽은 곳 안쪽에서는 한 자리가 코스 좌표 두 곳으로 읽혀(투영 s가 수 cm 뒤로 튐)
// 코스 → 정상 → 코스 전환이 프레임마다 오가며 제자리걸음을 했다(2026-11-06). 1m 띠 안은 정상 구역으로 걷는다.
export const SUMMIT_EXIT_MARGIN=1;
export const SUMMIT_RADIUS=45;
export const SUMMIT_MAX_SLOPE=Math.tan(45*Math.PI/180); // 코스 길 밖(walking-ground MAX_WALK_SLOPE)과 같은 약 45°
export const SUMMIT_STEP=.4;
// 걷기 막는 시설(받침 반경 + 여유). helipad는 평평한 공터라 걷는다.
// 상호작용 소품(스탬프함·정상 안내판·응진전 안내판)은 소품의 걷기 막기 반경(collisionRadius)이 supportRadius로 넘어온다.
export const SUMMIT_BLOCKERS=Object.freeze({radar:.4,eungjinjeon:.4,marker:.3,fork:.3,'stamp-6':.15,'board-summit':.15,'board-eungjinjeon':.15});
export const SUMMIT_ARRIVAL_RADIUS=2.5;
const SEARCH_BACK=130;
export const SUMMIT_CENTER=(()=>{let best=sample(route.length),bs=route.length;for(let d=0;d<=80;d+=1){const p=sample(route.length-d);if(p.y>best.y){best=p;bs=route.length-d;}}return {x:best.x,z:best.z,y:best.y,s:bs};})();
export const ROUTE_END=(()=>{const p=sample(route.length);return {x:p.x,z:p.z};})();
export function insideSummit(x,z,radius=SUMMIT_BODY){return Math.hypot(x-SUMMIT_CENTER.x,z-SUMMIT_CENTER.z)<=SUMMIT_RADIUS-radius;}
// 월드 좌표를 코스(s, lateral)로 옮긴다. 법선은 movement.positionAt과 같은 규칙(sample(s±2))이다. 길 끝을 넘으면 s는 끝에 붙는다.
// from = 찾기 시작할 s(기본: 정상 앞 130m). 코스 전체에서 찾으려면 0(함께 걷기 같이 셀카 자리 옮김).
export function projectToRoute(x,z,from=route.length-SEARCH_BACK){
 const lo=Math.max(0,from);let s=route.length,best=Infinity;
 for(let t=lo;t<=route.length+1e-9;t+=1){const q=sample(Math.min(t,route.length)),d=(q.x-x)**2+(q.z-z)**2;if(d<best){best=d;s=Math.min(t,route.length);}}
 for(let i=0;i<4;i++){const q=sample(s),a=sample(s-2),b=sample(s+2),len=Math.hypot(b.x-a.x,b.z-a.z)||1;s=Math.max(lo,Math.min(route.length,s+((x-q.x)*(b.x-a.x)+(z-q.z)*(b.z-a.z))/len));}
 const q=sample(s),a=sample(s-2),b=sample(s+2),len=Math.hypot(b.x-a.x,b.z-a.z)||1;
 return {s,lateral:(x-q.x)*(-(b.z-a.z)/len)+(z-q.z)*((b.x-a.x)/len)};
}
// 시설 둘레 막힘: 안쪽으로 파고드는 이동만 막는다(이미 안쪽이면 바깥으로는 나올 수 있다).
export function facilityBlocks(sites,a,b,body=SUMMIT_BODY){
 for(const site of sites){const margin=SUMMIT_BLOCKERS[site.id];if(margin===undefined)continue;
  const r=(site.supportRadius??0)+margin+body,da=Math.hypot(a.x-site.x,a.z-site.z),db=Math.hypot(b.x-site.x,b.z-site.z);
  if(db<r&&db<da)return site.id;}
 return null;
}
// 두 점 사이를 SUMMIT_STEP 간격으로 훑어 급경사·절벽(약 45° 넘는 경사)과 바위 덩어리를 가려낸다. height(x,z)는 걷는 면 높이.
// 경사는 각 점 앞뒤 0.4m(0.8m 폭)의 높이차로 잰다. 한 프레임 이동은 짧아서 이동 구간만으로는 경사를 못 재기 때문이다.
// 계단 디딤판 한 단(실측 0.18m)은 SUMMIT_TREAD(0.2m)까지, 0.8m 폭 높이차는 0.1m까지 너그럽게 봐 준다.
export const SUMMIT_LOOK=.4,SUMMIT_TREAD=.2,SUMMIT_WINDOW_TOL=.1;
// 이미 바위 충돌 안에 서 있으면(순간 이동·청크가 늦게 붙음) 바위는 보지 않아 빠져나올 수 있게 한다. 시설 막힘과 같은 규칙이다.
export function summitStepOk(height,a,b,{rockBlocked=null}={}){
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(length/SUMMIT_STEP)),ux=length>1e-9?dx/length:0,uz=length>1e-9?dz/length:0;let prev=height(a.x,a.z);
 if(!Number.isFinite(prev))return false;
 if(rockBlocked&&rockBlocked(a.x,a.z,prev))rockBlocked=null;
 for(let i=1;i<=n;i++){
  const t=i/n,x=a.x+dx*t,z=a.z+dz*t,h=height(x,z);if(!Number.isFinite(h))return false;
  if(Math.abs(h-prev)>SUMMIT_MAX_SLOPE*(length/n)+SUMMIT_TREAD)return false;
  if(ux||uz){const ahead=height(x+ux*SUMMIT_LOOK,z+uz*SUMMIT_LOOK),behind=height(x-ux*SUMMIT_LOOK,z-uz*SUMMIT_LOOK);
   if(Number.isFinite(ahead)&&Number.isFinite(behind)&&Math.abs(ahead-behind)>SUMMIT_MAX_SLOPE*SUMMIT_LOOK*2+SUMMIT_WINDOW_TOL)return false;}
  if(rockBlocked&&rockBlocked(x,z,h))return false;prev=h;
 }
 return true;
}
// 정상 도착(처음 한 번 안내 화면): 길 끝 또는 정상석 가까이.
export function reachedSummit(x,z,sites=[]){
 if(Math.hypot(x-ROUTE_END.x,z-ROUTE_END.z)<=SUMMIT_ARRIVAL_RADIUS)return true;
 const marker=sites.find(s=>s.id==='marker');
 return !!marker&&Math.hypot(x-marker.x,z-marker.z)<=(marker.supportRadius??1.5)+SUMMIT_BLOCKERS.marker+SUMMIT_BODY+SUMMIT_ARRIVAL_RADIUS-1;
}

// 한 걸음(a→q)이 정상 구역 규칙을 지키는가. 원 안·시설 밖·45° 이하·바위 밖.
// 길(s<입구−1m)로 내려서도 길 둘레 한도(lateralLimit) 안일 때만 코스 이동으로 넘어가고, 한도 밖이면 정상 구역에 남는다.
// (예전에는 한도 밖을 막아서 정상 원 안 남서쪽·동쪽 평지에 보이지 않는 벽이 생겼다. 2026-11-06)
// 통과하면 길 좌표와 노면 정보를 돌려준다. lateralLimit(s)는 코스 이동의 옆 한도(movement.lateralLimit).
export function summitMove(G,sites,a,q,lateralLimit){
 if(!insideSummit(q.x,q.z)||facilityBlocks(sites,a,q))return null;
 const r=projectToRoute(q.x,q.z),seg=sample(r.s),ribbon=Math.abs(r.lateral)<=seg.width/2+.3,toRoute=r.s<SUMMIT_ENTER_S-SUMMIT_EXIT_MARGIN&&Math.abs(r.lateral)<=lateralLimit(r.s);
 if(!G.canStep(a,q,{rocks:!ribbon}))return null;
 return {r,seg,ribbon,toRoute};
}
// 걸을 수 있는 범위 지도: 코스 입구 지점에서 이웃 칸으로 번지며(8방향) summitMove로 가려낸다. 그림·시험용.
export function summitWalkMap(G,lateralLimit,{cell=1.5}={}){
 const sites=G.sites(),n=Math.ceil(SUMMIT_RADIUS*2/cell)+1,x0=SUMMIT_CENTER.x-SUMMIT_RADIUS,z0=SUMMIT_CENTER.z-SUMMIT_RADIUS;
 const at=(i,j)=>({x:x0+i*cell,z:z0+j*cell}),walk=new Uint8Array(n*n),height=new Float32Array(n*n),route=new Uint8Array(n*n),queue=[];
 const e=sample(SUMMIT_ENTER_S+2),si=Math.round((e.x-x0)/cell),sj=Math.round((e.z-z0)/cell);
 walk[sj*n+si]=1;queue.push([si,sj]);
 while(queue.length){
  const [i,j]=queue.pop(),a=at(i,j);
  for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const ni=i+di,nj=j+dj;if(ni<0||nj<0||ni>=n||nj>=n||walk[nj*n+ni])continue;
   if(summitMove(G,sites,a,at(ni,nj),lateralLimit)){walk[nj*n+ni]=1;queue.push([ni,nj]);}
  }
 }
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const q=at(i,j),k=j*n+i;height[k]=G.height(q.x,q.z);if(walk[k]&&projectToRoute(q.x,q.z).s<SUMMIT_ENTER_S)route[k]=1;}
 const free=walk.reduce((c,v,k)=>c+(v&&!route[k]?1:0),0);
 return {cell,n,x0,z0,walk,route,free,height,center:SUMMIT_CENTER,radius:SUMMIT_RADIUS,end:ROUTE_END,sites,enterS:SUMMIT_ENTER_S,walkable:walk.reduce((a,b)=>a+b,0)};
}
