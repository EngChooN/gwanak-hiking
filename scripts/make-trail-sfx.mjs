// 즐길거리 효과음 합성기(2026-11-06, 산디자인). 외부 녹음·샘플 없이 수식으로만 만든다(자체 제작, CC0로 배포).
// 실행: node scripts/make-trail-sfx.mjs → public/sounds/trail/*.wav + sfx-stats.json
// 같은 씨앗(seed)이라 몇 번을 돌려도 같은 바이트가 나온다. 소리를 바꾸면 이 파일만 고치고 다시 돌린다.
//  radio-ppongjjak-loop  산스장 라디오 뽕짝(8마디 2/4, 자작 선율, AM 라디오처럼 걸러 냄) · 이음매 없는 반복
//  airgun-hiss           에어건 '펑 + 치이이익'
//  squirrel-squeak       다람쥐 '찍찍'
//  cat-meow              고양이 '야옹'(성대 톱니파 + 입모양 공명 '이→아→옹')
//  magpie-caw            까치 '깍깍'(거친 두 번)
//  choco-crunch          초콜릿 '바삭'(두 입)
//  soul-whoo             벤치 영혼 '후우'(숨소리 + 낮게 떨리는 휘파람)
//  pant-huff             ⑥ 헥헥 숨소리(입 벌린 날숨·들숨 두 쌍)
//  cramp-zap             ⑥ 쥐 '찌릿'(전기 지직 + 위로 튀는 띵)
//  cramp-scream          ⑥ 쥐 비명 '으아아!'(만화풍, 높게 꺾였다 떨며 내려옴)
//  cramp-roll            ⑥ 뒹구는 소리(흙·풀 위 몸 구르는 쓸림 두 번 + 둔탁한 툭)
//  hare-munch            ⑦ 토끼 풀 뜯기 '사각사각'(작은 잎 끊는 소리 세 번)
//  hare-thump            ⑦ 토끼 뒷발 구르기 '툭'(낮고 짧게 한 번)
//  hare-rustle           ⑦ 토끼 달아날 때 풀잎 스침
import {mkdirSync,writeFileSync} from 'node:fs';

const OUT='public/sounds/trail/';
const TAU=Math.PI*2;
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const mtof=m=>440*2**((m-69)/12);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,u)=>a+(b-a)*u;
const smooth=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};

