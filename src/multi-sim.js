// 부하 측정용 가짜 등산객. 실제 경로(JSON 인코딩 → 가짜 방 지연·지터 → 디코딩 → 보간)를 그대로 타도록 각자 허브에 접속해 위치를 10Hz로 보낸다.
// zone 'route': 내 코스 위치 주변을 오가며 걷는다. zone 'plaza'/'summit': 내 주변 반경 3~15m 원을 돈다(한곳에 몰린 최악의 경우).
import {encodeState,NET,FLAG} from './multi-protocol.js';
const rng=seed=>{let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};};
export function createSimCrowd({count,hub,zone='route',local,seedFrom='x',groundHeight}){
 const rnd=rng([...seedFrom].reduce((a,c)=>a*31+c.charCodeAt(0),7)),peers=[];
 const base=local.position();
 for(let i=0;i<count;i++){
  const t=hub.join(),id=`sim${String(i).padStart(2,'0')}`;
  peers.push({id,t,seq:0,acc:rnd()/NET.sendHz,joined:false,dir:rnd()<.5?1:-1,v:1+rnd()*.5,off:-40+rnd()*160,lat:(rnd()-.5)*1.2,r:3+rnd()*12,a:rnd()*Math.PI*2,w:(rnd()<.5?1:-1)*(.08+rnd()*.1),name:`가짜${i+1}`,pos:null});
 }
 let anchorS=base?.s??0;
 function step(p,dt){
  if(zone==='route'&&local.place){
   const me=local.position(),s0=me?.s??anchorS;if(Math.abs(s0-anchorS)>120)anchorS=s0;
   p.off+=p.dir*p.v*dt;if(p.off>150||p.off<-60)p.dir*=-1;
   const s=Math.max(10,anchorS+p.off),[x,,z]=local.place(s,p.lat),[x2,,z2]=local.place(s+p.dir*1.5,p.lat);
   p.pos={zone:'route',x,z,heading:Math.atan2(-(x2-x),-(z2-z)),s,lateral:p.lat};
  }else{
   const me=local.position();p.a+=p.w*dt;const x=me.x+Math.cos(p.a)*p.r,z=me.z+Math.sin(p.a)*p.r,dir=Math.sign(p.w);
   p.pos={zone:me.zone,x,z,heading:Math.atan2(-(-Math.sin(p.a)*dir),-(Math.cos(p.a)*dir)),s:null,lateral:null};
  }
 }
 return {
  update(nowMs,dt){
   dt=Math.min(dt,.1);
   for(const p of peers){
    step(p,dt);p.acc+=dt;
    if(!p.joined){p.joined=true;p.t.send({t:'j',id:p.id,n:p.name,o:peers.indexOf(p)%4},nowMs);}
    if(p.acc>=1/NET.sendHz){p.acc%=1/NET.sendHz;p.t.send(encodeState(p.id,p.seq=(p.seq+1)&0xffff,p.pos,{speed:p.v,flags:0}),nowMs);}
   }
  },
  info:()=>({count:peers.length,zone})
 };
}
