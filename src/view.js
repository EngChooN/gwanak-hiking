// 이동 상태와 독립적인 시선. 정면 복귀는 명시적 명령으로만 시작한다.
export function createLook(){return {yaw:0,pitch:-.04,orbit:4.5,reset:null};}
export function turnLook(look,dx,dy){look.reset=null;look.yaw-=dx*.004;look.pitch=Math.max(-1.1,Math.min(.9,look.pitch-dy*.003));}
export function faceForward(look){look.yaw=Math.atan2(Math.sin(look.yaw),Math.cos(look.yaw));look.reset={yaw:look.yaw,pitch:look.pitch,elapsed:0};}
export function updateLook(look,dt,turn=0){if(turn){look.reset=null;look.yaw-=turn*dt*1.1;}if(!look.reset)return;const r=look.reset;r.elapsed=Math.min(.4,r.elapsed+dt);const u=r.elapsed/.4,t=u*u*(3-2*u);look.yaw=r.yaw*(1-t);look.pitch=r.pitch+(-.04-r.pitch)*t;if(r.elapsed>=.4){look.yaw=0;look.pitch=-.04;look.reset=null;}}
// 카메라 높이는 땅 높이에 바로 붙이지 않고 임계 감쇠 스프링으로 따라간다. 계단 한 칸(약 18cm)의 계단꼴 변화를 매끈한 곡선으로 바꾼다.
// 올라갈 때 0.15초, 내려갈 때 0.25초 기준. 순간이동(snap m 이상 차이)은 바로 붙인다.
export const CAMERA_RISE_SECONDS=.15,CAMERA_FALL_SECONDS=.25,CAMERA_SNAP_METRES=1.5;
export function createHeightFollow(){return {y:null,velocity:0};}
export function followHeight(f,target,dt,{rise=CAMERA_RISE_SECONDS,fall=CAMERA_FALL_SECONDS,snap=CAMERA_SNAP_METRES}={}){
 if(f.y===null||!Number.isFinite(f.y)||Math.abs(target-f.y)>snap){f.y=target;f.velocity=0;return f.y;}
 if(!Number.isFinite(dt)||dt<=0)return f.y;
 const omega=2/(target>f.y?rise:fall),x=omega*Math.min(dt,.1),decay=1/(1+x+.48*x*x+.235*x*x*x),change=f.y-target,temp=(f.velocity+omega*change)*Math.min(dt,.1);
 f.velocity=(f.velocity-omega*temp)*decay;f.y=target+(change+temp)*decay;
 return f.y;
}
