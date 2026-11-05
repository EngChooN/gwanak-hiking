import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Vector3,AnimationMixer,Quaternion,Raycaster} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildToonHikerGltf,DONGDONG,GAIT_SHAPE,TOON_ARM,TOON_STRIDE,TOON_RUN_SPEED} from '../src/toon/link-hiker.js';
import {createRealisticHiker,DEFAULT_HIKER_PROFILE} from '../src/realistic-hiker.js';
import {linkArmPose,LINK_ARM} from '../src/hiker-arms.js';
import {STANDING_EYE_HEIGHT,SEATED_EYE_HEIGHT,POLE_STEP,poleStep} from '../src/hiker-interactions.js';
import {strideScaleFor,runMultiplierFor,RUN_MULTIPLIER,initialState,advance,onStairs} from '../src/movement.js';
import {WALK_CADENCE,WALK_STRIDE,STAIR_STRIDE,STAIR_WALK_CADENCE,route,isStairs} from '../src/route.js';
import {TOON_BINOCULARS_SIZE} from '../src/hiker-gadgets.js';
import {FootstepAudio,toonStepGate,TOON_FOOTSTEP} from '../src/footstep-audio.js';

async function parse(path){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL(path,import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');}finally{console.warn=warn;}
}
let cached;const toonGltf=async()=>cached??=buildToonHikerGltf(await parse('../assets/toon/models/hiker/Hiker.glb'));
// 새 몸(같은 glTF를 두 등산객이 나눠 쓰지 않게)
const freshToon=async()=>buildToonHikerGltf(await parse('../assets/toon/models/hiker/Hiker.glb'));
const flat=()=>0;
const W=(scene,n)=>scene.getObjectByName('mixamorig'+n).getWorldPosition(new Vector3());

test('카툰 캐릭터 체형: 동동이 키 1.0m·2.1등신·목 없음, 큰 눈은 얼굴 높이 42% 자리(시안 ① mascot-concepts.js dongdong)',async()=>{
 const g=await toonGltf();g.scene.updateMatrixWorld(true);
 const box=new Box3().setFromObject(g.scene),H=box.max.y-box.min.y;
 assert.ok(H>.98&&H<1.07,`키(벙거지 포함) ${H}`);
 assert.ok(Math.abs(box.min.y)<1e-6,'발바닥이 0');
 // 얼굴·머리카락·벙거지는 그림자를 받지 않는 'ToonHiker_Head' 메시에 있다.
 const head=g.scene.getObjectByName('ToonHiker_Head'),p=head.geometry.attributes.position;
 assert.equal(head.userData.noReceiveShadow,true,'얼굴은 그림자를 받지 않는다');
 // 턱 = 머리 꼭짓점 중 가장 낮은 점, 머리 반지름 = 머리 타원체 가로 반폭(귀·모자 빼고 턱 높이 근처는 머리만 있다)
 let chin=Infinity;for(let i=0;i<p.count;i++)chin=Math.min(chin,p.getY(i));
 const ratio=DONGDONG.height/(DONGDONG.height-chin);
 assert.ok(ratio>1.95&&ratio<2.2,`머리 대 키 1:${ratio.toFixed(2)}`);
 assert.ok(Math.abs(DONGDONG.headRadius[0]-.25)<1e-9);
 // 목 없음: 머리 아래 끝이 목 뼈 바로 위(2cm 안), 목도리가 그 사이를 덮는다.
 const neck=W(g.scene,'Neck').y;assert.ok(chin-neck>-.01&&chin-neck<.03,`턱 ${chin.toFixed(3)} 목 ${neck.toFixed(3)}`);
 // 큰 눈: 눈 가운데 높이가 얼굴(턱~머리 꼭대기) 높이의 42% 자리
 const prof=g.scene.userData.hikerProfile,eyeY=prof.eyeHeight.stand,top=DONGDONG.headCenter+DONGDONG.headRadius[1];
 assert.ok(Math.abs((eyeY-chin)/(top-chin)-DONGDONG.eyeAt)<.02,`눈 자리 ${((eyeY-chin)/(top-chin)).toFixed(3)}`);
 // 짧은 다리·어깨: 엉덩이 관절 0.2m, 어깨 관절 0.45m(시안)
 assert.ok(Math.abs(W(g.scene,'LeftUpLeg').y-DONGDONG.hip)<.01);assert.ok(Math.abs(W(g.scene,'LeftArm').y-DONGDONG.shoulder)<.015);
 // 얼굴 부품(눈·하이라이트·볼·입)은 외곽선 두께 0
 const line=head.geometry.attributes.outline;let zero=0;for(let i=0;i<line.count;i++)if(line.getX(i)===0)zero++;assert.ok(zero>200,`외곽선 없는 얼굴 꼭짓점 ${zero}`);
});

test('카툰 캐릭터 동작: 서기·걷기·뛰기·계단·바위 클립이 있고, 걷기는 한 걸음에 한 번 통통 튄다',async()=>{
 const g=await toonGltf(),names=g.animations.map(c=>c.name);
 for(const n of ['Look','Walk','Run','Stairs','Rock'])assert.ok(names.includes(n),n);
 const mixer=new AnimationMixer(g.scene);
 const at=(name,u)=>{const c=g.animations.find(a=>a.name===name),a=mixer.clipAction(c);a.play();a.time=u*c.duration;mixer.update(0);g.scene.updateMatrixWorld(true);const h=W(g.scene,'Hips'),n=W(g.scene,'Neck');a.stop();return {lean:Math.atan2(n.z-h.z,n.y-h.y)*180/Math.PI,y:h.y};};
 const w=at('Walk',.25).lean,r=at('Run',.25).lean;
 assert.ok(w>2&&w<9,`걷기 상체 ${w}`);assert.ok(r>8&&r<20&&r>w+4,`뛰기 상체 ${r}`);
 assert.ok(at('Rock',.25).lean>at('Stairs',.25).lean,'바위는 계단보다 더 숙인다');
 assert.ok(Math.abs(at('Look',.25).lean)<3,'서기는 곧다');
 // 골반 높이: 한 주기(두 걸음)에 두 번 오르내리고, 출렁임이 1.5cm 넘는다(키 1m에 크게).
 const ys=Array.from({length:32},(_,i)=>at('Walk',i/32).y),amp=Math.max(...ys)-Math.min(...ys);
 let peaks=0;for(let i=0;i<32;i++)if(ys[i]>ys[(i+31)%32]&&ys[i]>=ys[(i+1)%32])peaks++;
 assert.ok(amp>.015,`출렁임 ${amp.toFixed(3)}`);assert.equal(peaks,2,'걸음마다 한 번');
});

test('카툰 보폭: 이동 속도는 그대로, 짧은 다리에 맞춰 걸음 수가 늘어난다',()=>{
 const speed=WALK_STRIDE.flat*WALK_CADENCE.flat,stride=WALK_STRIDE.flat*TOON_STRIDE.walk,cadence=speed/stride;
 assert.ok(Math.abs(stride-GAIT_SHAPE.walk.step)<1e-9,`걷기 보폭 ${stride}`);
 assert.ok(cadence>5.5&&cadence<7,`걷기 걸음/초 ${cadence}`);
 // 보폭은 다리 길이(엉덩이 관절 0.2m)에 맞는다: 걷기 1.1배, 뛰기 2.1배 안팎
 assert.ok(stride/DONGDONG.hip<1.3&&WALK_STRIDE.flat*TOON_STRIDE.run/DONGDONG.hip<2.3);
 assert.ok(TOON_STRIDE.run>TOON_STRIDE.walk*1.5);
 // 카툰 뛰기(대표 결정): 걷기의 2.5배 속도. 실사는 1.6배 그대로.
 assert.equal(runMultiplierFor(undefined),RUN_MULTIPLIER);assert.equal(RUN_MULTIPLIER,1.6);assert.equal(runMultiplierFor(TOON_RUN_SPEED),2.5);
 const runStride=WALK_STRIDE.flat*TOON_STRIDE.run;assert.ok(Math.abs(runStride-GAIT_SHAPE.run.step)<1e-9);
 const sprint=mult=>{const s=initialState({start:'demo'});for(let i=0;i<60;i++)advance(s,{forward:1,run:true,runMultiplier:mult},1/30);return s.distance;};
 assert.ok(Math.abs(sprint(TOON_RUN_SPEED)/sprint(undefined)-2.5/1.6)<.02,'카툰 뛰기만 빨라진다');
 assert.equal(strideScaleFor(null,true),1);assert.equal(strideScaleFor(TOON_STRIDE,false),TOON_STRIDE.walk);assert.equal(strideScaleFor(TOON_STRIDE,true),TOON_STRIDE.run);
 // 같은 시간 걸으면 이동 거리는 같고 걸음 수만 보폭 배율만큼 늘어난다.
 // 흙길에서 같은 시간 걸으면 이동 거리는 같고 걸음 수만 보폭 배율만큼 늘어난다. 계단에서는 보폭 배율 1(한 칸에 한 걸음)이라 걸음 수가 같다.
 const at=pick=>route.segments.find(pick).start+1;
 const run=(scale,s0)=>{const s={...initialState({start:'demo'}),s:s0};for(let i=0;i<120;i++)advance(s,{forward:1,strideScale:scale},1/30);return {d:s.distance,steps:s.steps+s.stepPhase};};
 const soil=at(g=>g.material==='soil'&&g.length>15),stairs=at(g=>isStairs(g.material)&&g.length>15);
 const a=run(undefined,soil),b=run(TOON_STRIDE,soil);
 assert.ok(Math.abs(a.d-b.d)<1e-9,'이동 거리 동일');
 assert.ok(Math.abs(b.steps/a.steps-1/TOON_STRIDE.walk)<.03,`걸음 수 비 ${b.steps/a.steps}`);
 const c=run(undefined,stairs),e=run(TOON_STRIDE,stairs);assert.ok(Math.abs(e.steps/c.steps-1)<1e-6,`계단 걸음 수 비 ${e.steps/c.steps}`);
 assert.equal(strideScaleFor(TOON_STRIDE,false,true),1);assert.equal(strideScaleFor(TOON_STRIDE,true,true),1);assert.equal(strideScaleFor(null,false,true),1);
 assert.equal(onStairs({seg:{material:'stairs'}}),true);assert.equal(onStairs({seg:{material:'deck_stairs'}}),true);assert.equal(onStairs({seg:{material:'stairs'},off:true}),false);assert.equal(onStairs({plaza:true,seg:{material:'stairs'}}),false);assert.equal(onStairs({seg:{material:'rock'}}),false);
});

test('카툰 팔 흔들기: 짧은 팔을 배 밖으로 벌리고 걸을 때 크게 앞뒤로 흔든다(기본 링크 설정은 그대로)',()=>{
 const sh=new Vector3(.14,.44,0),deg=r=>r*180/Math.PI,cfg=TOON_ARM;
 const walk=[0,.5,1,1.5].map(phase=>linkArmPose(sh,'Right',{phase,move:1,run:0,cfg})),stand=linkArmPose(sh,'Right',{cfg});
 const ws=walk.map(p=>deg(p.swing));assert.ok(Math.max(...ws)>=30&&Math.min(...ws)<=-20,`걷기 ${ws}`);
 // 손목은 팔 길이(위팔+아래팔) 안, 서 있을 때 손목은 어깨보다 바깥(배를 뚫지 않게)
 for(const p of [...walk,stand])assert.ok(p.wrist.distanceTo(sh)<=cfg.upper+cfg.fore+1e-9);
 assert.ok(stand.wrist.x>sh.x+.03,`서기 손목 x ${stand.wrist.x}`);
 // 서기: 팔꿈치를 굽혀 장갑 가운데(손목에서 손가락 쪽 3cm)를 시안 자리(어깨 아래 0.19m·바깥 0.07m)에 둔다.
 const mit=stand.wrist.clone().addScaledVector(stand.handAxis,.03);assert.ok(Math.abs(mit.y-(sh.y-.19))<.012&&mit.x-sh.x>.06,`서기 장갑 ${mit.toArray()}`);
 assert.ok(linkArmPose(sh,'Right',{phase:0,move:1,cfg}).swing>0&&linkArmPose(sh,'Left',{phase:0,move:1,cfg}).swing<0);
 // 다른 몸(기본값)은 그대로
 assert.equal(LINK_ARM.upper,.26);assert.deepEqual(linkArmPose(sh,'Right',{phase:.3,move:1}),linkArmPose(sh,'Right',{phase:.3,move:1,cfg:LINK_ARM}));
});

test('카툰 캐릭터 상호작용: 걷기·뛰기 접지, 뛰기→걷기 전환, 앉기·차·쌍안경·휴대폰 셀카가 그대로 동작한다',async()=>{
 const h=createRealisticHiker(await toonGltf());
 assert.equal(h.profile.kind,'toon');const st=h.profile.animSteps;assert.deepEqual(h.strideScale,{...TOON_STRIDE});
 let boots=0;h.model.traverse(o=>{if(o.isSkinnedMesh&&/boots/i.test(o.name))boots++;});assert.equal(boots,1,'접지에 쓰는 장화 메시는 하나(외곽선 껍질은 이름이 다름)');
 // 걷기↔뛰기: 섞는 동안 두 클립의 디딤 구간을 같은 위상에 맞추고 걸음 길이도 같은 빠르기로 옮겨, 섞는 전 구간에서 디딘 발이 6mm 안에 붙는다.
 let ph=0;for(const running of [false,true]){let err=0;
  for(let i=0;i<90;i++){const step=running?st.run:st.walk,dph=(running?8.2:6.2)/30;ph+=dph;h.scene.position.z-=dph*step;h.scene.updateMatrixWorld(true);
   h.update({clip:'Walk',distance:ph,stride:1,stepLength:step,running,dt:1/30,speed:1.4});
   for(const c of h.ground({moving:true,phase:ph,surfaceHeight:flat}))if(c.planted){assert.ok(Number.isFinite(c.bottom));err=Math.max(err,c.error);}}
  assert.ok(err<.006,`${running?'걷기→뛰기':'걷기'} 디딘 발 오차(섞는 동안 포함) ${err}`);
  assert.ok(Math.abs(h.gait.run-(running?1:0))<.01);
  for(const a of h.interaction.arms)assert.ok(a.targetError<.03,`팔 IK ${a.targetError}`);
 }
 h.scene.position.set(0,0,0);h.scene.updateMatrixWorld(true);
 // 스테미나가 바닥나 running이 꺼지면 0.5초 안에 걷기로 돌아온다.
 for(let i=0;i<15;i++){ph+=.2;h.update({clip:'Walk',distance:ph,stride:1,stepLength:st.walk,running:false,dt:1/30});h.ground({moving:true,phase:ph,surfaceHeight:flat});}
 assert.ok(h.gait.run<.05,`뛰기 비율 ${h.gait.run}`);
 for(let i=0;i<20;i++){h.update({clip:'Idle',pose:'sit',dt:.1});h.ground({moving:false,phase:0,surfaceHeight:flat});}
 assert.ok(Math.abs(h.interaction.seatY)<1e-6&&h.interaction.sit>.99);
 // 1인칭 눈높이: 서기 약 0.7m, 앉기 약 0.55m(실사 1.6m·0.85m와 다르다)
 assert.ok(Math.abs(h.eyeHeight-h.profile.eyeHeight.sit)<.01&&h.eyeHeight<.6,`앉은 눈 ${h.eyeHeight}`);
 for(const a of h.interaction.arms)assert.ok(a.targetError<.01,`앉아 무릎 위 손 ${a.targetError}`);
 for(let i=0;i<40;i++){h.update({clip:'Idle',pose:'tea',dt:.1,teaProgress:.5});h.ground({moving:false,phase:0,surfaceHeight:flat});}
 assert.ok(h.interaction.cup.held&&h.interaction.cup.handDistance<.01,`컵 ${h.interaction.cup.handDistance}`);
 for(let i=0;i<20;i++){h.update({clip:'Idle',pose:'stand',dt:.1});h.ground({moving:false,phase:0,surfaceHeight:flat});}
 for(const [gadget,selfie] of [['binoculars',false],['phone',false],['phone',true]]){
  for(let i=0;i<30;i++){h.update({clip:'Idle',pose:'stand',dt:.1,gadget,selfie});h.ground({moving:false,phase:0,surfaceHeight:flat});}
  assert.ok(h.interaction.gadget.held,`${gadget} 쥠`);for(const a of h.interaction.arms)assert.ok(a.targetError<.03,`${gadget} 팔 ${a.targetError}`);
  const lens=h.phoneCamera(selfie);if(gadget==='phone')assert.ok(lens.visible&&Number.isFinite(lens.position.x));
  // 셀카는 셀카봉을 뻗어 얼굴에서 35cm 넘게 떨어진 곳에서 찍는다(팔만으로는 얼굴에 붙는다).
  if(selfie){assert.ok(h.gadgetProps.stick.visible,'셀카봉');const eye=h.model.getObjectByName('mixamorigHead').localToWorld(new Vector3(...h.profile.eyeLocal));assert.ok(lens.position.distanceTo(eye)>.35,`렌즈~눈 ${lens.position.distanceTo(eye)}`);}
  else assert.equal(h.gadgetProps.stick.visible,false);
 }
 for(let i=0;i<20;i++){h.update({clip:'Idle',pose:'stand',dt:.1});h.ground({moving:false,phase:0,surfaceHeight:flat});}
 assert.ok(Math.abs(h.eyeHeight-h.profile.eyeHeight.stand)<.01&&h.eyeHeight>.65&&h.eyeHeight<.78,`선 눈 ${h.eyeHeight}`);
});

test('실사 등산객은 그대로: 기본 치수와 뛰기 보폭 배율 1.16, 뛰기 클립 없음, 눈높이·스틱 기본값',async()=>{
 assert.equal(STANDING_EYE_HEIGHT,1.6);assert.equal(SEATED_EYE_HEIGHT,.85);assert.deepEqual({...POLE_STEP},{forward:.28,lift:.18});assert.deepEqual(poleStep(.3,'Left'),poleStep(.3,'Left',false,POLE_STEP));
 assert.equal(DEFAULT_HIKER_PROFILE.runStride,1.16);assert.equal(DEFAULT_HIKER_PROFILE.chestY,1.21);assert.deepEqual(DEFAULT_HIKER_PROFILE.eyeLocal,[-.0025,.0995,.115]);
 const h=createRealisticHiker(await parse('../assets/realistic/models/hiker/Hiker.glb'));
 assert.equal(h.profile.kind,'realistic');assert.equal(h.strideScale,null);assert.equal(h.eyeHeight,1.6);assert.equal(h.actions.Run,undefined);
 h.update({clip:'Walk',stepLength:.7,running:true,dt:1/60});assert.ok(Math.abs(h.step-.7*1.16)<1e-12);
});

test('카툰 캐릭터 선 자세·쌍안경: 무릎이 거의 펴지고 발이 땅에 닿으며, 쌍안경을 보면 상체가 앞으로 숙는다',async()=>{
 const h=createRealisticHiker(await toonGltf());
 const pose=gadget=>{for(let i=0;i<40;i++){h.update({clip:'Idle',distance:0,stride:1,stepLength:.22,dt:.05,pose:'stand',gadget,idleSeconds:0,speed:0});h.ground({moving:false,phase:0,surfaceHeight:flat,sample:()=>({}),floorHeight:0});}
  h.model.updateMatrixWorld(true);const s=h.model,P=n=>s.getObjectByName('mixamorig'+n).getWorldPosition(new Vector3());
  let sole=Infinity;s.traverse(o=>{if(o.isSkinnedMesh&&o.name==='ToonHiker_boots'){o.skeleton.update();const V=new Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++)sole=Math.min(sole,o.getVertexPosition(i,V).applyMatrix4(o.matrixWorld).y);}});
  return {hip:P('LeftUpLeg'),knee:P('LeftLeg'),ankle:P('LeftFoot'),hips:P('Hips'),neck:P('Neck'),sole};};
 const idle=pose('none'),bino=pose('binoculars');
 // 무릎이 엉덩이-발목 선에서 앞으로 나온 거리(몸 앞은 -Z)
 const t=(idle.knee.y-idle.hip.y)/(idle.ankle.y-idle.hip.y),lineZ=idle.hip.z+(idle.ankle.z-idle.hip.z)*t,ahead=lineZ-idle.knee.z;
 assert.ok(ahead<.02,`무릎 앞 ${ahead.toFixed(3)}m`);
 assert.ok(Math.abs(idle.sole)<.004,`발바닥 ${idle.sole.toFixed(4)}`);
 const lean=s=>Math.atan2(s.hips.z-s.neck.z,s.neck.y-s.hips.y)*180/Math.PI;
 assert.ok(lean(bino)>lean(idle)+2,`쌍안경 상체 ${lean(bino).toFixed(1)}° / 서기 ${lean(idle).toFixed(1)}°`);
});

