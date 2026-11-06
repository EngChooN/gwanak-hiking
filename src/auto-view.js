// 자동 걷기 시점. 카메라·몸이 GPX 선분 방향(꼭짓점마다 꺾여 튐)에 바로 붙지 않고,
// 몇 m 앞까지의 길 방향(평활)을 미리 보고 임계 감쇠 스프링 + 최대 회전 속도로 따라 돈다.
// 사용자가 마우스·키로 돌린 만큼(offset)은 그대로 두고, 손을 뗀 뒤 holdSeconds가 지나면 천천히 길 쪽으로 돌아온다.
// 모든 각은 three.js 회전(전방 -Z, heading=atan2(-dx,-dz))이고, look.yaw는 main.js의 baseHeading() 기준 상대각이다.
export const AUTO_VIEW=Object.freeze({
 ahead:5,behind:1.5,     // 길 방향 평활 창(m): s-behind ~ s+ahead의 현(chord) 방향 = 창 안 접선의 평균
 minChord:.5,            // 창이 너무 짧게 접히면(급한 갈지자) 현재 선분 방향을 쓴다
 smoothTime:.45,         // 스프링이 목표 방향을 따라가는 시간(초)
 maxRate:Math.PI/3,      // 길 따라 도는 최대 속도 60°/s (60fps에서 프레임당 1°)
 holdSeconds:1.5,        // 사용자가 돌린 시점을 그대로 두는 시간
 returnSeconds:1.2,      // 그 뒤 길 방향으로 돌아오는 시간 상수
 returnRate:Math.PI/6,   // 돌아오는 최대 속도 30°/s
 recenterSeconds:.1,     // 정면 보기(faceForward) 명령일 때 빠른 복귀 시간 상수
});
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// s 위치의 평활 길 방향. sampleFn(s)는 {x,z,heading}을 돌려준다(route.js sample).
export function pathHeading(s,sampleFn,{ahead=AUTO_VIEW.ahead,behind=AUTO_VIEW.behind,minChord=AUTO_VIEW.minChord}={}){
 const a=sampleFn(s-behind),b=sampleFn(s+ahead),dx=b.x-a.x,dz=b.z-a.z;
 return Math.hypot(dx,dz)>=minChord?Math.atan2(-dx,-dz):sampleFn(s).heading;
}

export function createAutoView(){return {active:false,heading:0,velocity:0,offset:0,written:0,idle:0,recenter:false};}

// 자동 걷기를 켠 순간: 지금 보이는 화면을 그대로 두고 시작한다(길 기준 heading=base, 사용자 각=offset).
export function startAutoView(v,base,yaw){Object.assign(v,{active:true,heading:wrapAngle(base),velocity:0,offset:wrapAngle(yaw),written:yaw,idle:0,recenter:false});}
export function stopAutoView(v){v.active=false;v.velocity=0;}

// updateLook 직후(이동 전, baseHeading이 지난 프레임과 같을 때) 부른다. 지난 프레임에 쓴 yaw와의 차이 = 사용자가 돌린 양.
// resetting(정면 보기 애니메이션 중)이면 그 애니메이션의 yaw는 버리고 offset을 빠르게 0으로 보낸다.
export function absorbUserYaw(v,look,resetting=false){
 if(!v.active)return;
 if(resetting){look.yaw=v.written;v.recenter=true;return;}
 const d=wrapAngle(look.yaw-v.written);
 if(Math.abs(d)>1e-9){v.offset=wrapAngle(v.offset+d);v.idle=0;v.recenter=false;}
}

// 이동 뒤 한 프레임. target: 이번 프레임 목표 길 방향(절대), base: baseHeading()(절대). 새 look.yaw를 돌려준다.
export function stepAutoView(v,{target,base,dt},o=AUTO_VIEW){
 if(!(dt>0)||!Number.isFinite(dt))return v.written;
 dt=Math.min(dt,.1);
 // 임계 감쇠 스프링(SmoothDamp 근사). 각은 목표 기준 최단각으로 다룬다.
 const omega=2/o.smoothTime,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x),change=wrapAngle(v.heading-target),temp=(v.velocity+omega*change)*dt;
 let velocity=(v.velocity-omega*temp)*decay,step=wrapAngle(target+(change+temp)*decay-v.heading);
 const maxStep=o.maxRate*dt;
 if(Math.abs(step)>maxStep){step=Math.sign(step)*maxStep;velocity=clamp(velocity,-o.maxRate,o.maxRate);}
 v.heading=wrapAngle(v.heading+step);v.velocity=velocity;
 // 사용자 각 복귀
 if(v.recenter){v.offset*=Math.exp(-dt/o.recenterSeconds);if(Math.abs(v.offset)<1e-3){v.offset=0;v.recenter=false;}}
 else{v.idle+=dt;if(v.idle>o.holdSeconds&&v.offset){const want=v.offset*(1-Math.exp(-dt/o.returnSeconds)),back=Math.sign(want)*Math.min(Math.abs(want),o.returnRate*dt);v.offset-=back;if(Math.abs(v.offset)<1e-4)v.offset=0;}}
 v.written=wrapAngle(v.heading+v.offset-base);
 return v.written;
}
// 몸(동동이)이 향할 방향: 사용자 각을 뺀 평활 길 방향.
export const autoBodyHeading=v=>v.heading;
