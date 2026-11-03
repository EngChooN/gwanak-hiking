// 입력 이미지는 같은 페이지에서 접촉 음영 uniform만 켜고 끈 쌍이다.
export async function contactEdgeMetric(page,before,after){
 const mask=await page.evaluate(()=>hiking.contactEdgeSamples());
 return page.evaluate(async ({before,after,mask})=>{
  const pixels=[];let width;
  for(const encoded of [before,after]){
   const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
   const canvas=document.createElement('canvas');width=canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);pixels.push(ctx.getImageData(0,0,width,image.height).data);
  }
  let sum=0,max=0,over40=0;
  for(const {pixel:[x,y]} of mask.samples){const i=(y*width+x)*4;
   const d=.2126*(pixels[0][i]-pixels[1][i])+.7152*(pixels[0][i+1]-pixels[1][i+1])+.0722*(pixels[0][i+2]-pixels[1][i+2]);
   sum+=Math.max(0,d);max=Math.max(max,d);if(d>40)over40++;
  }
  const mean=mask.samples.length?sum/mask.samples.length:null;
  return {count:mask.samples.length,meanDarkening:mean,max,over40,recommendedMax:3,withinRecommendation:mean===null?null:mean<=3,mask};
 },{before,after,mask});
}