test('카툰 걷기↔뛰기 섞기: 프레임 빠르기와 상관없이 섞는 전 구간에서 디딘 발이 6mm 안(뜨거나 파묻히지 않는다)',async()=>{
 for(const fps of [30,60,144]){const h=createRealisticHiker(await freshToon()),st=h.profile.animSteps,dt=1/fps;let ph=0,blendErr=0,blendFrames=0;
  for(const [running,sec] of [[false,1.2],[true,1],[false,1],[true,.6],[false,1]])for(let i=0;i<sec*fps;i++){const step=running?st.run:st.walk,dph=(running?8.2:6.2)*dt;ph+=dph;h.scene.position.z-=dph*step;h.scene.updateMatrixWorld(true);
   h.update({clip:'Walk',distance:ph,stride:1,stepLength:step,running,dt,speed:1.4});const cs=h.ground({moving:true,phase:ph,surfaceHeight:flat});
   if(h.gait.run>.01&&h.gait.run<.99){blendFrames++;for(const c of cs)if(c.planted)blendErr=Math.max(blendErr,c.error);}}
  assert.ok(blendFrames>fps*.3,`${fps}fps 섞는 프레임 ${blendFrames}`);assert.ok(blendErr<.006,`${fps}fps 섞는 동안 디딘 발 ${blendErr}`);}
});

