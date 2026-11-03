// rAF 간격으로 실제 속도를 지키고, 동기 대기를 제외한 CPU 작업 시간으로 복귀 여유를 확인한다.
// 화질 단계별 그림자: 낮음=30m·1024(사람·가까운 바위만), 보통=45m·1024, 높음=60m·2048(+AO). 느려지면 step2부터 15m 줄이되 30m 아래로는 내리지 않는다.
export class AdaptiveQuality {
 constructor(cap=2){this.setCap(cap);}
 setCap(cap){
  this.cap=Math.max(0,Math.min(2,Number(cap)||0));this.step=0;
  this.elapsed=0;this.good=0;this.slow=0;this.changes=0;this.totalFrames=0;this.aoFrames=0;
  this.blockedUntil={};this.probe=null;this.decisions=[];this.lastWindow=null;
  this.aoWork={on:{frames:0,ms:0},off:{frames:0,ms:0}};this.renderedAOChanges=0;this.renderedAO=undefined;this.resetWindow();
 }
 resetWindow(){this.sum=0;this.workSum=0;this.count=0;}
 setViewport(key){if(this.viewport!==undefined&&this.viewport!==key)this.setCap(this.cap);this.viewport=key;}
 get settings(){
  const cap=this.cap,step=this.step;
  return {cap,step,targetMs:cap===2?1000/55:33,dpr:[.8,1.15,1.6][cap]*[1,.85,.85,.85,.7][step],
   shadowDistance:Math.max(30,[30,45,60][cap]-(step>=2?15:0)),
   shadowMap:cap===2?2048:1024,
   ao:cap===2&&step<3,quality:cap};
 }
 snapshot(){return {...this.settings,changes:this.changes,totalFrames:this.totalFrames,aoFrames:this.aoFrames,
  renderedAO:this.renderedAO,renderedAOChanges:this.renderedAOChanges,aoWork:{on:{...this.aoWork.on},off:{...this.aoWork.off}},
  blockedSteps:Object.keys(this.blockedUntil).map(step=>({step:Number(step),untilMs:Number.isFinite(this.blockedUntil[step])?this.blockedUntil[step]:null,sessionLocked:!Number.isFinite(this.blockedUntil[step])})),
  lastWindow:this.lastWindow&&{...this.lastWindow},decisions:this.decisions.map(row=>({...row}))};}
 move(next,reason){
  const from=this.step;this.step=next;this.changes++;this.good=this.slow=0;
  this.decisions.push({index:this.changes,atMs:this.elapsed,from,to:next,ao:this.settings.ao,reason,...this.lastWindow});
  if(this.decisions.length>64)this.decisions.shift();return true;
 }
 sample(ms,active=true,workMs=ms,renderedAO=this.settings.ao){
  if(!active||!Number.isFinite(ms)||ms<=0||!Number.isFinite(workMs)||workMs<0){this.resetWindow();this.good=this.slow=0;return false;}
  this.elapsed+=ms;this.totalFrames++;if(renderedAO)this.aoFrames++;
  if(this.renderedAO!==undefined&&this.renderedAO!==renderedAO)this.renderedAOChanges++;
  this.renderedAO=renderedAO;
  const work=this.aoWork[renderedAO?'on':'off'];work.frames++;work.ms+=workMs;
  this.sum+=ms;this.workSum+=workMs;this.count++;
  // 복귀는 별도의 짧은 표본으로 판정한다. 단발 정지는 최소 8프레임으로 희석한다.
  if(this.probe&&this.sum>=250&&this.count>=8){
   const mean=this.sum/this.count;
   if(mean>this.settings.targetMs*1.05){
    this.lastWindow={meanMs:mean,workMeanMs:this.workSum/this.count,step:this.step,frames:this.count};
    this.blockedUntil[this.step]=Infinity;this.probe=null;this.resetWindow();
    return this.move(this.step+1,'짧은 복귀 표본 예산 초과·세션 재시험 잠금');
   }
   // 빠른 기기는 기존 2초 창 3회마다 계속 상향할 수 있다.
   this.probe=null;
  }
  if(this.sum<2000||this.count<20)return false;
  const mean=this.sum/this.count,workMean=this.workSum/this.count,target=this.settings.targetMs;
  this.lastWindow={meanMs:mean,workMeanMs:workMean,step:this.step,frames:this.count};this.resetWindow();
  if(mean>target*1.05){
   this.good=0;
   // 단발성 계측/GC 정지만으로 연쇄 하향하지 않는다. 성능 집계는 원본 그대로 둔다.
   if(++this.slow>=2&&this.step<4){
    // 처음 확인된 비싼 단계도 즉시 재시험하지 않는다.
    this.blockedUntil[this.step]=this.elapsed+300000;
    this.probe=null;return this.move(this.step+1,'지속적인 프레임 예산 초과');
   }
  }else if(mean<=target*.96&&workMean<target*.7){
   this.slow=0;
   // 60Hz 16.7ms에서도 CPU 여유가 있으면 6초 뒤 한 단계씩 시험한다.
   if(this.step>0&&this.elapsed>=(this.blockedUntil[this.step-1]??0)){
    if(++this.good>=3){this.probe={to:this.step-1,atMs:this.elapsed};return this.move(this.step-1,'프레임·CPU 여유에 따른 복귀 시험');}
   }else this.good=0;
  }else this.good=this.slow=0;
  return false;
 }
}
