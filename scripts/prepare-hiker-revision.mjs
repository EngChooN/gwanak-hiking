// 검토용 GLB를 별도 폴더에 작성한다. 원본 교체·삭제·네트워크 작업은 하지 않는다.
// 실행 전 docs/등산객-모델수정-인계.md 참조. 이 코드는 아직 실행·시각 검증하지 않았다.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,BufferGeometry,BufferAttribute} from 'three';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'assets/realistic/models/hiker/review-v1');
assert(!existsSync(output),'검토 폴더가 이미 있다. 기존 검토본을 덮어쓰지 않는다.');
const types={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const poleLength=1.175;

function parse(path){
 const data=readFileSync(resolve(root,path));
 assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(4),2);
 assert.equal(data.readUInt32LE(8),data.length);
 let json,bin;
 for(let p=12;p<data.length;){const n=data.readUInt32LE(p),type=data.readUInt32LE(p+4);p+=8;
  if(type===0x4e4f534a)json=JSON.parse(data.toString('utf8',p,p+n));
  else if(type===0x004e4942)bin=Buffer.from(data.subarray(p,p+n));p+=n;}
 assert(json&&bin);assert.equal(json.buffers.length,1);assert(!json.buffers[0].uri);
 assert(!(json.extensionsRequired??[]).length,'확장 필수 GLB는 별도 검토 필요');
 return {json,bin,extra:[],byteLength:bin.length};
}
function read(g,i){
 const a=g.json.accessors[i],v=g.json.bufferViews[a.bufferView];
 assert(!a.sparse&&v.buffer===0);assert(types[a.componentType]&&widths[a.type]);
 const [bytes,method]=types[a.componentType],width=widths[a.type],stride=v.byteStride??bytes*width;
 return Array.from({length:a.count*width},(_,k)=>g.bin[method]((v.byteOffset??0)+(a.byteOffset??0)+Math.floor(k/width)*stride+(k%width)*bytes));
}
function append(g,values,type='VEC3',componentType=5126){
 const width=widths[type],bytes=types[componentType][0],buf=Buffer.alloc(values.length*bytes);
 values.forEach((v,i)=>componentType===5126?buf.writeFloatLE(v,i*bytes):buf.writeUInt16LE(v,i*bytes));
 const pad=(4-g.byteLength%4)%4;if(pad){g.extra.push(Buffer.alloc(pad));g.byteLength+=pad;}
 const view=g.json.bufferViews.push({buffer:0,byteOffset:g.byteLength,byteLength:buf.length})-1;
 g.extra.push(buf);g.byteLength+=buf.length;
 const a={bufferView:view,componentType,count:values.length/width,type};
 if(type==='VEC3'){a.min=[0,1,2].map(c=>{let x=Infinity;for(let i=c;i<values.length;i+=3)x=Math.min(x,values[i]);return x;});
  a.max=[0,1,2].map(c=>{let x=-Infinity;for(let i=c;i<values.length;i+=3)x=Math.max(x,values[i]);return x;});}
 return g.json.accessors.push(a)-1;
}
function triangles(g){return g.json.nodes.reduce((sum,n)=>sum+(n.mesh===undefined?0:g.json.meshes[n.mesh].primitives.reduce((s,p)=>{
 assert(p.mode===undefined||p.mode===4);return s+g.json.accessors[p.indices??p.attributes.POSITION].count/3;
 },0)),0);}
