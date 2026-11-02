import test from 'node:test';
import assert from 'node:assert/strict';
import {sunDirection,hazeContrast,neutralCard,exposureForCard,LOOK_PROFILE} from '../src/look-profile.js';
test('태양 29°·142°, 북서 322° 그림자와 1.7m 캐릭터 약 3.1m',()=>{
 const [x,y,z]=sunDirection(),elevation=Math.asin(y)*180/Math.PI,azimuth=(Math.atan2(x,-z)*180/Math.PI+360)%360;
 assert.ok(Math.abs(Math.hypot(x,y,z)-1)<1e-12);assert.ok(Math.abs(elevation-29)<1e-10);assert.ok(Math.abs(azimuth-142)<1e-10);
 const sx=-x*1.7/y,sz=-z*1.7/y;assert.ok(sx<0&&sz<0);assert.ok(Math.abs(Math.hypot(sx,sz)-3.066881)<.001);
});
test('원경 8~12km 대비 55~68%, 거리순 연속 감쇠·근경 보존',()=>{
 assert.equal(LOOK_PROFILE.haze,'#94ADBD');assert.equal(hazeContrast(0),1);assert.ok(hazeContrast(1000)>.9);
 for(let d=8000;d<=12000;d+=100)assert.ok(hazeContrast(d)>=.55-1e-12&&hazeContrast(d)<=.68+1e-12);
 for(let d=100;d<=25000;d+=100)assert.ok(hazeContrast(d)<hazeContrast(d-100));
 assert.ok(Math.abs(hazeContrast(25000)-.25)<1e-12);
});
test('Neutral 고정 노출 기준: 18% 회색 모델 sRGB 118',()=>{
 const rgb=[.15,.13,.25],exposure=exposureForCard(rgb),c=neutralCard(rgb,exposure);assert.ok(Math.abs(c[0]*.2126+c[1]*.7152+c[2]*.0722-118)<1e-6);
});
