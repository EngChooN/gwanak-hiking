// 핵심 규칙 검사: 금연 계산·옷 표(브랜드 기준: 피부·얼굴 색은 어떤 옷에서도 바뀌지 않음)
import test from 'node:test';
import assert from 'node:assert/strict';
import {quitStats,DEFAULT_PROFILE} from '../src/lounge/profile.js';
import {OUTFITS,outfitKey} from '../src/lounge/outfit.js';
import {readFileSync} from 'node:fs';

test('금연 시작일 당일은 1일째, 아낀 돈 0원',()=>{
 const p={...DEFAULT_PROFILE,status:'quit',quitDate:'2026-11-08'};
 const s=quitStats(p,new Date('2026-11-08T12:00:00+09:00').getTime());
 assert.equal(s.days,1);assert.equal(s.saved,0);
});
test('반 갑·4,500원으로 10일 지나면 22,500원 아낌',()=>{
 const p={...DEFAULT_PROFILE,status:'quit',quitDate:'2026-10-29',packsPerDay:.5,packPrice:4500};
 const s=quitStats(p,new Date('2026-11-08T09:00:00+09:00').getTime());
 assert.equal(s.days,11);assert.equal(s.saved,22500);assert.equal(s.cigs,100);
});
test('비흡연자는 금연 카드 없음',()=>{assert.equal(quitStats({...DEFAULT_PROFILE,status:'never'}),null);});
test('옷은 회사원 차림 4종이고 등산복은 없다(대표 지시 11-08)',()=>{
 assert.deepEqual(Object.keys(OUTFITS),['shirt','suit','cardigan','padding']);assert.equal(DEFAULT_PROFILE.outfit,'shirt');
 for(const o of Object.values(OUTFITS))assert.equal(o.colors.mitten,'#f7d9b8',`${o.label} 맨손`);
 assert.equal(outfitKey('hiker'),'shirt');assert.equal(outfitKey('suit'),'suit');
});
test('옷 표에 피부·머리카락·눈 칸이 없다(얼굴은 동동이 그대로)',()=>{
 for(const o of Object.values(OUTFITS))for(const k of ['skin','hair','eye','blush','mouth','white'])assert.ok(!(k in o.colors),`${o.label}에 ${k}`);
});
test('outfit.js의 원래 색이 link-hiker.js PALETTE와 같다',()=>{
 const src=readFileSync(new URL('../src/toon/link-hiker.js',import.meta.url),'utf8'),pal=src.match(/const PALETTE=\{([^}]+)\}/)[1];
 const out=readFileSync(new URL('../src/lounge/outfit.js',import.meta.url),'utf8'),orig=out.match(/const ORIGINAL=\{([^}]+)\}/)[1];
 for(const [,k,v] of orig.matchAll(/(\w+):'(#[0-9a-f]{6})'/g))assert.ok(pal.includes(`${k}:'${v}'`),`${k} ${v}`);
});
test('흡연장은 공용 코드 복사본 없이 등산 원본을 import한다(통합 11-08)',async()=>{
 const {readdirSync,existsSync}=await import('node:fs');
 const files=readdirSync(new URL('../src/lounge/',import.meta.url)).filter(f=>f.endsWith('.js'));
 let shared=0;
 for(const f of files){
  const src=readFileSync(new URL('../src/lounge/'+f,import.meta.url),'utf8');
  for(const [,spec] of src.matchAll(/from\s*'(\.\.?\/[^']+)'/g)){
   const url=new URL(spec,new URL('../src/lounge/'+f,import.meta.url));
   assert.ok(existsSync(url),`${f} → ${spec} 파일이 없음`);
   if(!url.pathname.includes('/src/lounge/'))shared++;
  }
 }
 assert.ok(shared>0,'공용 모듈(src/toon 등)을 원본 경로로 import해야 한다');
 for(const f of ['link-hiker.js','pipeline.js','palette.js','device-profile.js','realistic-hiker.js'])assert.ok(!files.includes(f),`src/lounge/${f} 복사본이 있으면 안 된다`);
});
test('회사원 옷 부품(깃·넥타이·라펠·누빔)은 앞면이 바깥을 보고 몸통 근처에 붙는다',async()=>{
 const {buildParts}=await import('../src/lounge/outfit.js');
 for(const o of Object.values(OUTFITS)){
  const g=buildParts(o.parts),p=g.attributes.position,n=g.attributes.normal,ix=g.index;
  assert.ok(ix.count>0,`${o.label} 부품 없음`);
  for(let i=0;i<p.count*3;i++)assert.ok(Number.isFinite(p.array[i])&&Number.isFinite(n.array[i]),`${o.label} 숫자 아님`);
  let bad=0;const v=k=>[p.getX(k),p.getY(k),p.getZ(k)];
  for(let t=0;t<ix.count;t+=3){const [a,b,c]=[ix.getX(t),ix.getX(t+1),ix.getX(t+2)].map(v);
   const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],f=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
   const k=ix.getX(t);if(f[0]*n.getX(k)+f[1]*n.getY(k)+f[2]*n.getZ(k)<0)bad++;}
  assert.ok(bad/(ix.count/3)<.02,`${o.label} 뒤집힌 면 ${bad}`);
  g.computeBoundingBox();const box=g.boundingBox;assert.ok(box.max.y<.53&&box.min.y>.1&&box.max.z<.2,`${o.label} 부품이 몸통 밖으로 나감`);
 }
});
