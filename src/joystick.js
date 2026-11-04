// 떠다니는 조이스틱의 방향 계산. 움직임이 부호(앞/뒤·좌/우)만 쓰므로 8방향으로 정한다.
//  - 데드존 안은 정지. 한 번 움직이기 시작하면 더 작은 값까지 유지한다(경계에서 깜박이지 않게).
//  - 직진 보정: 앞(±28°)·뒤(±28°)로 민 것은 옆걸음 없이 곧게 간다. 옆(±28°)도 같다. 사선은 17° 폭의 좁은 칸이다.
//  - 경계 근처는 지금 방향을 8° 더 오래 붙잡는다.
export const STICK=Object.freeze({radius:56,deadZone:.2,releaseZone:.14,cardinalHalfDeg:28,diagonalHalfDeg:17,holdDeg:8,margin:12});
const DIRS=Object.freeze([[0,1,0],[45,1,1],[90,0,1],[135,-1,1],[180,-1,0],[-135,-1,-1],[-90,0,-1],[-45,1,-1]].map(([deg,forward,side])=>Object.freeze({deg,forward,side,key:`${forward},${side}`})));
const wrap=d=>((d+540)%360)-180;
export const stickAngleDeg=(dx,dy)=>Math.atan2(dx,-dy)*180/Math.PI;
export function stickDirection(dx,dy,prevKey=null,o=STICK){
 const r=Math.hypot(dx,dy)/o.radius;
 if(r<(prevKey?o.releaseZone:o.deadZone))return null;
 const a=stickAngleDeg(dx,dy);
 const half=d=>(d.forward&&d.side?o.diagonalHalfDeg:o.cardinalHalfDeg);
 const prev=DIRS.find(d=>d.key===prevKey);
 if(prev&&Math.abs(wrap(a-prev.deg))<=half(prev)+o.holdDeg)return prev;
 return DIRS.find(d=>Math.abs(wrap(a-d.deg))<=half(d))||DIRS.reduce((b,d)=>Math.abs(wrap(a-d.deg))<Math.abs(wrap(a-b.deg))?d:b);
}
// 손가락이 반지름을 넘으면 기준점이 따라와서 긴 길도 한 손으로 걷는다. 반지름 안의 오프셋과 새 기준점을 돌려준다.
export function stickFollow(cx,cy,x,y,radius=STICK.radius){
 let dx=x-cx,dy=y-cy;const d=Math.hypot(dx,dy);
 if(d>radius){const k=(d-radius)/d;cx+=dx*k;cy+=dy*k;dx=x-cx;dy=y-cy;}
 return {cx,cy,dx,dy};
}
export const clampStickBase=(x,y,w,h,o=STICK)=>{const m=o.radius+o.margin;return {x:Math.min(Math.max(x,m),Math.max(m,w-m)),y:Math.min(Math.max(y,m),Math.max(m,h-m))};};
