// 200m 청크 스트리머. three 객체는 덕 타이핑(isTexture·traverse 등)으로만 다뤄 node에서도 테스트할 수 있다.

const isShared=r=>r?.userData?.shared===true;

// root 아래 geometry·material·texture를 한 번씩만 dispose한다. userData.shared===true 이거나 keep에 든 자원은 건너뛴다.
export function disposeObject3D(root,{keep}={}){
  const counts={geometries:0,materials:0,textures:0};
  if(!root)return counts;
  const seen=new Set();
  const skip=r=>!r||seen.has(r)||isShared(r)||keep?.has(r);
  const disposeTexture=t=>{if(!t?.isTexture||skip(t))return;seen.add(t);t.dispose?.();counts.textures++;};
  const disposeMaterial=m=>{
    if(!m||skip(m))return;seen.add(m);
    for(const v of Object.values(m)){
      if(v?.isTexture)disposeTexture(v);
      else if(Array.isArray(v))v.forEach(disposeTexture);
    }
    // ShaderMaterial uniforms의 텍스처
    if(m.uniforms)for(const u of Object.values(m.uniforms)){const v=u?.value;if(v?.isTexture)disposeTexture(v);else if(Array.isArray(v))v.forEach(disposeTexture);}
    m.dispose?.();counts.materials++;
  };
  const visit=o=>{
    if(o.isInstancedMesh)o.dispose?.();
    if(o.isSkinnedMesh&&o.skeleton)o.skeleton.dispose?.();
    if(isShared(o))return;
    const g=o.geometry;
    if(g&&!skip(g)){seen.add(g);g.dispose?.();counts.geometries++;}
    const m=o.material;
    if(Array.isArray(m))m.forEach(disposeMaterial);else disposeMaterial(m);
  };
  if(root.traverse)root.traverse(visit);else visit(root);
  return counts;
}

export function createChunkStreamer({chunks=[],chunkSize=200,radius=1,unloadRadius=radius+1,load,attach,detach,maxInFlight=4}){
  if(typeof load!=='function'||typeof attach!=='function')throw new Error('load와 attach가 필요합니다');
  if(unloadRadius<radius)unloadRadius=radius;
  const byCell=new Map();
  let originX=0,originZ=0;
  if(chunks.length){const c=chunks[0];originX=c.x0-c.i*chunkSize;originZ=c.z0-c.j*chunkSize;}
  for(const c of chunks)byCell.set(`${c.i},${c.j}`,c);
  // state: queued는 별도 Set이 아니라 states에 없는 wanted 청크. 'loading' | 'loaded'(attach 대기) | 'attached' | 'empty' | 'failed'
  const states=new Map(); // id -> {chunk,state,controller,obj}
  const waiters=[];
  const disposed={geometries:0,materials:0,textures:0};
  let center=null,destroyed=false;

  const cellOf=p=>[Math.floor((p.x-originX)/chunkSize),Math.floor((p.z-originZ)/chunkSize)];
  const dist=(c,ci,cj)=>Math.max(Math.abs(c.i-ci),Math.abs(c.j-cj));
  const near=(ci,cj,r)=>{const out=[];for(let j=cj-r;j<=cj+r;j++)for(let i=ci-r;i<=ci+r;i++){const c=byCell.get(`${i},${j}`);if(c)out.push(c);}
    return out.sort((a,b)=>(Math.hypot(a.i-ci,a.j-cj))-(Math.hypot(b.i-ci,b.j-cj)));};

  function release(s){
    s.controller?.abort();
    if(s.obj){
      try{detach?.(s.obj,s.chunk);}catch{}
      s.obj.removeFromParent?.();
      const c=disposeObject3D(s.obj);
      disposed.geometries+=c.geometries;disposed.materials+=c.materials;disposed.textures+=c.textures;
    }
    states.delete(s.chunk.id);
  }

  function start(chunk){
    const controller=new AbortController();
    const s={chunk,state:'loading',controller,obj:null};
    states.set(chunk.id,s);
    Promise.resolve().then(()=>load(chunk,controller.signal)).then(obj=>{
      if(controller.signal.aborted||destroyed||states.get(chunk.id)!==s){if(obj)disposeObject3D(obj);return;}
      s.controller=null;
      if(obj){s.obj=obj;s.state='loaded';}else s.state='empty';
      settle();
    },err=>{
      if(controller.signal.aborted||states.get(chunk.id)!==s)return;
      s.controller=null;s.state='failed';s.error=err;settle();
    });
  }

  // 대기열 갱신(취소·해제·로드 시작). attach는 update에서만 한다.
  function refresh(position){
    if(destroyed)return;
    const [ci,cj]=cellOf(position);
    center=[ci,cj];
    for(const s of [...states.values()]){
      if(dist(s.chunk,ci,cj)>unloadRadius)release(s);
    }
    let inFlight=0;for(const s of states.values())if(s.state==='loading')inFlight++;
    for(const c of near(ci,cj,radius)){
      if(inFlight>=maxInFlight)break;
      if(states.has(c.id))continue;
      start(c);inFlight++;
    }
  }

  function attachOne(){
    if(!center)return;
    let best=null,bd=Infinity;
    for(const s of states.values()){if(s.state!=='loaded')continue;const d=Math.hypot(s.chunk.i-center[0],s.chunk.j-center[1]);if(d<bd){bd=d;best=s;}}
    if(!best)return;
    try{attach(best.obj,best.chunk);best.state='attached';}
    catch(err){best.state='failed';best.error=err;const c=disposeObject3D(best.obj);disposed.geometries+=c.geometries;disposed.materials+=c.materials;disposed.textures+=c.textures;best.obj=null;}
  }

  const wantedDone=(ci,cj)=>near(ci,cj,radius).every(c=>{const s=states.get(c.id);return s&&(s.state==='attached'||s.state==='empty'||s.state==='failed');});

  function settle(){
    for(let k=waiters.length-1;k>=0;k--){
      const w=waiters[k];
      if(wantedDone(w.ci,w.cj)){waiters.splice(k,1);w.resolve();}
    }
  }

  // loading 상태가 풀려 새 청크를 시작할 여유가 생기면 대기열을 이어서 처리
  function pump(){if(center&&!destroyed){let n=0;for(const s of states.values())if(s.state==='loading')n++;for(const c of near(center[0],center[1],radius)){if(n>=maxInFlight)break;if(states.has(c.id))continue;start(c);n++;}}}

  const api={
    update(position){
      if(destroyed)return;
      refresh(position);attachOne();pump();settle();
    },
    ready(position){
      if(destroyed)return Promise.resolve();
      if(position)refresh(position);
      const [ci,cj]=position?cellOf(position):center||[0,0];
      return new Promise(resolve=>{waiters.push({ci,cj,resolve});settle();});
    },
    status(){
      const ids=[];let loaded=0,inFlight=0,awaiting=0,failed=0;
      for(const s of states.values()){
        if(s.state==='attached'||s.state==='empty'){loaded++;ids.push(s.chunk.id);}
        else if(s.state==='loading')inFlight++;
        else if(s.state==='loaded')awaiting++;
        else if(s.state==='failed')failed++;
      }
      let queued=0;if(center)for(const c of near(center[0],center[1],radius))if(!states.has(c.id))queued++;
      return {loaded,pending:queued+inFlight+awaiting,inFlight,failed,disposed:{...disposed},ids:ids.sort()};
    },
    dispose(){
      if(destroyed)return;
      for(const s of [...states.values()])release(s);
      destroyed=true;
      while(waiters.length)waiters.pop().resolve();
    }
  };
  return api;
}
