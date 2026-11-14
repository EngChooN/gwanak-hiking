// 흡연장 효과음 다듬기(2026-11-13, 연디자인). 받은 CC0 원본(design/sounds/lounge/raw/)을 자르고 모아 public/sounds/lounge/ 에 둔다.
// 실행: node scripts/trim-lounge-sfx.mjs  (ffmpeg: /opt/homebrew/bin/ffmpeg)  → lounge-sfx-stats.json 도 같이 쓴다.
// 같은 원본·같은 값이면 같은 결과가 나온다. 소리를 바꾸려면 아래 ITEMS 의 구간(ss·t)과 필터만 고치고 다시 돌린다.
// 다듬는 순서: 구간 자르기(ss·t) → 필터(af) → 겹쳐 쌓기 → 앞쪽 무음 자르기 → (반복 소리는 이음매 크로스페이드) → 끝 페이드 → 피크 -3dB → 모노 44.1k → 인코딩.
// 녹음을 못 구한 소리는 없다(8종 모두 CC0 녹음에서 만들었다). 그래서 합성 스크립트(make-lounge-sfx.mjs)는 만들지 않았다.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,statSync,rmSync} from 'node:fs';

const FF='/opt/homebrew/bin/ffmpeg';
const RAW='design/sounds/lounge/raw/';
const OUT='public/sounds/lounge/';
const TMP='/tmp/lounge-sfx-work/';
const SR=44100;
mkdirSync(OUT,{recursive:true});mkdirSync(TMP,{recursive:true});

// ss: 원본에서 시작(초), t: 길이(초), af: ffmpeg 필터, db: 겹칠 때 음량(dB), at: 겹칠 때 시작 위치(초)
// out: mp3 | flac(반복 소리는 mp3 앞뒤 여백 때문에 이음매가 생겨서 flac)
const AF_FLAME='acompressor=threshold=0.015:ratio=3:attack=2:release=120:makeup=1';
const ITEMS=[
 {name:'lighter-open',out:'mp3',fadeOut:.02,
  src:[{file:'zipclick.flac',ss:.06,t:.2}]},
 {name:'lighter-strike',out:'mp3',fadeOut:.28,
  // 성냥 긋는 '치' 뒤에 붙는 불꽃 소리가 너무 작아서 가볍게 눌러 '화'가 들리게 한다
  // 성냥 원본은 '치' 뒤에 0.3초 빈 틈이 있어, 라이터처럼 붙도록 틈을 줄여 이어 붙인다(.24~.38 '치', .60~1.30 '화')
  src:[{file:'0004.wav',ss:.24,t:.14,af:AF_FLAME},{file:'0004.wav',ss:.6,t:.7,af:AF_FLAME,at:.12}]},
 {name:'cig-burn',out:'flac',loop:.14,
  // 담배 피울 때 종이 타는 지직(소리가 고른 구간 0.5~1.38초). 숨 소리를 덜어 내려고 낮은 쪽을 깎고, 이음매는 .14초 크로스페이드
  src:[{file:'2133.wav',ss:.5,t:.88,af:'highpass=f=700'}]},
 {name:'inhale',out:'mp3',fadeIn:.12,fadeOut:.22,
  src:[{file:'1405.wav',ss:.45,t:1.3,af:'lowpass=f=7000'}]},
 {name:'exhale-short',out:'mp3',fadeIn:.01,fadeOut:.3,
  src:[{file:'1405.wav',ss:1.95,t:.8}]},
 {name:'exhale-mid',out:'mp3',fadeIn:.01,fadeOut:.55,
  src:[{file:'1405.wav',ss:1.95,t:1.7}]},
 {name:'exhale-long',out:'mp3',fadeIn:.01,fadeOut:.7,
  src:[{file:'1404.wav',ss:2.85,t:2.3}]},
 {name:'vending-button',out:'mp3',fadeOut:.03,
  // 버튼 딸깍(휴대폰 키) + 짧은 '삑'(계산대 스캐너 소리를 눌러 부드럽게)
  src:[{file:'0176.wav',ss:0,t:.07},{file:'1417.wav',ss:.07,t:.14,af:'lowpass=f=4500',db:-9,at:.045}]},
 {name:'can-drop',out:'mp3',fadeOut:.22,
  // 빈 캔 떨어짐 '덜컹' + 같은 소리를 낮춰 깔아 '쿵'
  src:[{file:'0249.wav',ss:0,t:.75},{file:'0249.wav',ss:0,t:.4,af:'asetrate=24000,aresample=44100,lowpass=f=420',db:-3,at:0}]},
 {name:'can-open',out:'mp3',fadeOut:.14,
  src:[{file:'0116.wav',ss:.06,t:.67}]},
];

function decode(s){
 const af=[s.af,'aresample='+SR].filter(Boolean).join(',');
 const buf=execFileSync(FF,['-v','error','-ss',String(s.ss),'-t',String(s.t),'-i',RAW+s.file,'-af',af,'-ac','1','-ar',String(SR),'-f','f32le','-'],{maxBuffer:1<<28});
 const a=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length));
 const n=Math.round(.004*SR); // 이어 붙일 때 딱 소리가 나지 않게 조각 끝을 4ms 줄인다
 for(let i=0;i<n&&i<a.length;i++){a[i]*=i/n;a[a.length-1-i]*=i/n;}
 return a;
}
const peakOf=b=>{let p=0;for(const v of b)p=Math.max(p,Math.abs(v));return p;};

