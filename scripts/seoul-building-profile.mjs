// 실측값 우선. 분포는 측정 통계가 아닌 원경용 결정적 시각 추정이다.
export function buildingProfile(tags={},id=0){
 const type=tags.building??'yes';
 const use=/apartments|dormitory/.test(type)?'apartment':/office|commercial|retail|officetel|hotel/.test(type)?'office':/industrial|warehouse|roof|shed|greenhouse/.test(type)?'industrial':'house';
 const r=((Math.imul(Number(id)>>>0,1664525)+1013904223)>>>0)/4294967296;
 const number=v=>/^\s*\d+(\.\d+)?\s*(m|meters|metres)?\s*$/.test(String(v))?parseFloat(v):NaN;
 let h=number(tags.height);if(/\bft\s*$/.test(tags.height??''))h=parseFloat(tags.height)*.3048;
 const levels=number(tags['building:levels']),floor=use==='office'?3.6:3;
 const fallback={apartment:24+Math.floor(r*20)*3,office:12+Math.floor(r*r*17)*3.6,house:3+Math.floor(r*4)*3,industrial:4+Math.floor(r*3)*2}[use];
 return {use,buildingType:type,height:Math.min(600,h>0?h:levels>0?levels*floor:fallback),heightSource:h>0?'height':levels>0?'levels*'+floor:'estimated-'+use,levels:levels>0?levels:null,facadeSeed:Number(id)%65536};
}
