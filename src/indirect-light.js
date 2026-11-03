import {Color} from 'three';
export const INDIRECT_PROFILE={skyColor:'#C4DAF4',groundColor:'#9A9876',hemisphereIntensity:.5,retainedChroma:.01,terrainChroma:.25};
const sky=new Color(INDIRECT_PROFILE.skyColor),ground=new Color(INDIRECT_PROFILE.groundColor);
const luminance=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
export function groundAlbedo(rgb){const y=luminance(rgb);return rgb.map(v=>y+(v-y)*INDIRECT_PROFILE.terrainChroma);}
// HDRI의 휘도·방향 분포는 유지하고 색 편향만 저채도 회녹/회갈 반사색으로 교정한다.
export function indirectColor(rgb,up){
  const y=luminance(rgb);if(y<=0)return [0,0,0];
  const t=Math.max(0,Math.min(1,(up+1)/2)),tint=[ground.r+(sky.r-ground.r)*t,ground.g+(sky.g-ground.g)*t,ground.b+(sky.b-ground.b)*t],tintY=luminance(tint);
  return rgb.map((v,i)=>INDIRECT_PROFILE.retainedChroma*v+(1-INDIRECT_PROFILE.retainedChroma)*y*tint[i]/tintY);
}
export function neutralizeEnvironment(texture){
  const {data,width,height}=texture.image;
  // RGBE -Y 스캔의 첫 행은 천정. RGBELoader.flipY=true의 equirect UV와 같은 방향이다.
  for(let row=0;row<height;row++){const up=Math.cos((row+.5)/height*Math.PI);for(let col=0;col<width;col++){const i=(row*width+col)*4,c=indirectColor([data[i],data[i+1],data[i+2]],up);data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];}}
  texture.needsUpdate=true;
}
