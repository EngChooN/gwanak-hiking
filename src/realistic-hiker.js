import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3,Group,Vector3,Quaternion,MathUtils} from 'three';
// 등산객: MPFB(MakeHuman) 몸 + 직접 만든 등산복·모자·배낭을 Blender에서 Mixamo 호환 뼈대로 묶고
// Quaternius UAL(CC0) 동작을 리타겟한 Hiker.glb. 동작(Idle·Look·Walk·Stairs·Rock)을 이동 거리에 맞춰 재생한다.
// 이동 위치는 애니메이션이 아니라 게임이 정한다. 발은 2관절 IK로 노면 높이에 붙인다.
export const ANIM_STEP=.6336; // Walk 클립에서 딛는 발의 앞뒤 이동 범위 = 한 걸음 길이(m, Blender 측정값)
export const HIKER_HEIGHT=1.7; // Hiker.glb 제작 신장(m). 모자 포함 최상단은 이보다 약 4cm 높다.
export const WALK_CONTACT_OFFSET=0; // 걷기 클립 0초가 왼발 접지가 아니면 보정(주기 단위)
const A=new Vector3(),B=new Vector3(),C=new Vector3(),T=new Vector3(),U=new Vector3(),P=new Vector3(),NB=new Vector3(),q1=new Quaternion(),q2=new Quaternion(),q3=new Quaternion();
function aim(bone,from,to){ // from→to 방향 변화를 월드 회전으로 적용
 q1.setFromUnitVectors(from,to);bone.getWorldQuaternion(q2);q2.premultiply(q1);bone.parent.getWorldQuaternion(q3);bone.quaternion.copy(q3.invert().multiply(q2));bone.updateMatrixWorld(true);
}
export async function loadRealisticHiker(url,{height=1.7}={}){
 const gltf=await new GLTFLoader().loadAsync(url),model=gltf.scene,root=new Group();
 root.add(model);model.rotation.y=Math.PI;model.updateMatrixWorld(true); // glTF는 +Z가 앞, 이 앱의 앞(heading 0)은 -Z
 const box=new Box3().setFromObject(model),k=height/HIKER_HEIGHT;model.scale.multiplyScalar(k);model.position.y=-box.min.y*k;model.updateMatrixWorld(true);
 const bone=n=>model.getObjectByName('mixamorig'+n);
 // 머리카락·눈썹·속눈썹은 알파 컷아웃(투명 정렬 문제 방지), 나머지는 그림자 수신·발신
 model.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;o.frustumCulled=false;const m=o.material;
  if(m.transparent){m.transparent=false;m.alphaTest=.4;m.depthWrite=true;m.needsUpdate=true;}
  m.envMapIntensity=.7;});
 const pack=new Group(); // 배낭은 모델에 포함됨(호환용 빈 그룹)
 const mixer=new AnimationMixer(model),clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c])),actions={Idle:mixer.clipAction(clips.Look),Walk:mixer.clipAction(clips.Walk),Climb:mixer.clipAction(clips.Stairs),Scramble:mixer.clipAction(clips.Rock)};
 const bind=new Box3().setFromObject(model,true),legs0=['Left','Right'].map(n=>[bone(n+'Foot'),bone(n+'ToeBase')]);
 const ankle=Math.min(...legs0.map(([f])=>f.getWorldPosition(P).y-bind.min.y)),toeH=Math.min(...legs0.map(([,t])=>t.getWorldPosition(P).y-bind.min.y));
 const legs=['Left','Right'].map(side=>({side,up:bone(side+'UpLeg'),knee:bone(side+'Leg'),foot:bone(side+'Foot'),toe:bone(side+'ToeBase')}));
 // 신발 메시 바닥 꼭짓점(스키닝 반영). 발목 높이 추정 대신 실제 꼭짓점으로 접지한다.
 let boots;model.traverse(o=>{if(o.isSkinnedMesh&&/boots/i.test(o.name))boots=o;});
 const soleAll=[[],[]],soleSmp=[[],[]],V0=new Vector3();
 if(boots){model.updateMatrixWorld(true);boots.skeleton.update();const lp=legs.map(l=>l.foot.getWorldPosition(new Vector3())),n=boots.geometry.attributes.position.count,pts=[];let minY=Infinity;
  for(let i=0;i<n;i++){boots.getVertexPosition(i,V0).applyMatrix4(boots.matrixWorld);pts.push(V0.clone());minY=Math.min(minY,V0.y);}
  const fwd=legs.map((l,k)=>{const t=l.toe.getWorldPosition(new Vector3());return {t,d:new Vector3(t.x-lp[k].x,0,t.z-lp[k].z).normalize()};});
  pts.forEach((v,i)=>{if(v.y>minY+.035)return;const k=Math.abs(v.x-lp[0].x)+Math.abs(v.z-lp[0].z)<Math.abs(v.x-lp[1].x)+Math.abs(v.z-lp[1].z)?0:1;soleAll[k].push({i,front:(v.x-fwd[k].t.x)*fwd[k].d.x+(v.z-fwd[k].t.z)*fwd[k].d.z>-.02});});
  for(const k of [0,1]){const L=soleAll[k];if(!L.length)continue;const chosen=[L[0]];while(chosen.length<Math.min(56,L.length)){let best=null,bd=-1;for(const c of L){let md=Infinity;for(const q of chosen)md=Math.min(md,pts[c.i].distanceToSquared(pts[q.i]));if(md>bd){bd=md;best=c;}}chosen.push(best);}soleSmp[k]=chosen;}}
 const VV=new Vector3();
 const soleMin=(k,list,groundAt)=>{ // 바닥 표본점 중 가장 낮은 높이(앞/뒤 따로), 지면 대비 관통량
  let lo=Infinity,loF=Infinity,loB=Infinity,pen=-Infinity;for(const c of list){boots.getVertexPosition(c.i,VV).applyMatrix4(boots.matrixWorld);lo=Math.min(lo,VV.y);if(c.front)loF=Math.min(loF,VV.y);else loB=Math.min(loB,VV.y);if(groundAt){const g=groundAt(VV.x,VV.z)-VV.y;if(g>pen)pen=g;}}
  return {lo,loF,loB,pen};};
 let current;const modelY=model.position.y;
 // 걷기 클립 전체에서 발목이 가장 낮은 높이(딛는 중) — 이보다 올라간 만큼이 발 들기
 // 발바닥 최저점(뒤꿈치·발끝 중 낮은 쪽) 높이. 딛는 동안(발끝이 땅에 닿은 채 뒤꿈치가 들려도) 이 값은 일정하다.
 const soleOf=(l)=>{if(boots){boots.skeleton.update();return soleMin(l.side==='Left'?0:1,soleSmp[l.side==='Left'?0:1]).lo;}return Math.min(l.foot.getWorldPosition(P).y-ankle,l.toe.getWorldPosition(NB).y-toeH);};
 let plantRel=Infinity;{const lv=[];const wa=actions.Walk,d=wa.getClip().duration;root.updateMatrixWorld(true);for(let i=0;i<48;i++){wa.play();wa.time=i/48*d;mixer.update(0);model.updateMatrixWorld(true);for(const l of legs)lv.push(soleOf(l)-root.position.y);}wa.stop();lv.sort((a,b)=>a-b);plantRel=lv[Math.floor(lv.length*.22)];}
 const api={step:.7,
  // 경로 꺾임에서 몸이 순간 회전해 발이 끌리지 않도록 방향을 부드럽게 따라가게 한다(최대 2.5rad/s).
  turnTo(heading,dt){const d=MathUtils.euclideanModulo(heading-root.rotation.y+Math.PI,Math.PI*2)-Math.PI;if(Math.abs(d)<1e-3){root.rotation.y=heading;return;}root.rotation.y+=MathUtils.clamp(d*(1-Math.exp(-dt*10)),-2.5*dt,2.5*dt);},
  snapTo(heading){root.rotation.y=heading;},
ankle,toeH,scene:root,animations:gltf.animations,actions,model,mixer,legs,pack,
  update({clip='Idle',distance=0,stride=.7,stepLength=.7,idleSeconds=0,slope=0}){api.step=stepLength;
   const walkClip=clip!=='Idle',name=!walkClip?'Idle':clip==='Climb'?(slope>.45?'Scramble':'Climb'):'Walk';
   if(current!==name){Object.values(actions).forEach(a=>a.stop());actions[name].play();current=name;}
   const a=actions[name],d=a.getClip().duration;
   // 서 있을 때는 둘러보기(Look) 클립을 시간으로, 걸을 때는 걸음 수(위상)로 재생
   a.time=walkClip?((((distance/(2*stride))+WALK_CONTACT_OFFSET)%1)+1)%1*d:(idleSeconds%d);
   mixer.update(0);api.pose={clip,walkClip,name};
   model.updateMatrixWorld(true);
  },
  ground({s,lateral,moving,phase,floorHeight,sample,surfaceHeight,measure=false}){
   const climb=api.pose?.name==='Climb'||api.pose?.name==='Scramble',f=moving?api.step/ANIM_STEP:1;
   root.updateMatrixWorld(true);const baseY=root.position.y,inv=root.matrixWorld.clone().invert(),contacts=[];
   model.position.y=modelY;model.updateMatrixWorld(true);
   // 1) 애니메이션 발 위치(루트 기준). 앞뒤 거리만 실제 걸음 길이 비율(f)로 줄이면 딛는 발이 노면에 고정된다.
   const scl=p=>{const loc=p.clone().applyMatrix4(inv);return new Vector3(loc.x,0,loc.z*f).applyMatrix4(root.matrixWorld);};
   const fx=-Math.sin(root.rotation.y),fz=-Math.cos(root.rotation.y),groundAt=(x,z)=>Math.max(...(api.pose?.name==='Scramble'?[0]:[0,.1]).map(o=>surfaceHeight(x+fx*o,z+fz*o)));
   const info=legs.map((l,k)=>{const w=l.foot.getWorldPosition(new Vector3()),tW=l.toe.getWorldPosition(new Vector3()),tw=scl(w),tt=scl(tW);if(boots)boots.skeleton.update();const sm=boots?soleMin(k,soleSmp[k]):null,hs=sm?sm.loB:w.y-ankle,ts=sm?sm.loF:tW.y-toeH,sY=Math.min(hs,ts);return {l,rel:sY-baseY,heel:hs-baseY,above:w.y-sY,tw,tt,off:{x:tt.x-tw.x,z:tt.z-tw.z},ground:groundAt(tw.x,tw.z)};});
   const base=moving?plantRel:Math.min(...info.map(o=>o.rel)),lift=i=>Math.max(0,i.rel-base)*(climb?1.5:1);
   // 딛는 발의 고정점: 뒤꿈치가 닿아 있으면 발목(뒤꿈치), 뒤꿈치가 들리면 발끝(앞꿈치 굴림)
   for(const i of info){i.sw=lift(i);i.planted=i.rel-base<.008;i.pivot=(i.heel-base<.012)?'ankle':'toe';const {l}=i;
    // 닿은 자리에서 발이 10cm 넘게 벗어나면(발끝 떼기 직전·급회전) 끌지 않고 발을 1.2cm 들어 올려 딛기를 끝낸다. 남은 어긋남은 몇 프레임에 걸쳐 풀린다.
    if(l.lock&&i.rel-base>=.012)l.lock=false;
    if(i.planted&&l.wasPlanted&&l.anchor&&!l.lock){const pp=i.pivot==='toe'?i.tt:i.tw,k=l.pivot!==i.pivot?(i.pivot==='toe'?1:-1):0,ex=l.anchor.x+k*i.off.x,ez=l.anchor.z+k*i.off.z;
     if(Math.hypot(pp.x-ex,pp.z-ez)>.10){l.lock=true;l.rel=(l.rel??new Vector3()).set(ex-pp.x,0,ez-pp.z);}}
    if(l.lock&&i.planted){i.planted=false;i.sw=Math.max(i.sw,.012);}
    if(l.rel&&!i.planted){i.rx=l.rel.x;i.rz=l.rel.z;l.rel.multiplyScalar(.5);if(l.rel.lengthSq()<2.5e-5)l.rel.set(0,0,0);}else{i.rx=0;i.rz=0;}}
   // 2) 골반: 양 발 아래 노면 평균 높이만큼 이동
   const dh=MathUtils.clamp(info.reduce((a,i)=>a+(i.ground-baseY),0)/2,-.35,.45);model.position.y=modelY+dh;model.updateMatrixWorld(true);
   // 앵커를 반영한 발목 목표(x,z)
   const target=(i)=>{const {l}=i,st=l.anchor,pp=i.pivot==='toe'?i.tt:i.tw;
    if(i.planted&&l.wasPlanted&&st&&Math.hypot(st.x-pp.x,st.z-pp.z)<1){let sx=st.x,sz=st.z;if(l.pivot!==i.pivot){const k=i.pivot==='toe'?1:-1;sx+=k*i.off.x;sz+=k*i.off.z;}
     return {x:sx-(i.pivot==='toe'?i.off.x:0),z:sz-(i.pivot==='toe'?i.off.z:0),px:sx,pz:sz};}
    return {x:i.tw.x+i.rx,z:i.tw.z+i.rz,px:pp.x,pz:pp.z};};
   // 딛는 발 목표(앵커 포함)가 다리 길이를 넘으면 그만큼 골반을 낮춰 발이 뜨지 않게 한다.
   for(const pass of [0,1]){let deficit=0;for(const i of info){const {l}=i,tg=target(i);
     A.setFromMatrixPosition(l.up.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);C.setFromMatrixPosition(l.foot.matrixWorld);
     deficit=Math.max(deficit,Math.hypot(tg.x-A.x,i.ground+i.above+i.sw-A.y,tg.z-A.z)-(A.distanceTo(B)+B.distanceTo(C)-.01));}
    if(deficit>0){model.position.y-=Math.min(deficit,.3);model.updateMatrixWorld(true);}}
   const solve=(l,Tt,footQ)=>{
    A.setFromMatrixPosition(l.up.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);C.setFromMatrixPosition(l.foot.matrixWorld);
    const l1=A.distanceTo(B),l2=B.distanceTo(C);
    U.subVectors(Tt,A);const d=MathUtils.clamp(U.length(),Math.abs(l1-l2)+.02,l1+l2-.002);U.normalize();
    const ak=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-ak*ak));
    P.subVectors(B,A);P.addScaledVector(U,-P.dot(U));if(P.lengthSq()<1e-8)P.set(0,0,-1);P.normalize();
    NB.copy(A).addScaledVector(U,ak).addScaledVector(P,h);
    aim(l.up,B.clone().sub(A).normalize(),NB.clone().sub(A).normalize());
    C.setFromMatrixPosition(l.foot.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);
    const Tc=A.clone().addScaledVector(U,d);aim(l.knee,C.clone().sub(B).normalize(),Tc.clone().sub(B).normalize());
    l.foot.parent.getWorldQuaternion(q3);l.foot.quaternion.copy(q3.invert().multiply(footQ));l.foot.updateMatrixWorld(true);
   };
   for(const i of info){const {l}=i,swing=i.sw,planted=i.planted;
    // 딛는 동안은 닿은 자리(앵커)에 고정. 경로 꺾임·회전으로 목표가 12cm 넘게 벗어날 때만 끌려간다.
    const dbg={};const st=l.anchor??=new Vector3(),pp=i.pivot==='toe'?i.tt:i.tw;let tx=i.tw.x+i.rx,tz=i.tw.z+i.rz;const anch=planted&&l.wasPlanted&&Math.hypot(st.x-pp.x,st.z-pp.z)<1;
    if(anch){
     if(l.pivot!==i.pivot){const k=i.pivot==='toe'?1:-1;st.x+=k*i.off.x;st.z+=k*i.off.z;}
     const dx=pp.x-st.x,dz=pp.z-st.z,dist=Math.hypot(dx,dz);dbg.drift=dist;if(dist>.12){dbg.clamp=1;st.x+=dx*(1-.12/dist);st.z+=dz*(1-.12/dist);}
     tx=st.x-(i.pivot==='toe'?i.off.x:0);tz=st.z-(i.pivot==='toe'?i.off.z:0);i.ground=groundAt(tx,tz);}
    else if(planted)st.set(pp.x,0,pp.z);
    l.wasPlanted=planted;l.pivot=i.pivot;
    const footQ=l.foot.getWorldQuaternion(new Quaternion());
    T.set(tx,i.ground+i.above+swing,tz);solve(l,T,footQ);
    // 실제 신발 바닥 꼭짓점 기준으로 노면 관통·뜸을 바로잡는다(2회 보정).
    let sm=null;if(boots){const k=l.side==='Left'?0:1,lst=api.pose?.name==='Scramble'?soleAll[k]:soleSmp[k];boots.skeleton.update();sm=soleMin(k,lst,surfaceHeight);
     for(let it=0;it<4&&isFinite(sm.pen);it++){const dy=swing<.03?sm.pen:Math.max(0,sm.pen);if(Math.abs(dy)<.001)break;T.y+=dy;solve(l,T,footQ);boots.skeleton.update();sm=soleMin(k,lst,surfaceHeight);}}
    const fw=l.foot.getWorldPosition(new Vector3()),tw=l.toe.getWorldPosition(new Vector3());
    dbg.miss=Math.hypot(fw.x-tx,fw.z-tz);dbg.pivChg=i.pivot!==l.pivotPrev?1:0;l.pivotPrev=i.pivot;dbg.ty=T.y-(i.ground+i.above+swing);
    const sole=sm?sm.lo:Math.min(fw.y-ankle,tw.y-toeH),support=sm&&isFinite(sm.pen)?sm.lo+sm.pen:Math.max(...[-.1,0,.12,.2].map(o=>surfaceHeight(fw.x+Math.sin(root.rotation.y)*-o,fw.z+Math.cos(root.rotation.y)*-o)));
    contacts.push({dbg,side:l.side==='Left'?'왼발':'오른발',support,bottom:sole,lift:swing,planted:swing<.02,error:swing<.012?Math.abs(sole-support):Math.max(0,support-sole),foot:[fw.x,fw.z],toe:[tw.x,tw.z],heelOn:i.heel-base<.012,toeOn:true,anchored:planted,truePen:measure&&boots?Math.max(0,soleMin(l.side==='Left'?0:1,soleAll[l.side==='Left'?0:1],surfaceHeight).pen):undefined,trueFloat:measure&&boots?-soleMin(l.side==='Left'?0:1,soleAll[l.side==='Left'?0:1],surfaceHeight).pen:undefined,penetration:Math.max(0,support-sole)});
   }
   return contacts;
  }};
 return api;
}
