// 휴대폰 메모리 상한(2026-11-06 아이폰 5~10초 뒤 다시 로딩). iOS 사파리는 탭 메모리가 약 1~1.5GB를 넘으면 탭을 강제로 새로 연다.
// 수정 전 측정(아이폰 13 에뮬레이션): 출발 직후 도시 15만 동을 지오메트리로 모두 만들어 장면 버퍼 940MB + JS 힙 950MB.
// 여기 값은 휴대폰에서만 쓰는 상한이다. PC는 그대로 둔다.
export const MOBILE=typeof matchMedia==='function'&&(matchMedia('(pointer: coarse)').matches||(typeof navigator!=='undefined'&&navigator.maxTouchPoints>0));
export const MOBILE_LIMITS={
 cityCells:8,          // 상자·윤곽 지오메트리를 동시에 들고 있는 도시 2km 칸 수(가까운 순). 나머지는 원경 실루엣 하나로 그린다.
 cityDetailed:false,   // 휴대폰은 건물 밑면 모양 그대로 세운 상세 지오메트리를 만들지 않고 상자만 쓴다.
 forestGrass:.25,      // 숲 바닥 풀 포기를 PC의 1/4만 만든다(교차 배치 앞부분). 휴대폰 기본 화질 '낮음'은 22%를 그리므로 화면은 같다.
 cityChunkGapMs:250,   // 도시 JSON(약 2MB×32)을 받는 사이 쉬는 시간. 파싱 쓰레기가 쌓이기 전에 GC가 돌게 한다.
 minDpr:1,             // 화질 '낮음'이라도 렌더 해상도 배율은 1 아래로 내리지 않는다(글자·외곽선 뭉개짐 방지).
};
export const DESKTOP_LIMITS={cityCells:40,cityDetailed:true,forestGrass:1,cityChunkGapMs:0,minDpr:0};
export const LIMITS=MOBILE?MOBILE_LIMITS:DESKTOP_LIMITS;
