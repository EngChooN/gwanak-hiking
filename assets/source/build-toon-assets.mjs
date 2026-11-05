import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';

// 실사 GLB에서 텍스처를 빼고 baseColor를 텍스처 평균색으로 바꾼 카툰용 GLB를 만든다.
// 지오메트리(meshopt 압축 포함)는 건드리지 않고 JSON과 이미지 bufferView만 정리하므로 three 없이 node 단독으로 동작한다.
const root=new URL('../../',import.meta.url);
const natureIn=new URL('assets/realistic/generated/nature/',root);
const natureOut=new URL('assets/toon/nature/',root);
const hikerIn=new URL('assets/realistic/models/hiker/Hiker.glb',root);
const hikerOut=new URL('assets/toon/models/hiker/Hiker.glb',root);
const gradientOut=new URL('assets/toon/gradients/toon3.png',root);
for(const u of [natureOut,new URL('assets/toon/models/hiker/',root),new URL('assets/toon/gradients/',root)])mkdirSync(u,{recursive:true});

const srgbToLinear=c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
const clamp=v=>Math.max(0,Math.min(255,v));

// ---- JPEG(baseline) DC 계수만으로 평균색 계산: 엔트로피 데이터는 끝까지 읽되 IDCT는 하지 않는다.
function jpegAverage(d){
  const qt=[],hdc=[],hac=[];let comps=[],restart=0,p=2,mean=null;
  const buildHuff=(counts,symbols)=>{const t=new Map();let code=0,k=0;for(let len=1;len<=16;len++){for(let n=0;n<counts[len-1];n++)t.set(len<<16|code++,symbols[k++]);code<<=1;}return t;};
  while(p<d.length){
    if(d[p]!==0xFF){p++;continue;}
    const m=d[p+1];p+=2;
    if(m===0xD8||m===0x01||(m>=0xD0&&m<=0xD7)||m===0xFF)continue;
    const len=d.readUInt16BE(p),s=p+2,e=p+len;
    if(m===0xDB){let q=s;while(q<e){const pq=d[q]>>4,id=d[q]&15;q++;qt[id]=pq?d.readUInt16BE(q):d[q];q+=pq?128:64;}}
    else if(m===0xC4){let q=s;while(q<e){const tc=d[q]>>4,id=d[q]&15;q++;const counts=[...d.subarray(q,q+16)];q+=16;const total=counts.reduce((a,b)=>a+b,0);const t=buildHuff(counts,d.subarray(q,q+total));q+=total;(tc?hac:hdc)[id]=t;}}
    else if(m===0xDD)restart=d.readUInt16BE(s);
    else if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){if(m!==0xC0&&m!==0xC1)throw new Error('baseline JPEG만 지원합니다');const n=d[s+5];comps=[];for(let i=0;i<n;i++)comps.push({id:d[s+6+i*3],h:d[s+7+i*3]>>4,v:d[s+7+i*3]&15,tq:d[s+8+i*3],pred:0,sum:0,blocks:0});const W=d.readUInt16BE(s+3),H=d.readUInt16BE(s+1);comps.W=W;comps.H=H;}
    else if(m===0xDA){
      const n=d[s];const sel=[];for(let i=0;i<n;i++){const c=comps.find(x=>x.id===d[s+1+i*2]);c.td=d[s+2+i*2]>>4;c.ta=d[s+2+i*2]&15;sel.push(c);}
      let pos=e,bits=0,nb=0;
      const bit=()=>{if(!nb){let b=d[pos++];if(b===0xFF){const n2=d[pos];if(n2===0)pos++;else{pos--;b=0;nb=8;bits=0;return 0;}}bits=b;nb=8;}nb--;return (bits>>nb)&1;};
      const huff=t=>{let code=0;for(let len=1;len<=16;len++){code=code<<1|bit();const v=t.get(len<<16|code);if(v!==undefined)return v;}throw new Error('허프만 코드 오류');};
      const recv=n2=>{let v=0;for(let i=0;i<n2;i++)v=v<<1|bit();return v;};
      const ext=(v,n2)=>n2&&v<(1<<(n2-1))?v-(1<<n2)+1:v;
      const hmax=Math.max(...comps.map(c=>c.h)),vmax=Math.max(...comps.map(c=>c.v));
      const mcusX=Math.ceil(comps.W/(8*hmax)),mcusY=Math.ceil(comps.H/(8*vmax));
      const single=sel.length===1;let bw=1,bh=1;
      if(single){bw=Math.ceil(Math.ceil(comps.W*sel[0].h/hmax)/8);bh=Math.ceil(Math.ceil(comps.H*sel[0].v/vmax)/8);}
      const total=single?bw*bh:mcusX*mcusY;
      const doBlock=c=>{const t=huff(hdc[c.td]);c.pred+=ext(recv(t),t);c.sum+=c.pred*qt[c.tq]/8+128;c.blocks++;for(let k=1;k<64;){const rs=huff(hac[c.ta]),r=rs>>4,sz=rs&15;if(!sz){if(r===15){k+=16;continue;}break;}k+=r+1;recv(sz);}};
      for(let mcu=0;mcu<total;mcu++){
        if(restart&&mcu&&mcu%restart===0){nb=0;while(d[pos]!==0xFF||d[pos+1]<0xD0||d[pos+1]>0xD7)pos++;pos+=2;comps.forEach(c=>c.pred=0);}
        if(single)doBlock(sel[0]);else for(const c of sel)for(let i=0;i<c.h*c.v;i++)doBlock(c);
      }
      const v=comps.map(c=>c.sum/c.blocks);
      mean=comps.length===1?[v[0],v[0],v[0]]:[v[0]+1.402*(v[2]-128),v[0]-0.344136*(v[1]-128)-0.714136*(v[2]-128),v[0]+1.772*(v[1]-128)];
      break;
    }
    p=e;
  }
  if(!mean)throw new Error('JPEG 평균색을 구하지 못했습니다');
  return {rgb:mean.map(v=>clamp(v)/255),alpha:1};
}

