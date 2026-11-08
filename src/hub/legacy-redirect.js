// 옛 주소 유지(통합 기획 결정 4): 등산이 루트(/)에 있던 때의 주소 `/?multi=방&server=…`·`/?start=summit` 등으로 들어오면
// 쿼리·해시를 그대로 붙여 `/hiking/`로 바꿔 보낸다(history에 허브가 남지 않게 location.replace).
// 기획 지정 8개 + 예전 공유·점검 주소에 실제로 쓰이던 등산 전용 옵션. 허브 자체는 쿼리를 쓰지 않는다.
export const HIKING_PARAMS=['multi','server','start','season','time','weather','pick','dev',
 'quality','startMode','name','sim','simzone','fullcap','fov','bearing','audioDebug','outfit','style','tone'];

/** search·hash·base(import.meta.env.BASE_URL)로 넘겨 갈 주소를 돌려준다. 등산 옵션이 없으면 null(허브를 보여 줌). */
export function legacyHikingTarget(search='',hash='',base='/'){
 const q=new URLSearchParams(search);
 if(!HIKING_PARAMS.some(k=>q.has(k)))return null;
 if(!base.endsWith('/'))base+='/';
 const s=q.toString();
 return `${base}hiking/${s?`?${search.replace(/^\?/,'')}`:''}${hash||''}`;
}
