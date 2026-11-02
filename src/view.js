// 이동 상태와 독립적인 시선. 정면 복귀는 명시적 명령으로만 시작한다.
export function createLook(){return {yaw:0,pitch:-.04,orbit:4.5,reset:null};}
export function turnLook(look,dx,dy){look.reset=null;look.yaw-=dx*.004;look.pitch=Math.max(-1.1,Math.min(.9,look.pitch-dy*.003));}
export function faceForward(look){look.yaw=Math.atan2(Math.sin(look.yaw),Math.cos(look.yaw));look.reset={yaw:look.yaw,pitch:look.pitch,elapsed:0};}
export function updateLook(look,dt,turn=0){if(turn){look.reset=null;look.yaw-=turn*dt*1.1;}if(!look.reset)return;const r=look.reset;r.elapsed=Math.min(.4,r.elapsed+dt);const u=r.elapsed/.4,t=u*u*(3-2*u);look.yaw=r.yaw*(1-t);look.pitch=r.pitch+(-.04-r.pitch)*t;if(r.elapsed>=.4){look.yaw=0;look.pitch=-.04;look.reset=null;}}