function build(it){
 let parts=it.src.map(s=>({s,a:decode(s)}));
 // 겹치기 전에 소리마다 자기 피크를 1로 맞춘 뒤 db만큼 낮춘다
 const len=Math.max(...parts.map(({s,a})=>Math.round((s.at??0)*SR)+a.length));
 let b=new Float32Array(len);
 for(const {s,a} of parts){const k=10**((s.db??0)/20)/(peakOf(a)||1),o=Math.round((s.at??0)*SR);for(let i=0;i<a.length;i++)b[o+i]+=a[i]*k;}
 // 평균(직류) 제거
 let m=0;for(const v of b)m+=v;m/=b.length;for(let i=0;i<b.length;i++)b[i]-=m;
 // 앞쪽 무음 자르기: 피크보다 46dB 낮은 구간(5ms 창)
 let pk=peakOf(b),th=pk*10**(-46/20),w=Math.round(.005*SR),st=0;
 while(st+w<b.length){let q=0;for(let i=0;i<w;i++)q=Math.max(q,Math.abs(b[st+i]));if(q>th)break;st+=w;}
 st=Math.max(0,st-Math.round(.002*SR));b=b.slice(st);
 let loopSeam=null;
 if(it.loop){ // 끝 .12초를 처음 .12초와 겹쳐 이음매 없는 반복으로: [겹친 부분][가운데]
  const X=Math.round(it.loop*SR),L=b.length-X,o=new Float32Array(L);
  for(let i=0;i<X;i++){const u=i/X,gIn=Math.sin(u*Math.PI/2),gOut=Math.cos(u*Math.PI/2);o[i]=b[L+i]*gOut+b[i]*gIn;}
  for(let i=X;i<L;i++)o[i]=b[i];
  b=o;loopSeam=+Math.abs(b[0]-b[b.length-1]).toFixed(4);
 }else{
  const fi=Math.round((it.fadeIn??.003)*SR),fo=Math.round((it.fadeOut??.02)*SR);
  for(let i=0;i<fi&&i<b.length;i++)b[i]*=i/fi;
  for(let i=0;i<fo&&i<b.length;i++)b[b.length-1-i]*=i/fo;
 }
 // 피크 -3dB
 pk=peakOf(b);const k=10**(-3/20)/(pk||1);let sum=0;for(let i=0;i<b.length;i++){b[i]*=k;sum+=b[i]*b[i];}
 return {b,rmsDb:+(10*Math.log10(sum/b.length)).toFixed(1),loopSeam};
}

function wavBytes(b){
 const d=Buffer.alloc(44+b.length*2);d.write('RIFF',0);d.writeUInt32LE(36+b.length*2,4);d.write('WAVE',8);d.write('fmt ',12);
 d.writeUInt32LE(16,16);d.writeUInt16LE(1,20);d.writeUInt16LE(1,22);d.writeUInt32LE(SR,24);d.writeUInt32LE(SR*2,28);d.writeUInt16LE(2,32);d.writeUInt16LE(16,34);
 d.write('data',36);d.writeUInt32LE(b.length*2,40);
 for(let i=0;i<b.length;i++)d.writeInt16LE(Math.round(Math.max(-1,Math.min(1,b[i]))*32767),44+i*2);
 return d;
}

const stats=[];
for(const it of ITEMS){
 const {b,rmsDb,loopSeam}=build(it);
 const wav=TMP+it.name+'.wav';writeFileSync(wav,wavBytes(b));
 const file=it.name+'.'+it.out;
 const enc=it.out==='mp3'?['-c:a','libmp3lame','-b:a','96k']:['-c:a','flac','-compression_level','8'];
 let peakDb=-3;
 execFileSync(FF,['-v','error','-y','-i',wav,'-ac','1','-ar',String(SR),...enc,OUT+file]);
 // mp3는 인코딩하면 피크가 조금 넘칠 수 있어, 풀어 본 값이 -3dB를 넘으면 그만큼 낮춰 다시 만든다
 if(it.out==='mp3'){const dec=()=>{const o=execFileSync(FF,['-v','error','-i',OUT+file,'-f','f32le','-'],{maxBuffer:1<<26});return peakOf(new Float32Array(o.buffer.slice(o.byteOffset,o.byteOffset+o.length)));};
  let over=20*Math.log10(dec())+3;
  for(let n=0;n<4&&over>.05;n++){for(let i=0;i<b.length;i++)b[i]*=10**(-(over+.1)/20);writeFileSync(wav,wavBytes(b));
   execFileSync(FF,['-v','error','-y','-i',wav,'-ac','1','-ar',String(SR),...enc,OUT+file]);over=20*Math.log10(dec())+3;}
  peakDb=+(20*Math.log10(dec())).toFixed(1);}
 stats.push({file,seconds:+(b.length/SR).toFixed(3),sampleRate:SR,bytes:statSync(OUT+file).size,peakDb,rmsDb,...(it.loop?{loop:true,seam:loopSeam}:{}),from:it.src.map(s=>s.file).join('+')});
}
writeFileSync(OUT+'lounge-sfx-stats.json',JSON.stringify(stats,null,1)+'\n');
rmSync(TMP,{recursive:true,force:true});
console.table(stats.map(({file,seconds,bytes,rmsDb,seam})=>({file,seconds,bytes,rmsDb,seam})));
console.log('합계',stats.reduce((a,s)=>a+s.bytes,0),'bytes');
