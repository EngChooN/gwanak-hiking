// design/실사-룩-기준.md. 현장 사진으로 확정하기 전의 렌더러 목표값.
// 태양: 산리서치 docs/경치-참고자료.md §4, 11/3 서울 위도 계산값(고도/방위). 오전은 10시, 오후는 15시.
export const SUN_PRESETS={am:{label:'오전 10시',elevation:29,azimuth:142},pm:{label:'오후 3시',elevation:25,azimuth:224}};
export const LOOK_PROFILE={id:'forest-granite-clear-v3',sunElevation:29,sunAzimuth:142,directSkyRatio:3.2,haze:'#9DBEDF',zenith:'#4A86C8',horizon:'#BAD6EE',sunColor:'#FFF1DE',skyColor:'#CFE0F5',far:30000,
 sky:{turbidity:1.6,rayleigh:3,mieCoefficient:.002,mieDirectionalG:.8,exposure:.3}};
export function sunDirection(elevation=LOOK_PROFILE.sunElevation,azimuth=LOOK_PROFILE.sunAzimuth){const e=elevation*Math.PI/180,a=azimuth*Math.PI/180;return [Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)];}
export function hazeOpticalDepth(d){d=Math.max(0,d);const a=-Math.log(.68),b=-Math.log(.55),c=-Math.log(.25);return d<=8000?a*d/8000:d<=12000?a+(b-a)*(d-8000)/4000:b+(c-b)*(d-12000)/13000;}
export const hazeContrast=d=>Math.exp(-hazeOpticalDepth(d));
// CPU 모델과 아래 GLSL은 같은 거리 앵커를 사용한다. 실제 셰이더도 GPU 프로브로 대조한다.
export const HAZE_FRAGMENT=`
#ifdef USE_FOG
 float d=max(0.0,vFogDepth);
 float a=-log(0.68),b=-log(0.55),c=-log(0.25);
 float tau=d<=8000.0?a*d/8000.0:d<=12000.0?a+(b-a)*(d-8000.0)/4000.0:b+(c-b)*(d-12000.0)/13000.0;
 // 날씨 연무(비·눈·안개·흐림)는 fog.near 슬롯으로 받은 감쇠 계수(1/m)만큼 광학 깊이를 더한다. 0이면 맑은 날 기준 그대로.
 tau+=d*fogNear;
 gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,1.0-exp(-tau));
 // 푸른 연무: 대비 감쇠와 별개로 먼 곳일수록 레일리 산란처럼 하늘색을 얹는다(회색 안개 대신).
 float veil=0.32*(1.0-exp(-d/7000.0));
 gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.40,0.62,0.92)*max(dot(fogColor,vec3(0.2126,0.7152,0.0722))*1.05,0.0)/0.62,veil);
#endif
`;
const srgb=x=>255*(x<=.0031308?12.92*x:1.055*Math.pow(Math.max(0,x),1/2.4)-.055);
export function neutralCard(rgb,exposure){let color=rgb.map(v=>v*exposure),x=Math.min(...color);const offset=x<.08?x-6.25*x*x:.04;color=color.map(v=>v-offset);const peak=Math.max(...color);if(peak>=.76){const d=.24,newPeak=1-d*d/(peak+d-.76),g=1-1/(.15*(peak-newPeak)+1);color=color.map(v=>v*newPeak/peak*(1-g)+newPeak*g);}return color.map(srgb);}
export function exposureForCard(rgb,target=118){let lo=.001,hi=20;for(let i=0;i<48;i++){const mid=(lo+hi)/2,c=neutralCard(rgb,mid),value=c[0]*.2126+c[1]*.7152+c[2]*.0722;if(value<target)lo=mid;else hi=mid;}return (lo+hi)/2;}