// 합성 계단: 앞(-Z)으로 디딤판 tread·높이 rise(음수면 내려감), 12칸. 끝나면 평지.
const stairSurface=(rise,tread=.3,n=12)=>(x,z)=>{const d=-z;return d<0?0:Math.min(n,Math.floor(d/tread)+1)*rise;};
async function climbStairs({rise,tread=.3,start=-.45,fps=60,seconds=6,running=false}){
 const h=createRealisticHiker(await freshToon()),dt=1/fps,surf=stairSurface(rise,tread),slope=rise/tread,rate=STAIR_WALK_CADENCE*(running?2.5:1);
 let ph=0,d=start,err=0;const plants=[],was=[false,false];
 for(let i=0;i<seconds*fps;i++){ph+=rate*dt;d+=rate*dt*STAIR_STRIDE/Math.hypot(1,slope);h.scene.position.set(0,surf(0,-d),-d);h.scene.updateMatrixWorld(true);
  h.update({clip:'Climb',distance:ph,stride:1,stepLength:STAIR_STRIDE,running,dt,speed:rate*STAIR_STRIDE,slope,stairs:true,surfaceHeight:surf});
  const cs=h.ground({moving:true,phase:ph,surfaceHeight:surf});
  cs.forEach((c,k)=>{const down=c.planted&&c.lift<.003;if(i>fps){if(down&&!was[k]){const boot=-c.foot[1]+.033;if(boot<12*tread)plants.push({k,tread:Math.floor(boot/tread),frac:(boot/tread)%1});}if(c.planted)err=Math.max(err,c.error);}was[k]=down;});}
 return {h,plants,err};
}
test('카툰 계단: 한 칸(디딤판 0.30m)에 한 발씩, 두 발이 번갈아 디딤판 가운데에 딛고 디딘 발이 뜨거나 파묻히지 않는다(높은 돌계단·낮은 나무계단·내려가기)',async()=>{
 // 계단 클립: 한 걸음 = 한 칸(0.35m), 계단에서는 기울기와 상관없이 계단 클립을 쓴다.
 assert.ok(Math.abs(GAIT_SHAPE.stairs.step-STAIR_STRIDE)<.01);assert.equal(TOON_STRIDE.stairs,1);
 for(const o of [{rise:.18},{rise:.06},{rise:.025,start:-.6},{rise:.06,tread:.25},{rise:-.15,start:-.7},{rise:.12,running:true},{rise:.18,fps:30},{rise:.18,fps:144}]){
  const {h,plants,err}=await climbStairs(o),label=JSON.stringify(o);
  assert.equal(h.pose.name,'Climb',label);
  const per=new Map();for(const p of plants)per.set(p.tread,(per.get(p.tread)??0)+1);
  assert.ok(plants.length>=6,`${label} 디딘 수 ${plants.length}`);
  assert.ok([...per.values()].every(n=>n===1),`${label} 칸마다 디딘 수 ${[...per.values()]}`);
  assert.ok(plants.every((p,i)=>!i||(p.k!==plants[i-1].k&&Math.abs(p.tread-plants[i-1].tread)===1)),`${label} 번갈아 다음 칸`);
  // 처음 두 발(위상을 맞추는 동안)을 빼면 신발 가운데가 디딤판의 35~75% 자리
  for(const p of plants.slice(2))assert.ok(p.frac>.35&&p.frac<.75,`${label} 디딘 자리 ${p.frac.toFixed(2)}`);
  assert.ok(err<.006,`${label} 디딘 발 오차 ${err}`);
 }
});