// ---- PNG(8비트, 비인터레이스) 알파 가중 평균색
function pngAverage(d){
  const w=d.readUInt32BE(16),h=d.readUInt32BE(20),bd=d[24],ct=d[25],il=d[28];
  if(bd!==8||il!==0||![0,2,4,6].includes(ct))throw new Error('지원하지 않는 PNG 형식');
  const bpp={0:1,2:3,4:2,6:4}[ct];const parts=[];let p=8;
  while(p<d.length){const n=d.readUInt32BE(p),type=d.toString('latin1',p+4,p+8);if(type==='IDAT')parts.push(d.subarray(p+8,p+8+n));p+=12+n;}
  const raw=inflateSync(Buffer.concat(parts)),stride=w*bpp;let prev=Buffer.alloc(stride),cur;
  let r=0,g=0,b=0,aw=0,at=0;
  for(let y=0;y<h;y++){
    const f=raw[y*(stride+1)];cur=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));
    for(let i=0;i<stride;i++){const a=i>=bpp?cur[i-bpp]:0,up=prev[i],c=i>=bpp?prev[i-bpp]:0;
      let v=0;if(f===1)v=a;else if(f===2)v=up;else if(f===3)v=(a+up)>>1;else if(f===4){const pa=Math.abs(up-c),pb=Math.abs(a-c),pc=Math.abs(a+up-2*c),pp=a+up-c;const q=Math.abs(pp-a),u=Math.abs(pp-up),t=Math.abs(pp-c);v=q<=u&&q<=t?a:u<=t?up:c;void pa;void pb;void pc;}
      cur[i]=(cur[i]+v)&255;}
    for(let x=0;x<w;x++){const o=x*bpp;let R,G,B,A=255;if(ct===0||ct===4){R=G=B=cur[o];if(ct===4)A=cur[o+1];}else{R=cur[o];G=cur[o+1];B=cur[o+2];if(ct===6)A=cur[o+3];}
      const k=A/255;r+=R*k;g+=G*k;b+=B*k;aw+=k;at+=A;}
    prev=cur;
  }
  const n=w*h;if(!aw)return {rgb:[.5,.5,.5],alpha:0};
  return {rgb:[r/aw/255,g/aw/255,b/aw/255],alpha:at/n/255};
}

// ---- GLB 읽기/쓰기
const readGlb=buf=>{const jl=buf.readUInt32LE(12);const json=JSON.parse(buf.toString('utf8',20,20+jl));const bs=20+jl;const bl=bs<buf.length?buf.readUInt32LE(bs):0;return {json,bin:bl?buf.subarray(bs+8,bs+8+bl):Buffer.alloc(0)};};
const writeGlb=(json,bin)=>{let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);const h=Buffer.alloc(12);h.write('glTF',0,'latin1');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+(bp.length?8+bp.length:0),8);const jh=Buffer.alloc(8);jh.writeUInt32LE(js.length,0);jh.write('JSON',4,'latin1');const parts=[h,jh,js];if(bp.length){const bh=Buffer.alloc(8);bh.writeUInt32LE(bp.length,0);bh.write('BIN\0',4,'latin1');parts.push(bh,bp);}return Buffer.concat(parts);};