function replacePositions(g,p,positions){
 const geo=new BufferGeometry();geo.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
 if(p.indices!==undefined)geo.setIndex(read(g,p.indices));geo.computeVertexNormals();
 p.attributes.POSITION=append(g,positions);p.attributes.NORMAL=append(g,Array.from(geo.attributes.normal.array));
 delete p.attributes.TANGENT;geo.dispose();
}
function globalMatrix(g,index){
 const parents=new Map();g.json.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 const n=g.json.nodes[index],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(
  new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
 return parents.has(index)?globalMatrix(g,parents.get(index)).multiply(local):local;
}
function bindJoint(g,skin,node){
 const s=g.json.skins[skin],i=s.joints.indexOf(node);assert(i>=0);assert(s.inverseBindMatrices!==undefined);
 return new Matrix4().fromArray(read(g,s.inverseBindMatrices),i*16).invert();
}
function poleMesh(g){
 const rings=[[.075,.016],[-.045,.016],[-.055,.007],[-1.10,.003]],pos=[],idx=[];
 for(const [y,r] of rings)for(let i=0;i<6;i++){const a=i*Math.PI/3;pos.push(Math.cos(a)*r,y,Math.sin(a)*r);}
 for(let j=0;j<3;j++)for(let i=0;i<6;i++){const a=j*6+i,b=j*6+(i+1)%6,c=a+6,d=b+6;idx.push(a,c,b,b,c,d);}
 // 원판은 각 4삼각형: 측면 36 + 끝마개 8 = 한 자루 44삼각형.
 for(let i=1;i<5;i++)idx.push(0,i,i+1,18,18+i+1,18+i);
 const mat=g.json.materials.push({name:'HikingPole.Graphite',pbrMetallicRoughness:{baseColorFactor:[.12,.15,.16,1],metallicFactor:.35,roughnessFactor:.65}})-1;
 const p={attributes:{},indices:append(g,idx,'SCALAR',5123),material:mat};replacePositions(g,p,pos);
 return g.json.meshes.push({name:'HikingPole.Shared44Triangles',primitives:[p]})-1;
}
function addPoles(g,rigged){
 const mesh=poleMesh(g),names=[];
 for(const side of ['Left','Right']){
  let hand=g.json.nodes.findIndex(n=>n.name===`mixamorig:${side}Hand`),translation,rotation;
  if(rigged){
   assert(hand>=0);translation=[0,.055,0];
   const bind=bindJoint(g,0,hand),q=new Quaternion();bind.decompose(new Vector3(),q,new Vector3());
   // bind pose에서 수직. 보행 중에는 손의 회전만 따라간다. 지면 고정 IK가 아니다.
   rotation=q.invert().toArray();
  }else{
   const arm=g.json.nodes.findIndex(n=>n.name===`Arm${side==='Left'?'L':'R'}`);assert(arm>=0);
   hand=g.json.nodes.push({name:`Hiker.Hand.${side}`,translation:[0,-.46,0]})-1;
   (g.json.nodes[arm].children??=[]).push(hand);translation=[0,0,0];rotation=[0,0,0,1];
  }
  const name=`HikingPole.${side}`,node=g.json.nodes.push({name,translation,rotation,mesh,
   extras:{lengthMeters:poleLength,forwardAxis:'-Y',gripLocal:[0,0,0],tipLocal:[0,-1.10,0],topLocal:[0,.075,0]}})-1;
  const grip=g.json.nodes.push({name:`${name}.Grip`,translation:[0,0,0]})-1;
  const tip=g.json.nodes.push({name:`${name}.Tip`,translation:[0,-1.10,0]})-1;
  g.json.nodes[node].children=[grip,tip];(g.json.nodes[hand].children??=[]).push(node);names.push(name);
 }
 return names;
}
function reviseRig(g){
 const head=g.json.nodes.findIndex(n=>n.name==='mixamorig:Head'),hat=g.json.nodes.findIndex(n=>n.name==='Human.hat');
 assert(head>=0&&hat>=0);const h=g.json.nodes[hat];assert(h.skin!==undefined);
 assert(!g.json.animations.some(a=>a.channels.some(c=>c.target.node===hat)),'모자 직접 애니메이션 확인 필요');
 // 메시 원점 이동이 아닌 bind 좌표를 Head 로컬로 옮긴 후 강체 자식으로 부착.
 const inv=bindJoint(g,h.skin,head).invert();
 const transformed=g.json.meshes[h.mesh].primitives.map(p=>{assert(!p.targets);const a=read(g,p.attributes.POSITION);
  const values=[];for(let i=0;i<a.length;i+=3)values.push(...new Vector3(a[i],a[i+1],a[i+2]).applyMatrix4(inv).toArray());return {p,values};});
 const bounds=[Infinity,-Infinity,Infinity,-Infinity];
 for(const {values:a} of transformed)for(let i=0;i<a.length;i+=3){bounds[0]=Math.min(bounds[0],a[i]);bounds[1]=Math.max(bounds[1],a[i]);bounds[2]=Math.min(bounds[2],a[i+2]);bounds[3]=Math.max(bounds[3],a[i+2]);}
 const centerX=(bounds[0]+bounds[1])/2,centerZ=(bounds[2]+bounds[3])/2;
 for(const {p,values} of transformed){for(let i=0;i<values.length;i+=3){values[i]-=centerX;values[i+2]-=centerZ;}
  replacePositions(g,p,values);delete p.attributes.JOINTS_0;delete p.attributes.WEIGHTS_0;}
 g.json.nodes.forEach(n=>{if(n.children)n.children=n.children.filter(i=>i!==hat);});
 (g.json.nodes[head].children??=[]).push(hat);delete h.skin;delete h.matrix;delete h.translation;delete h.rotation;delete h.scale;
 h.extras={...h.extras,attachment:'mixamorig:Head',centerMethod:'head-local-xz-bounds',reviewRequired:true};
 // 원본 MPFB 슬라이더 소스가 없어 외형 보정만 준비한다. 남성 재생성 완료로 간주하지 않는다.
 const targets=new Set(['Human','Human.jacket','Human.collar','Human.zipper','Human.straps','Human.low-poly']);
 let changed=0;
 for(const n of g.json.nodes){if(!targets.has(n.name)||n.mesh===undefined)continue;
  assert(n.skin!==undefined);assert(!n.matrix&&!n.translation&&!n.rotation&&!n.scale,'메시 로컬 변환 별도 검토 필요');
  for(const p of g.json.meshes[n.mesh].primitives){assert(!p.targets,'모프 포함 몸은 원본 MPFB에서 수정 필요');
   const a=read(g,p.attributes.POSITION);
   for(let i=0;i<a.length;i+=3){const y=a[i+1],x=a[i],z=a[i+2];
    const t=Math.max(0,1-Math.abs(y-1.31)/.19),w=t*t*(3-2*t);
    // +Z 앞, 중앙 몸통만. 팔·목·다리·등은 보존. 최대 흉부 전방 돌출 18mm 완화.
    const center=Math.max(0,1-Math.abs(x)/.21),front=Math.max(0,Math.min(1,(z-.025)/.08));
    a[i]=x*(1+.035*w*center);a[i+2]=z-.018*w*center*front;
   }
   replacePositions(g,p,a);changed++;
  }
 }
 assert(changed>=2,'몸·상의 메시가 확인되지 않음');
 return {hatCenterCorrectionHeadLocal:[-centerX,0,-centerZ],bodyMode:'unverified-geometric-fit-not-MPFB-slider'};
}
function reviseLegacy(g){
 const torso=g.json.nodes.find(n=>n.name==='shirt'&&n.translation?.[1]===1.16);assert(torso);torso.scale=[1.035,1,.90];
 const hat=g.json.nodes.findIndex(n=>n.name==='bag'&&n.translation?.[1]===1.6825);assert(hat>=0);
 const rootIndex=g.json.nodes.findIndex(n=>n.name==='Hiker170');assert(rootIndex>=0);
 const head=g.json.nodes.push({name:'Hiker.Head',translation:[0,1.57,0],children:[hat]})-1;
 g.json.nodes[rootIndex].children=g.json.nodes[rootIndex].children.filter(i=>i!==hat);g.json.nodes[rootIndex].children.push(head);
 g.json.nodes[hat].translation=[0,.1125,0];g.json.nodes[hat].name='Hiker.Hat';
 return {bodyMode:'legacy-proxy-fit',note:'기존 프록시는 Mixamo 스킨이 아니므로 MPFB 본체와 별도 유지'};
}
function encode(g){
 const padding=(4-g.byteLength%4)%4;if(padding)g.extra.push(Buffer.alloc(padding));
 const bin=Buffer.concat([g.bin,...g.extra]);g.json.buffers[0].byteLength=g.byteLength;
 const raw=Buffer.from(JSON.stringify(g.json)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
 header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,bh,bin]);
}
// 모든 입력을 메모리에서 준비·예산 검사한 뒤 별도 폴더에만 기록한다.
const tasks=[['assets/realistic/models/hiker/Hiker.glb','Hiker.glb',true],['assets/hiker-170-lod0.glb','hiker-170-lod0.glb',false],['assets/hiker-170-lod1.glb','hiker-170-lod1.glb',false]];
const prepared=tasks.map(([source,file,rigged])=>{
 const g=parse(source),before=triangles(g),clips=JSON.stringify(g.json.animations),skins=JSON.stringify(g.json.skins);
 const revision=rigged?reviseRig(g):reviseLegacy(g);const poles=addPoles(g,rigged),after=triangles(g);
 assert(after<=before*1.15,`${file}: +15% 삼각형 제한 초과`);
 assert.equal(JSON.stringify(g.json.animations),clips);assert.equal(JSON.stringify(g.json.skins),skins);
 return {file,bytes:encode(g),report:{source,file,trianglesBefore:before,trianglesAfter:after,increaseRatio:after/before-1,poles,...revision}};
});
mkdirSync(output,{recursive:true});
for(const p of prepared)writeFileSync(resolve(output,p.file),p.bytes,{flag:'wx'});
writeFileSync(resolve(output,'revision-report.json'),JSON.stringify({status:'needs-visual-review',heightMeters:1.7,animStep:.6336,poleLengthMeters:poleLength,files:prepared.map(p=>p.report)},null,2),{flag:'wx'});
console.log('검토본만 작성:',output);
