// 카툰 바위 명암(3단계 재작업, 산풍경): 지형 암반(materials.js)과 바위 부품(nature.js)이 함께 쓴다.
// 카툰 2차 재판정(야숨 참고 04_19·04_20)부터 바위 칠은 trcPaint(회색 바탕 + 어두운 얼룩 + 이끼)로 통일하고,
// 지형 암벽·계곡 암반은 다시 둥근 암괴(trcBump, 갈라짐 선은 긋지 않음)를 쓴다. trcFacet은 남겨 둔다.
//  - 둥근 암괴: 3D 셀(보로노이) 중심에서 바깥으로 기우는 법선을 더해, 한 면 단색 벽이 둥근 덩어리 여러 개로 갈라져 보이게 한다.
//    셀은 세로로 길어 덩어리 사이 경계(갈라짐)가 주로 세로로 선다.
//  - 그늘 면: 해를 등진 면은 직사광을 크게 줄여 밝은 면(#a9a892)과 녹청 그늘(#54665e)로 두 톤이 나뉘게 한다.
// 먼 곳(셀이 픽셀보다 잘아짐)은 굴곡·갈라짐을 접는다.
export const ROCK_CELL_GLSL=`
float trcOcc=1.;
vec3 trcHash3(vec3 p){p=mod(p,289.);p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453);}
// xyz: 셀 중심 → 이 점(셀 단위)을 가까운 셀끼리 부드럽게 섞은 값(경계에서 법선이 꺾이지 않고 둥근 골이 된다),
// w: 두 번째로 가까운 셀과의 거리 차(경계에서 0).
vec4 trcCells(vec3 p){
 vec3 i=floor(p),f=fract(p),acc=vec3(0.);float d1=8.,d2=8.,ws=0.;
 for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 g=vec3(float(x),float(y),float(z)),r=g+trcHash3(i+g)*.8+.1-f;float d=dot(r,r),w=exp(-13.*d);
  acc-=r*w;ws+=w;
  if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
 }
 return vec4(acc/max(ws,1e-5),sqrt(d2)-sqrt(d1));
}
// px: 한 픽셀이 덮는 월드 크기(m). 거리와 보는 각도로 매끄럽게 어림한다(화면 높이 약 800px, 시야 60°).
// fwidth로 재면 옆으로 누운 면에서 2×2 픽셀마다 값이 튀어 점무늬가 생긴다.
float trcPixel(vec3 wp,vec3 wn){vec3 v=wp-cameraPosition;float d=length(v);return d*.0014/max(abs(dot(v/d,wn)),.15);}
// 셀 경계를 둥글게: 찾는 자리를 매끄러운 값 잡음으로 흔든다(직선 경계 → 굽은 경계, 보도블록·육각 판처럼 읽히지 않게).
vec3 trcWarp(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(trcHash3(i),trcHash3(i+vec3(1,0,0)),f.x),mix(trcHash3(i+vec3(0,1,0)),trcHash3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(trcHash3(i+vec3(0,0,1)),trcHash3(i+vec3(1,0,1)),f.x),mix(trcHash3(i+vec3(0,1,1)),trcHash3(i+vec3(1,1,1)),f.x),f.y),f.z)-.5;}
// wn: 월드 법선, cell: 셀 크기(m), amt: 굴곡 세기. crack: 덩어리 사이 갈라짐(0~1, 가는 선).
// 덩어리는 반구(둥근 암괴): 중심에서 멀수록 법선이 크게 기울어, 밝은 면·그늘 면 경계가 직선이 아니라 둥근 호가 된다.
// 셀이 픽셀보다 잘아지면(먼 곳·옆으로 누운 면) 갈라짐부터, 이어 굴곡을 접어 점무늬(계단 잡음)를 막는다.
vec3 trcBump(vec3 wp,vec3 wn,vec3 cell,float amt,float px,out float crack){
 float k=px/cell.x,near=1.-smoothstep(.06,.25,k);crack=0.;
 if(near<=0.)return wn;
 vec3 q=wp/cell,wv=trcWarp(q*.55+3.1);q+=wv*.75;
 vec4 c=trcCells(q);
 vec3 dome=c.xyz*(cell.x/cell);dome-=wn*dot(dome,wn);
 vec3 o=dome*amt*near*1.35;
 // 가까이는 작은 혹(셀의 0.4배)을 한 겹 더 얹는다. 발밑에서 큰 덩어리 하나가 평평한 판으로 읽히지 않게.
 float k2=k/.4,near2=1.-smoothstep(.06,.2,k2);
 if(near2>0.){vec4 c2=trcCells(q/.4+7.3);vec3 d2=c2.xyz*(cell.x/cell);d2-=wn*dot(d2,wn);o+=d2*amt*near2*.75;}
 float o2=min(dot(o,o),.86);
 float w=max(.006,k*1.2),at=.012;
 // 갈라짐은 모든 경계에 긋지 않고 몇 셀 길이씩 끊는다(돌담·포석 그물처럼 읽히지 않게).
 crack=(1.-smoothstep(at-w,at+w,c.w))*(1.-smoothstep(.012,.04,k))*smoothstep(-.06,.1,wv.y);
 // 덩어리 사이 골은 넓고 부드럽게 어둡게(접촉 그늘): 평평한 바닥에서도 혹이 솟아 보이게 한다.
 trcOcc=mix(1.,mix(.74,1.,smoothstep(.0,.32,c.w)),near);
 return normalize(o+wn*sqrt(1.-o2));
}
// 각진 면(카툰 2차, 「야생의 숨결」 절벽): 셀마다 한 방향으로 기운 평평한 면. 셀 안에서는 법선이 일정해서
// 경계가 갈라짐 선이 아니라 명암이 꺾이는 모서리로 읽힌다(육각 그물 선을 긋지 않는다). id: 셀 난수(붓 방향용).
vec3 trcFacet(vec3 wp,vec3 wn,vec3 cell,float amt,float px,out vec3 id){
 float k=px/cell.x,near=1.-smoothstep(.08,.3,k);id=vec3(.5);
 if(near<=0.)return wn;
 vec3 q=wp/cell;q+=trcWarp(q*.45+3.1)*.9;
 vec3 i=floor(q),f=fract(q);float d1=8.;vec3 best=i;
 for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 g=vec3(float(x),float(y),float(z)),r=g+trcHash3(i+g)*.8+.1-f;float d=dot(r,r);
  if(d<d1){d1=d;best=i+g;}
 }
 id=trcHash3(best*1.37+11.);
 vec3 t=id-.5;t.y*=.6;t-=wn*dot(t,wn);
 return normalize(wn+t*amt*near*1.5);
}
// 야숨 바위 칠(카툰 2차 재판정, 참고 04_19·04_20·04_09): 회색 바탕에 크고 작은 어두운 녹회 얼룩(빗물 자국처럼 세로로 조금 길다),
// 얼룩 사이 밝은 회백 결, 위를 향한 면과 얼룩 속 이끼. 선(갈라짐·띠)은 긋지 않는다. 얼룩이 픽셀보다 잘아지면 접는다.
// mossAmt: 이끼 양(0 = 윗면 일부, 높을수록 넓게). moss: 이끼 덮임(0~1, 그늘 면 계산에서 뺀다).
float trcFadeAt(float px,float size){return 1.-smoothstep(.2,.7,px/size);}
vec3 trcPaint(vec3 wp,vec3 wn,vec3 base,vec3 dark,vec3 mossC,vec3 mossD,float px,float mossAmt,out float moss){
 vec3 q=wp*vec3(1.,.5,1.);
 float fm=trcFadeAt(px,1.),ff=trcFadeAt(px,.38);
 float big=trcWarp(q*.28+1.3).x+trcWarp(q*.66+6.7).y*.5,mid=trcWarp(q*1.1+4.1).y,fine=trcWarp(q*2.6+8.2).z;
 float n=big*.5+mid*.38*fm+fine*.2*ff;
 // 얼룩 가장자리는 짧은 붓 끝처럼 또렷하게(흐린 연기처럼 번지지 않게), 안쪽은 두 단(짙은 얼룩·중간 얼룩).
 float blot=smoothstep(.0,.03,n),deep=smoothstep(.16,.2,n+fine*.25*ff);
 vec3 col=mix(base*1.06,mix(base,dark,.62),blot);col=mix(col,dark*.92,deep*.5);
 col*=1.+smoothstep(-.1,-.16,n)*.08+(fine*.3+mid*.12)*ff;
 // 이끼: 위를 향한 면은 넓게, 급한 면도 얼룩 따라 군데군데(참고 04_09·04_19 벽면의 녹색 이끼).
 float mn=trcWarp(wp*.37+12.).x+trcWarp(wp*1.25+3.).y*.45;
 // 위를 향한 면도 전부 덮지 않고 얼룩진다(평평한 암반 바닥이 통째로 초록이 되지 않게). mossAmt 0이면 윗면 약 45%, 옆면 약 15%.
 moss=smoothstep(.0,.05,mn*.9+wn.y*.25-.3+mossAmt+blot*.12+fine*.15*ff);
 // 옆면 이끼는 짙은 이끼색 쪽(밝은 연두 물감이 벽에 튄 것처럼 보이지 않게).
 col=mix(col,mix(mossD,mossC,smoothstep(-.25,.3,mn+fine*.6*ff)*smoothstep(.2,.8,wn.y)),moss);
 return col;
}`;
// 굴곡 법선을 넣기 전의 시점 공간 법선(덩어리가 해에서 얼마나 돌아섰는지 비교용).
export const ROCK_BASE_DECL='vec3 trcBaseN=vec3(0.,0.,1.);';
// 그늘 면: ① 해를 등진 면, ② 덩어리 굴곡이 해 반대쪽으로 기운 면(바탕 면보다 해를 덜 받는 쪽), ③ 바탕 면이 해와 거의 나란한 면.
// 그늘 면의 직사광은 그림자 지도 대신 고른 값(해 빛 × direct)으로 바꾼다. 굴곡 법선이 해를 향해도 바탕 면이 스치는 각이면
// 그림자 지도가 점점이 깨지므로(그림자 여드름) ③을 그늘로 묶는다. 해를 마주한 벽도 덩어리마다 밝은 면·녹청 그늘 면으로 나뉜다(기준 1 : 0.58).
export const rockShadeGLSL=(mask,direct)=>`
#if NUM_DIR_LIGHTS > 0
{
 vec3 trcL=directionalLights[0].direction;float trcNdl=dot(normal,trcL);
 float trcBase=dot(trcBaseN,trcL),trcAway=smoothstep(.08,.3,trcBase-trcNdl);
 float trcShade=max(max(1.-smoothstep(-.08,.22,trcNdl),trcAway),1.-smoothstep(0.,.25,trcBase))*${mask};
 // 툰 단계 안에서도 덩어리 안쪽에 부드러운 명암을 남긴다(한 덩어리가 단색 판으로 읽히지 않게, 둥근 굴곡).
 float trcUp=dot(normal,(viewMatrix*vec4(0.,1.,0.,0.)).xyz);
 reflectedLight.directDiffuse*=mix(1.,mix(.62,1.12,smoothstep(-.1,.85,trcNdl))*trcOcc,${mask});
 reflectedLight.indirectDiffuse*=mix(1.,mix(.72,1.12,trcUp*.5+.5)*trcOcc,${mask});
 reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,BRDF_Lambert(diffuseColor.rgb)*directionalLights[0].color*${direct},trcShade);
}
#endif`;
