import test from 'node:test';
import assert from 'node:assert/strict';
import {SUN_PRESETS,sunDirection,hazeContrast,neutralCard,exposureForCard,LOOK_PROFILE} from '../src/look-profile.js';
test('태양 29°·142°, 북서 322° 그림자와 1.7m 캐릭터 약 3.1m',()=>{
 const [x,y,z]=sunDirection(),elevation=Math.asin(y)*180/Math.PI,azimuth=(Math.atan2(x,-z)*180/Math.PI+360)%360;
 assert.ok(Math.abs(Math.hypot(x,y,z)-1)<1e-12);assert.ok(Math.abs(elevation-29)<1e-10);assert.ok(Math.abs(azimuth-142)<1e-10);
 const sx=-x*1.7/y,sz=-z*1.7/y;assert.ok(sx<0&&sz<0);assert.ok(Math.abs(Math.hypot(sx,sz)-3.066881)<.001);
});
test('원경 8~12km 대비 55~68%, 거리순 연속 감쇠·근경 보존',()=>{
 assert.equal(LOOK_PROFILE.haze,'#9DBEDF');assert.equal(hazeContrast(0),1);assert.ok(hazeContrast(1000)>.9);
 for(let d=8000;d<=12000;d+=100)assert.ok(hazeContrast(d)>=.55-1e-12&&hazeContrast(d)<=.68+1e-12);
 for(let d=100;d<=25000;d+=100)assert.ok(hazeContrast(d)<hazeContrast(d-100));
 assert.ok(Math.abs(hazeContrast(25000)-.25)<1e-12);
});
test('Neutral 고정 노출 기준: 18% 회색 모델 sRGB 118',()=>{
 const rgb=[.15,.13,.25],exposure=exposureForCard(rgb),c=neutralCard(rgb,exposure);assert.ok(Math.abs(c[0]*.2126+c[1]*.7152+c[2]*.0722-118)<1e-6);
});

test('가을 태양: 오전 10시 29°/142°, 오후 3시 25°/224°(산리서치 11/3 계산값)',()=>{
 for(const [key,e,a] of [['am',29,142],['pm',25,224]]){const [x,y,z]=sunDirection(SUN_PRESETS[key].elevation,SUN_PRESETS[key].azimuth);assert.ok(Math.abs(Math.asin(y)*180/Math.PI-e)<1e-9);assert.ok(Math.abs((Math.atan2(x,-z)*180/Math.PI+360)%360-a)<1e-9);}
});
test('맑은 하늘 색: 천정과 지평선 모두 푸른 쪽(B>R)이고 지평선이 더 밝다',()=>{
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),z=rgb(LOOK_PROFILE.zenith),h=rgb(LOOK_PROFILE.horizon),f=rgb(LOOK_PROFILE.haze);
 for(const c of [z,h,f])assert.ok(c[2]-c[0]>=40,'회색 하늘·안개 금지');
 assert.ok(h[0]+h[1]+h[2]>z[0]+z[1]+z[2]);
});