test('카툰 쌍안경: 가슴 폭의 1/3 이하 작은 카툰 쌍안경, 눈에 대면 접안 컵이 얼굴에 닿는다(뚫지 않는다)',async()=>{
 const h=createRealisticHiker(await freshToon()),run=(o,n=40)=>{for(let i=0;i<n;i++){h.update({clip:'Idle',pose:'stand',dt:.1,...o});h.ground({moving:false,phase:0,surfaceHeight:flat});}h.scene.updateMatrixWorld(true);};
 run({});const bino=h.gadgetProps.binoculars,size=new Box3().setFromObject(bino).getSize(new Vector3());
 // 가슴(바람막이) 폭 0.33m(시안 타원체 반지름 0.165m)
 assert.ok(TOON_BINOCULARS_SIZE.width<=.33/3&&size.x<=.33/3+1e-6,`쌍안경 폭 ${size.x.toFixed(3)}`);
 assert.equal(bino.parent.name,'mixamorigSpine2','평소에는 가슴에 건다');
 run({gadget:'binoculars'});assert.equal(bino.parent.name,'mixamorigRightHand');
 const head=h.model.getObjectByName('ToonHiker_Head'),q=bino.getWorldQuaternion(new Quaternion()),dir=new Vector3(0,0,1).applyQuaternion(q),rc=new Raycaster();
 for(const s of [-1,1]){const p=bino.localToWorld(new Vector3(s*TOON_BINOCULARS_SIZE.eye,0,TOON_BINOCULARS_SIZE.back));
  // 접안 컵 10cm 앞에서 얼굴 쪽으로 쏜 광선이 얼굴에 닿는 거리 - 10cm = 접안 컵과 얼굴 사이(음수면 얼굴을 뚫음)
  rc.set(p.clone().addScaledVector(dir,-.1),dir);rc.far=.3;const gap=rc.intersectObject(head,false)[0]?.distance-.1;
  assert.ok(gap>-.001&&gap<.006,`접안 컵~얼굴 ${gap}`);}
 for(const a of h.interaction.arms)assert.ok(a.targetError<.01,`쌍안경 손 ${a.targetError}`);
});