// RBJ 쌍2차 필터. set()으로 주파수를 바꿀 수 있어 입모양이 바뀌는 소리(야옹)에 쓴다.
class BQ{
 constructor(type,sr,f,Q=.707){this.type=type;this.sr=sr;this.x1=this.x2=this.y1=this.y2=0;this.set(f,Q);}
 set(f,Q=this.Q){this.Q=Q;const w=TAU*clamp(f,10,this.sr*.45)/this.sr,c=Math.cos(w),s=Math.sin(w),a=s/(2*Q);let b0,b1,b2;
  if(this.type==='lp'){b0=(1-c)/2;b1=1-c;b2=b0;}else if(this.type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=b0;}else{b0=a;b1=0;b2=-a;}
  const a0=1+a;this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=-2*c/a0;this.a2=(1-a)/a0;return this;}
 run(x){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
// 띠 제한 톱니파(배음을 나이퀴스트 아래까지만 더한다)
const saw=(ph,f,sr,maxH=40)=>{let s=0;const n=Math.min(maxH,Math.floor(sr*.45/Math.max(f,1)));for(let k=1;k<=n;k++)s+=Math.sin(ph*k)/k;return s*.6;};
const square=(ph,f,sr,maxH=25)=>{let s=0;const n=Math.min(maxH,Math.floor(sr*.45/Math.max(f,1)));for(let k=1;k<=n;k+=2)s+=Math.sin(ph*k)/k;return s*.8;};

function finish(name,buf,sr,{peakDb=-3,fade=.004,loop=false}={}){
 let mean=0;for(const v of buf)mean+=v;mean/=buf.length;for(let i=0;i<buf.length;i++)buf[i]-=mean;
 if(!loop){const n=Math.floor(fade*sr);for(let i=0;i<n&&i<buf.length;i++){const g=i/n;buf[i]*=g;buf[buf.length-1-i]*=g;}}
 let peak=0;for(const v of buf)peak=Math.max(peak,Math.abs(v));const k=10**(peakDb/20)/(peak||1);
 let sum=0;for(let i=0;i<buf.length;i++){buf[i]*=k;sum+=buf[i]*buf[i];}
 // 16비트 모노 WAV
 const data=Buffer.alloc(44+buf.length*2);data.write('RIFF',0);data.writeUInt32LE(36+buf.length*2,4);data.write('WAVE',8);data.write('fmt ',12);
 data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write('data',36);data.writeUInt32LE(buf.length*2,40);for(let i=0;i<buf.length;i++)data.writeInt16LE(Math.round(clamp(buf[i],-1,1)*32767),44+i*2);
 writeFileSync(OUT+name+'.wav',data);
 const seam=loop?Math.abs(buf[0]-buf[buf.length-1]):null;
 return {file:name+'.wav',seconds:+(buf.length/sr).toFixed(3),sampleRate:sr,bytes:data.length,peakDb,rmsDb:+(10*Math.log10(sum/buf.length)).toFixed(1),...(loop?{loop:true,seam:+seam.toFixed(4)}:{})};
}

// ── 다람쥐 '찍찍': 짧고 높은 지저귐 두 번(위로 튀었다 내려옴 + 빠른 떨림)
function squeak(){const sr=44100,L=Math.floor(.34*sr),b=new Float32Array(L),r=rng(11);let ph=0;
 for(const [t0,len,f0,amp] of [[0,.062,4300,1],[.115,.07,4700,.9]])for(let i=0;i<len*sr;i++){const t=i/sr,u=t/len,j=Math.floor(t0*sr)+i;if(j>=L)break;
  const f=f0+1400*Math.sin(Math.PI*u)+260*Math.sin(TAU*62*t);ph+=TAU*f/sr;
  const env=Math.min(1,t/.004)*(1-u)**1.6;b[j]+=amp*env*(Math.sin(ph)+.22*Math.sin(2*ph)+.05*(r()*2-1));}
 return finish('squirrel-squeak',b,sr);}

// ── 고양이 '야옹': 성대(톱니) → 입모양 공명 3개. '이(야)'에서 '아'로 열렸다가 '옹'으로 닫힌다.
function meow(){const sr=44100,L=Math.floor(.78*sr),b=new Float32Array(L),r=rng(23);
 const F=[new BQ('bp',sr,400,7),new BQ('bp',sr,2200,8),new BQ('bp',sr,3100,9)],nose=new BQ('lp',sr,4000,.7);let ph=0;
 const key=[[0,520,380,2300],[.13,720,950,1550],[.42,660,820,1300],[.66,430,480,850],[.78,400,420,800]]; // [초, 음높이, F1, F2]
 const at=t=>{let k=0;while(k<key.length-2&&key[k+1][0]<=t)k++;const [a,b2]=[key[k],key[k+1]],u=smooth((t-a[0])/(b2[0]-a[0]));return [lerp(a[1],b2[1],u),lerp(a[2],b2[2],u),lerp(a[3],b2[3],u)];};
 for(let i=0;i<L;i++){const t=i/sr,[p,f1,f2]=at(t);if(i%32===0){F[0].set(f1);F[1].set(f2);nose.set(lerp(4200,1600,smooth((t-.5)/.25)));}
  const f=p*(1+.018*Math.sin(TAU*6*t)*smooth((t-.15)/.2));ph+=TAU*f/sr;
  const src=saw(ph,f,sr,24)+.12*(r()*2-1);const env=smooth(t/.05)*(1-smooth((t-.5)/.27))*(.85+.15*Math.sin(Math.PI*clamp(t/.4,0,1)));
  b[i]=nose.run(F[0].run(src)*1+F[1].run(src)*.65+F[2].run(src)*.25)*env;}
 return finish('cat-meow',b,sr);}

// ── 까치 '깍깍': 거칠게 긁는 두 번(톱니 + 잡음, 빠른 거칠기 떨림)
function caw(){const sr=44100,L=Math.floor(.42*sr),b=new Float32Array(L),r=rng(37);
 for(const [t0,f0] of [[0,1150],[.17,1060]]){const A=new BQ('bp',sr,1900,2.2),B=new BQ('bp',sr,3300,3),H=new BQ('hp',sr,700,.7);let ph=0;
  for(let i=0;i<.12*sr;i++){const t=i/sr,j=Math.floor(t0*sr)+i;if(j>=L)break;const f=f0*(1-.12*t/.12);ph+=TAU*f/sr;
   const rough=.55+.45*Math.sin(TAU*95*t);const src=(saw(ph,f,sr,16)*.7+(r()*2-1)*.55)*rough;
   const env=Math.min(1,t/.006)*(1-t/.12)**1.2;b[j]+=H.run(A.run(src)*1.2+B.run(src)*.7)*env;}}
 return finish('magpie-caw',b,sr);}

// ── 초콜릿 '바삭': 두 입. 한 입마다 잘게 부서지는 딸깍 수십 개 + 낮은 '딱'
function crunch(){const sr=44100,L=Math.floor(.5*sr),b=new Float32Array(L),r=rng(41);
 for(const [t0,amp] of [[0,1],[.23,.8]]){const low=new BQ('bp',sr,420,1.5);
  for(let i=0;i<.03*sr;i++){const j=Math.floor(t0*sr)+i;b[j]+=amp*.9*low.run(r()*2-1)*Math.exp(-i/sr/.008);}
  for(let c=0;c<30;c++){const ct=t0+(r()**1.7)*.085,len=.0015+r()*.0035,f=1800+r()*4200,bp=new BQ('bp',sr,f,1.4+r()*2),a=amp*(.35+r()*.65)*(1-(ct-t0)/.11);
   for(let i=0;i<len*sr;i++){const j=Math.floor(ct*sr)+i;if(j>=L)break;b[j]+=a*bp.run(r()*2-1)*Math.exp(-i/sr/(len*.35));}}}
 return finish('choco-crunch',b,sr);}

// ── 영혼 '후우': 입술 오므린 숨(잡음 → '우' 공명) + 낮게 떨며 내려가는 유령 휘파람
function whoo(){const sr=44100,L=Math.floor(1.6*sr),b=new Float32Array(L),r=rng(53);
 const F1=new BQ('bp',sr,330,3),F2=new BQ('bp',sr,780,4),lp=new BQ('lp',sr,1400,.7);let ph=0;
 for(let i=0;i<L;i++){const t=i/sr,env=smooth(t/.28)*(1-smooth((t-.7)/.85));
  const breath=lp.run(F1.run(r()*2-1)*1.4+F2.run(r()*2-1)*.8+(r()*2-1)*.05);
  const f=lerp(560,360,smooth(t/1.5))*(1+.025*Math.sin(TAU*5.2*t));ph+=TAU*f/sr;
  b[i]=(breath*1+(Math.sin(ph)+.15*Math.sin(2*ph))*.11*smooth((t-.12)/.3))*env;}
 return finish('soul-whoo',b,sr,{fade:.02});}

// ── 에어건 '펑 + 치이이익': 낮은 '펑' 뒤 날카로운 공기 쉿소리가 1초쯤 이어지다 '익' 하고 끊긴다
function airgun(){const sr=44100,L=Math.floor(1.45*sr),b=new Float32Array(L),r=rng(67);
 const thump=new BQ('lp',sr,220,.9),hp=new BQ('hp',sr,2400,.7),bp=new BQ('bp',sr,6200,.9),end=new BQ('bp',sr,6000,5);let flut=0;
 for(let i=0;i<L;i++){const t=i/sr,n=r()*2-1;
  b[i]+=thump.run(n)*3.2*Math.exp(-t/.045);                                     // 펑
  if(i%64===0)flut=.82+.18*r();                                                  // 공기 흔들림
  const body=smooth(t/.02)*(1-smooth((t-1.08)/.1))*(1-.18*smooth(t/1.1))*flut;   // 치이이이…
  b[i]+=(hp.run(n)*.55+bp.run(n)*.9)*body;
  if(t>1.04&&t<1.3){end.set(lerp(6000,8600,(t-1.04)/.26));b[i]+=end.run(n)*1.6*Math.sin(Math.PI*(t-1.04)/.26)**2;} // …익
 }
 return finish('airgun-hiss',b,sr);}

// ── 산스장 라디오 뽕짝: 2/4박 '쿵짝', 8마디(8초) 자작 선율. 요나누키 단음계(라·시·도·미·파)와 꺾는 소리.
// 두 바퀴를 그려 둘째 바퀴만 남기므로(첫 바퀴 꼬리가 앞에 겹침) 이음매 없이 돈다.
function radio(){const sr=22050,BAR=1,L=8*BAR*sr,b=new Float32Array(L*2),r=rng(79);const E8=BAR/4;
 const chords=['Am','Am','Dm','Am','Am','E','E','Am'],ROOT={Am:45,Dm:50,E:40},TONES={Am:[57,60,64],Dm:[57,62,65],E:[56,59,64]};
 const mel=[[76,2],[77,1],[76,1], [72,1],[71,1],[69,2], [77,2],[76,1],[72,1], [76,4], [81,2],[77,1],[76,1], [77,1],[76,1],[71,2], [71,2],[72,1],[71,1], [69,4]];
 const add=(t,fn,len)=>{const s=Math.floor(t*sr);for(let i=0;i<len*sr;i++){const j=s+i;if(j>=b.length)break;b[j]+=fn(i/sr);}};
 for(let cyc=0;cyc<2;cyc++){const T=cyc*8*BAR;
  chords.forEach((ch,bar)=>{const t=T+bar*BAR;
   // 쿵(1박): 킥 + 근음 / 짝(2박): 스네어 + 5음
   add(t,x=>Math.sin(TAU*(50*x+60*.04*(1-Math.exp(-x/.04))))*Math.exp(-x/.09)*.9,.3);
   const sn=new BQ('bp',sr,1900,.9);add(t+BAR/2,x=>(sn.run(r()*2-1)*1.3+Math.sin(TAU*190*x)*.3)*Math.exp(-x/.07)*.55,.22);
   for(const [k,m] of [[0,ROOT[ch]],[1,ROOT[ch]+7]]){const f=mtof(m);let p=0;add(t+k*BAR/2,x=>{p+=TAU*f/sr;return (Math.sin(p)*.8+square(p,f,sr,6)*.25)*Math.min(1,x/.01)*Math.exp(-x/.28)*.75;},.45);}
   // 반주 '짝짝'(뒷 8분음표마다 짧은 오르간 화음)
   for(const k of [1,3]){const f0=TONES[ch].map(mtof),ps=[0,0,0];add(t+k*E8,x=>{let s=0;f0.forEach((f,q)=>{ps[q]+=TAU*f*1.003/sr;s+=square(ps[q],f,sr,9);});return s*.16*Math.min(1,x/.006)*Math.exp(-x/.07);},.16);}
   // 하이햇
   for(let k=0;k<4;k++){const hh=new BQ('hp',sr,7000,.7);add(t+k*E8,()=>hh.run(r()*2-1),.03);}
  });
  // 전자올겐 선율: 길게 끄는 음은 반음 아래에서 꺾어 올라가고, 끌수록 떨림이 커진다
  let at=T;for(const [m,n] of mel){const len=n*E8,f=mtof(m),bend=n>=2;let p=0;
   add(at,x=>{const glide=bend?2**(-(1-smooth(x/.07))/12):1,vib=1+.012*Math.sin(TAU*5.6*x)*smooth((x-.12)/.25);const ff=f*glide*vib;p+=TAU*ff/sr;
    return (square(p,ff,sr,10)*.5+saw(p,ff,sr,10)*.5)*Math.min(1,x/.012)*(1-smooth((x-(len-.05))/.05))*.42;},len);at+=len;}
 }
 // AM 라디오: 좁은 대역 + 살짝 찌그러짐 + 잡음 + 느린 출렁임(주기 2초 = 8초에 네 번이라 이음매에서 맞는다)
 const hp=new BQ('hp',sr,380,.7),hp2=new BQ('hp',sr,380,.7),lp=new BQ('lp',sr,3000,.8),lp2=new BQ('lp',sr,3000,.8),hiss=new BQ('bp',sr,2500,.6),out=new Float32Array(L);
 for(let i=0;i<b.length;i++){const t=i/sr;let y=lp2.run(lp.run(hp2.run(hp.run(b[i]))));y=Math.tanh(y*2.2)/Math.tanh(2.2);y=y*(1+.05*Math.sin(TAU*.5*t))+hiss.run(r()*2-1)*.02;if(i>=L)out[i-L]=y;}
 return finish('radio-ppongjjak-loop',out,sr,{peakDb:-4,loop:true});}

mkdirSync(OUT,{recursive:true});
// ── ⑥ 헥헥: 입 벌린 '하' 숨. 날숨(세게)·들숨(약하게) 두 쌍. 성대 소리 없이 걸러 낸 잡음만.
function pant(){const sr=44100,L=Math.floor(1.0*sr),b=new Float32Array(L),r=rng(89);
 for(const [t0,len,amp,f1,f2] of [[0,.17,1,850,1500],[.2,.13,.45,700,1900],[.46,.17,.95,820,1450],[.66,.13,.42,680,1850]]){
  const A=new BQ('bp',sr,f1,2.2),B=new BQ('bp',sr,f2,3),H=new BQ('hp',sr,300,.7);
  for(let i=0;i<len*sr;i++){const t=i/sr,u=t/len,j=Math.floor(t0*sr)+i;if(j>=L)break;
   const env=smooth(u/.18)*(1-smooth((u-.45)/.55));const n=r()*2-1;b[j]+=amp*H.run(A.run(n)*1.2+B.run(n)*.7)*env;}}
 return finish('pant-huff',b,sr,{peakDb:-6,fade:.01});}

// ── ⑥ 찌릿: 전기 지직(빠르게 끊기는 사각파 + 잡음) 0.25초 → 위로 튀는 짧은 '띵'
function zap(){const sr=44100,L=Math.floor(.42*sr),b=new Float32Array(L),r=rng(97);const hp=new BQ('hp',sr,900,.7),bp=new BQ('bp',sr,3200,1.2);let ph=0,ph2=0,gate=1;
 for(let i=0;i<L;i++){const t=i/sr;if(i%220===0)gate=r()<.72?1:.15;
  if(t<.26){const f=lerp(1500,700,t/.26)*(1+.3*(r()-.5));ph+=TAU*f/sr;const env=Math.min(1,t/.004)*(1-smooth((t-.18)/.08));
   b[i]+=hp.run(square(ph,f,sr,14)*.55+bp.run(r()*2-1)*1.1)*gate*env;}
  if(t>.2){const u=t-.2,f=lerp(1900,3400,smooth(u/.06));ph2+=TAU*f/sr;b[i]+=Math.sin(ph2)*.32*Math.min(1,u/.005)*Math.exp(-u/.07);}}
 return finish('cramp-zap',b,sr,{peakDb:-4});}

// ── ⑥ 비명 '으아아!': 만화풍. '으'(입 좁게)에서 '아'로 열리며 높게 꺾였다가 떨며 내려온다. 성대(톱니) → 입모양 공명.
function scream(){const sr=44100,L=Math.floor(1.05*sr),b=new Float32Array(L),r=rng(103);
 const F=[new BQ('bp',sr,350,6),new BQ('bp',sr,1300,7),new BQ('bp',sr,2700,8)];let ph=0;
 const key=[[0,330,340,1500],[.09,420,700,1250],[.22,560,880,1300],[.6,500,850,1250],[1.05,300,700,1150]]; // [초, 음높이, F1, F2]
 const at=t=>{let k=0;while(k<key.length-2&&key[k+1][0]<=t)k++;const [a,c]=[key[k],key[k+1]],u=smooth((t-a[0])/(c[0]-a[0]));return [lerp(a[1],c[1],u),lerp(a[2],c[2],u),lerp(a[3],c[3],u)];};
 for(let i=0;i<L;i++){const t=i/sr,[p,f1,f2]=at(t);if(i%32===0){F[0].set(f1);F[1].set(f2);}
  const f=p*(1+.045*Math.sin(TAU*7.5*t)*smooth((t-.25)/.2));ph+=TAU*f/sr;
  const src=saw(ph,f,sr,22)+.18*(r()*2-1);const env=smooth(t/.04)*(1-smooth((t-.7)/.33));
  b[i]=(F[0].run(src)+F[1].run(src)*.7+F[2].run(src)*.3)*env;}
 return finish('cramp-scream',b,sr,{peakDb:-5,fade:.01});}

// ── ⑥ 뒹굴뒹굴: 흙·풀 위를 몸이 구르는 쓸림 두 번(왼→오) + 등·어깨 닿는 둔탁한 '툭'
function roll(){const sr=44100,L=Math.floor(1.5*sr),b=new Float32Array(L),r=rng(109);
 for(const [t0,len,amp] of [[0,.6,1],[.75,.6,.9]]){const sw=new BQ('bp',sr,1100,.9),hp=new BQ('hp',sr,250,.7),thud=new BQ('lp',sr,140,.9);let crack=0;
  for(let i=0;i<len*sr;i++){const t=i/sr,u=t/len,j=Math.floor(t0*sr)+i;if(j>=L)break;const n=r()*2-1;
   if(i%40===0){sw.set(lerp(700,1600,Math.sin(Math.PI*u)));crack=r()<.06?1:crack*.3;}  // 풀잎 바스락
   const body=Math.sin(Math.PI*u)**1.5*(.75+.25*Math.sin(TAU*9*t));
   b[j]+=amp*(hp.run(sw.run(n))*1.2*body+n*.25*crack*body);
   b[j]+=amp*thud.run(n)*4*Math.exp(-Math.max(0,t-.04)/.05)*(t>.04?1:0);}}
 return finish('cramp-roll',b,sr,{peakDb:-6,fade:.01});}

// ── ⑦ 토끼 풀 뜯기 '사각사각': 잎을 끊는 짧고 마른 잡음 세 번(앞니로 끊는 높은 딱 + 잎이 스치는 짧은 쉿)
function munch(){const sr=44100,L=Math.floor(.8*sr),b=new Float32Array(L),r=rng(113);
 for(const [t0,amp] of [[.02,1],[.27,.85],[.52,.95]]){const bp=new BQ('bp',sr,3600,1.6),hp=new BQ('hp',sr,1500,.7);
  for(let c=0;c<9;c++){const ct=t0+(r()**1.4)*.12,len=.002+r()*.004,f=2400+r()*3800,cb=new BQ('bp',sr,f,2+r()*2),a=amp*(.4+r()*.6);
   for(let i=0;i<len*sr;i++){const j=Math.floor(ct*sr)+i;if(j>=L)break;b[j]+=a*cb.run(r()*2-1)*Math.exp(-i/sr/(len*.4));}}
  for(let i=0;i<.13*sr;i++){const j=Math.floor(t0*sr)+i;if(j>=L)break;const u=i/(.13*sr);b[j]+=amp*.35*hp.run(bp.run(r()*2-1))*Math.sin(Math.PI*u);}}
 return finish('hare-munch',b,sr,{peakDb:-6});}
// ── ⑦ 토끼 뒷발 '툭': 땅을 한 번 치는 낮은 울림(70→45Hz) + 흙 튀는 짧은 잡음
function thump(){const sr=44100,L=Math.floor(.22*sr),b=new Float32Array(L),r=rng(127);const lp=new BQ('lp',sr,900,.8);let ph=0;
 for(let i=0;i<L;i++){const t=i/sr,f=lerp(72,45,smooth(t/.12));ph+=TAU*f/sr;
  b[i]=Math.sin(ph)*Math.exp(-t/.045)*smooth(t/.003)+lp.run(r()*2-1)*.5*Math.exp(-t/.012);}
 return finish('hare-thump',b,sr,{peakDb:-4,fade:.006});}
// ── ⑦ 토끼 풀잎 스침: 0.4초 동안 풀이 쓸리는 바스락(띠 잡음, 가운데가 가장 큼)
function rustle(){const sr=44100,L=Math.floor(.42*sr),b=new Float32Array(L),r=rng(131);const sw=new BQ('bp',sr,2200,.8),hp=new BQ('hp',sr,600,.7);let crack=0;
 for(let i=0;i<L;i++){const t=i/sr,u=t/.42;if(i%60===0){sw.set(lerp(1500,3200,Math.sin(Math.PI*u)));crack=r()<.12?1:crack*.4;}
  const n=r()*2-1,env=Math.sin(Math.PI*Math.min(1,u))**1.2*(.7+.3*Math.sin(TAU*14*t));b[i]=(hp.run(sw.run(n))*1.3+n*.2*crack)*env;}
 return finish('hare-rustle',b,sr,{peakDb:-6,fade:.01});}

const stats=[radio(),airgun(),squeak(),meow(),caw(),crunch(),whoo(),pant(),zap(),scream(),roll(),munch(),thump(),rustle()];
writeFileSync(OUT+'sfx-stats.json',JSON.stringify({made:'scripts/make-trail-sfx.mjs',license:'CC0 1.0 (산디자인 자체 합성, 외부 녹음·샘플 없음)',files:stats},null,1)+'\n');
for(const s of stats)console.log(`${s.file.padEnd(28)} ${String(s.seconds).padStart(6)}s ${String(Math.round(s.bytes/1024)).padStart(4)}KB rms ${s.rmsDb}dB${s.loop?` 이음매 ${s.seam}`:''}`);