function toonGlb(buf){
  const {json,bin}=readGlb(buf);const avg=new Map();
  const imageAvg=i=>{if(avg.has(i))return avg.get(i);const im=json.images[i],bv=json.bufferViews[im.bufferView],o=bv.byteOffset||0;const data=bin.subarray(o,o+bv.byteLength);const a=im.mimeType==='image/png'?pngAverage(data):jpegAverage(data);avg.set(i,a);return a;};
  const cutout=[];
  for(const m of json.materials||[]){
    const pbr=m.pbrMetallicRoughness||(m.pbrMetallicRoughness={});
    const f=pbr.baseColorFactor||[1,1,1,1];const tex=pbr.baseColorTexture;
    if(tex!==undefined){const a=imageAvg(json.textures[tex.index].source);pbr.baseColorFactor=[0,1,2].map(k=>+(f[k]*srgbToLinear(a.rgb[k])).toFixed(5)).concat(f[3]);}
    delete pbr.baseColorTexture;delete pbr.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;
    pbr.metallicFactor=0;pbr.roughnessFactor=1;
    // 텍스처 알파가 없으면 BLEND는 의미가 없다. MASK는 잎 카드이므로 표시만 남긴다.
    if(m.alphaMode==='BLEND')m.alphaMode='OPAQUE';
    if(m.alphaMode==='MASK'){delete m.alphaCutoff;m.extras={...m.extras,toonAlphaCutout:true};cutout.push(m.name||'');}
    delete m.extensions;
  }
  // 이미지 전용 bufferView 제거 후 buffer 0을 다시 채운다 (meshopt 압축 데이터 포함).
  const imageViews=new Set((json.images||[]).map(i=>i.bufferView));
  const used=new Set();
  for(const a of json.accessors||[]){if(a.bufferView!==undefined)used.add(a.bufferView);if(a.sparse){used.add(a.sparse.indices.bufferView);used.add(a.sparse.values.bufferView);}}
  const keep=json.bufferViews.map((bv,i)=>!imageViews.has(i)||used.has(i));
  const map=new Map();let n=0;json.bufferViews.forEach((_,i)=>{if(keep[i])map.set(i,n++);});
  const chunks=[];let off=0;const views=[];
  json.bufferViews.forEach((bv,i)=>{if(!keep[i])return;const nv={...bv};const ext=nv.extensions?.EXT_meshopt_compression;
    const phys=ext?{buffer:ext.buffer,byteOffset:ext.byteOffset||0,byteLength:ext.byteLength}:{buffer:nv.buffer,byteOffset:nv.byteOffset||0,byteLength:nv.byteLength};
    if(phys.buffer===0){const slice=bin.subarray(phys.byteOffset,phys.byteOffset+phys.byteLength);const pad=(4-off%4)%4;if(pad){chunks.push(Buffer.alloc(pad));off+=pad;}
      if(ext)nv.extensions={...nv.extensions,EXT_meshopt_compression:{...ext,byteOffset:off}};else nv.byteOffset=off;chunks.push(slice);off+=slice.length;}
    views.push(nv);});
  json.bufferViews=views;
  for(const a of json.accessors||[]){if(a.bufferView!==undefined)a.bufferView=map.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=map.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=map.get(a.sparse.values.bufferView);}}
  const newBin=Buffer.concat(chunks);json.buffers[0].byteLength=newBin.length;
  delete json.images;delete json.textures;delete json.samplers;
  const strip=['KHR_texture_transform','KHR_materials_specular','KHR_materials_ior'];
  for(const k of ['extensionsUsed','extensionsRequired'])if(json[k]){json[k]=json[k].filter(e=>!strip.includes(e));if(!json[k].length)delete json[k];}
  json.asset={...json.asset,extras:{...json.asset?.extras,toon:'textures removed, baseColor = texture average'}};
  return {glb:writeGlb(json,newBin),cutout};
}

// 문자열에서 impostor png 참조를 제거(객체 속성은 삭제, 배열 원소는 제외).
function stripImpostor(v){
  if(Array.isArray(v))return v.filter(x=>!(typeof x==='string'&&/impostor.*\.png$/i.test(x))).map(stripImpostor);
  if(v&&typeof v==='object'){const o={};for(const [k,x]of Object.entries(v)){if(typeof x==='string'&&/impostor.*\.png$/i.test(x))continue;if(/impostor/i.test(k)&&x&&typeof x==='object'&&JSON.stringify(x).includes('.png'))continue;o[k]=stripImpostor(x);}return o;}
  return v;
}

// 3x1 그레이스케일 PNG
function pngGray(values){
  const crcT=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
  const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  const chunk=(t,data)=>{const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(t,'latin1'),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(values.length,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=0;
  const row=Buffer.from([0,...values.map(v=>Math.round(v*255))]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(row)),chunk('IEND',Buffer.alloc(0))]);
}

const report=[];
let inBytes=0,outBytes=0;
const convert=(src,dst)=>{const buf=readFileSync(src);const r=toonGlb(buf);writeFileSync(dst,r.glb);inBytes+=buf.length;outBytes+=r.glb.length;if(r.cutout.length)report.push(`${dst.pathname.split('/').pop()}: 알파 컷아웃 재질 ${r.cutout.length}개`);};
for(const f of readdirSync(natureIn).filter(f=>f.endsWith('.glb')))convert(new URL(f,natureIn),new URL(f,natureOut));
convert(hikerIn,hikerOut);
const index=JSON.parse(readFileSync(new URL('index.json',natureIn),'utf8'));
writeFileSync(new URL('index.json',natureOut),JSON.stringify(stripImpostor(index)));
writeFileSync(gradientOut,pngGray([0.35,0.7,1.0]));
console.log(`카툰 GLB 변환 완료: ${(inBytes/1e6).toFixed(1)}MB → ${(outBytes/1e6).toFixed(1)}MB`);
if(report.length)console.log(`알파 컷아웃 재질(잎 카드, 텍스처 없이 단색 사각형이 됨 — toonify에서 처리 필요): ${report.length}개 파일`);
