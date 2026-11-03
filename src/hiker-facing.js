// Three.js 루트의 전방은 -Z. 입력 대신 통과한 실제 이동으로 방향을 정한다.
export function movementHeading(before,after,fallback){
 const dx=after[0]-before[0],dz=after[2]-before[2];
 return Math.hypot(dx,dz)>1e-7?Math.atan2(-dx,-dz):fallback;
}
export const headingDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
// 0.2초에 회전 차이의 98%를 따라간다. 프레임률과 무관한 최단각 보간.
export function followHeading(current,target,dt){
 if(!Number.isFinite(dt)||dt<=0)return current;
 return current+headingDelta(current,target)*(1-Math.exp(-Math.min(dt,.1)/.05));
}
