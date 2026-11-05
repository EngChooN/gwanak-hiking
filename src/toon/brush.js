// 카툰 붓질 텍스처(카툰 2차 자연물, 산풍경): 「야생의 숨결」 지형·바위·길·잎의 칠한 결을 셰이더로 그린다.
// 텍스처 파일 없이 값 잡음을 한 방향으로 길게 늘리고 결을 휘게 해 짧은 붓 자국 무늬를 만든다.
// 붓 자국이 픽셀보다 잘아지면(먼 곳) 0으로 접어 반짝임·계단 무늬를 막는다.
export const BRUSH_GLSL=`
float bsHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float bsNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(bsHash(i),bsHash(i+vec2(1,0)),f.x),mix(bsHash(i+vec2(0,1)),bsHash(i+vec2(1,1)),f.x),f.y);}
// 붓질 값(-1~1): p 평면 좌표(m), dir 붓 방향(단위 벡터), w 붓 자국 폭(m). 자국 길이는 폭의 약 3.5배.
float bsStroke(vec2 p,vec2 dir,float w){
 vec2 q=vec2(dot(p,dir),dot(p,vec2(-dir.y,dir.x)))/w;
 q.x*=.28;
 q.y+=(bsNoise(q*vec2(.9,.35)+3.1)-.5)*1.6;
 float n=bsNoise(q)*.62+bsNoise(q*vec2(2.1,2.03)+vec2(7.3,1.1))*.38;
 return n*2.-1.;
}
// 붓 자국이 픽셀보다 얼마나 큰지에 따른 세기(1 = 또렷, 0 = 접음). px: 한 픽셀의 월드 크기(m).
float bsFade(float px,float w){return 1.-smoothstep(.12,.45,px/w);}
// 면 위 좌표: 법선 n에 수직인 두 축(가로·비탈 방향). 수평 면은 월드 xz.
vec2 bsPlane(vec3 p,vec3 n){
 vec3 t=cross(vec3(0.,1.,0.),n);float l=length(t);
 if(l<.25)return p.xz;
 t/=l;vec3 b=cross(n,t);
 return vec2(dot(p,t),dot(p,b));
}
`;
