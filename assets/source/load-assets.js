import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3} from 'three';

/** base는 배포 시 /assets/처럼 정적 파일이 공개된 경로로 지정한다. */
export async function loadHiker(base='/assets/',lod=0){
  const gltf=await new GLTFLoader().loadAsync(`${base}hiker-170-lod${lod}.glb`);
  return createHiker(gltf);
}
export function createHiker(gltf){
  const mixer=new AnimationMixer(gltf.scene);
  const actions=Object.fromEntries(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
  let current;
  const feet=['L','R'].map(side=>{const hip=gltf.scene.getObjectByName(`Hip${side}`),knee=gltf.scene.getObjectByName(`Knee${side}`);const boot=knee.children.find(o=>o.material?.name==='boot');knee.remove(boot);gltf.scene.add(boot);return {side,hip,knee,boot};});
  return {scene:gltf.scene,animations:gltf.animations,actions,
    // 관절 노드형 자산: 발바닥을 지면에 놓고 두 관절을 해석적으로 맞춘다.
    ground({s,lateral,moving,phase,floorHeight,sample,surfaceHeight}){
      const contacts=[];
      for(const [i,{hip,knee,boot}] of feet.entries()){
        const cycle=((phase+i)%2+2)%2;
        const lift=moving&&cycle>1?Math.sin((cycle-1)*Math.PI)*.10:0;
        const localZ=moving&&cycle>1?Math.sin((cycle-1)*Math.PI*2)*.08:0;
        const x=i===0?-.105:.105;
        const base=sample(s),yaw=gltf.scene.rotation.y-base.heading;
        const footS=s-localZ*Math.cos(yaw)-x*Math.sin(yaw);
        // 발바닥 앞·뒤 모서리 중 높은 곳을 지지점으로 사용(단 모서리 관통 방지).
        const support=Math.max(...[-.07,.07].flatMap(dx=>[-.195,.085].map(dz=>{
          const cornerS=footS-dz*Math.cos(yaw)-dx*Math.sin(yaw);
          const q=sample(cornerS);if(surfaceHeight){const localX=x+dx,localZCorner=localZ+dz;const yaw=gltf.scene.rotation.y;const wx=gltf.scene.position.x+Math.cos(yaw)*localX+Math.sin(yaw)*localZCorner,wz=gltf.scene.position.z-Math.sin(yaw)*localX+Math.cos(yaw)*localZCorner;return surfaceHeight(wx,wz);}return floorHeight(cornerS)+(q.material==='ridge'?.006:0);
        })));
        const y=support-gltf.scene.position.y+.05+lift;
        boot.position.set(x,y,localZ-.055);boot.quaternion.identity();
        hip.position.y=Math.min(.88,y+.83)-.006;
        const down=hip.position.y-y,z=localZ;
        const length=Math.min(.829999,Math.hypot(down,z));
        const bend=Math.acos(Math.max(-1,Math.min(1,(length*length-.4*.4-.43*.43)/(2*.4*.43))));
        hip.rotation.set(Math.atan2(-z,down)-Math.atan2(.43*Math.sin(bend),.4+.43*Math.cos(bend)),0,0);
        knee.rotation.set(bend,0,0);
        contacts.push({side:i===0?'왼발':'오른발',support,bottom:gltf.scene.position.y+y-.05,lift,error:Math.abs(gltf.scene.position.y+y-.05-support-lift)});
      }
      gltf.scene.updateMatrixWorld(true);contacts.forEach((c,i)=>{c.bottom=new Box3().setFromObject(feet[i].boot).min.y;c.error=Math.abs(c.bottom-c.support-c.lift);});return contacts;
    },
    // 실제 이동 거리로 위상을 정한다. 애니메이션에서 게임 위치를 이동시키지 않는다.
    update({clip='Idle',distance=0,stride=.7,idleSeconds=0}){
      if(!actions[clip])throw new Error(`알 수 없는 동작: ${clip}`);
      if(current!==clip){Object.values(actions).forEach(a=>a.stop());actions[clip].play();current=clip;}
      const action=actions[clip];action.time=clip==='Idle'?idleSeconds%1:(distance/(2*stride))%1;mixer.update(0);
    }};
}

export async function loadApproach(base='/assets/',lod=1){
  const loader=new GLTFLoader();
  const [gltf,manifest,walkable,surfaces]=await Promise.all([
    loader.loadAsync(`${base}summit-approach-lod${lod}.glb`),
    fetch(`${base}manifest.json`).then(r=>r.json()),
    fetch(`${base}data/walkable-corridor.json`).then(r=>r.json()),
    fetch(`${base}data/surfaces.json`).then(r=>r.json())]);
  // 기존 세계 좌표와 일치시키는 유일한 변환. GLB 자체는 큰 좌표 정밀도 손실을 피한 앵커 상대 좌표.
  const {x,y,z}=manifest.anchor;gltf.scene.position.set(x,y,z);
  return {scene:gltf.scene,manifest,walkable,surfaces};
}

export function centerLimit(section,radius=.25){return Math.max(0,section.width/2-radius);}
export function stairAt(s,walkable){return walkable.steps.find(p=>s>=p.start&&s<p.end);}