test('카툰 발소리: 앞 소리에서 0.24초 안의 걸음은 건너뛰어 걷기·뛰기 모두 초당 3~4번, 계단 한 칸 한 걸음은 모두 난다. 실사는 그대로',()=>{
 const count=(rate,sec=10)=>{const gate=toonStepGate();let n=0;for(let i=1;i<=rate*sec;i++)if(gate({elapsed:i/rate}))n++;return n/sec;};
 const walk=count(1.37/(WALK_STRIDE.flat*TOON_STRIDE.walk)),run=count(1.37*TOON_RUN_SPEED/(WALK_STRIDE.flat*TOON_STRIDE.run)),stairs=count(STAIR_WALK_CADENCE*1.15);
 assert.ok(walk>=2.9&&walk<=4.1,`걷기 초당 ${walk}`);assert.ok(run>=2.9&&run<=4.2,`뛰기 초당 ${run}`);assert.ok(Math.abs(stairs-STAIR_WALK_CADENCE*1.15)<.11,`계단 초당 ${stairs}`);
 // 남은 소리는 좌우를 번갈아 낸다
 const g=toonStepGate(),pans=[0,.3,.6,.9].map(t=>g({elapsed:t})?.pan);assert.deepEqual(pans,[.08,-.08,.08,-.08]);
 assert.ok(TOON_FOOTSTEP.rate>1.2&&TOON_FOOTSTEP.gainDb<=-4&&TOON_FOOTSTEP.maxDuration<=.15,'가볍고 작은 톡톡');
 const real=new FootstepAudio({base:'',enabled:false}),toon=new FootstepAudio({base:'',enabled:false,style:'toon'});
 assert.equal(real.gate,null);assert.ok(toon.gate);
 for(let i=1;i<=10;i++){real.play({material:'soil',step:i,elapsed:i*.16});toon.play({material:'soil',step:i,elapsed:i*.16});}
 assert.equal(real.dropped.thinned,0);assert.equal(toon.dropped.thinned,5);
});
