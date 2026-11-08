// 상호작용 칩(2026-11-07 모바일 피드백): 즐길거리 버튼을 화면 아래 띠 대신 대상(고양이·벤치·산스장 기구·먼지털이기) 머리 위 작은 칩으로 띄운다.
// 화면·three.js 없이 쓰는 순수 함수만 둔다(tests/trail-chip.test.mjs). 고르기는 src/trail-world.js, 그리기는 src/trail-hud.js.

// 거리(m, 소품 가장자리부터): on 안으로 들어오면 뜨고 off 밖으로 나가야 꺼진다(경계에서 깜빡이지 않게).
// swap = 다른 대상이 지금 것보다 이만큼 더 가까워야 칩을 옮긴다. 예전 줄은 6m에서 바로 켜고 껐다.
export const CHIP_RANGE=Object.freeze({on:4,off:5.2,swap:.6});

// 후보 [{id,d,…}] 중 칩을 띄울 하나(없으면 null). prevId = 지금 띄운 대상.
export function pickChipTarget(cands,prevId=null,{on=CHIP_RANGE.on,off=CHIP_RANGE.off,swap=CHIP_RANGE.swap}={}){
 let best=null,cur=null;
 for(const c of cands){if(!Number.isFinite(c?.d))continue;if(c.id===prevId)cur=c;if(!best||c.d<best.d)best=c;}
 if(cur&&cur.d<=off)return best!==cur&&best.d<=on&&best.d<cur.d-swap?best:cur;
 return best&&best.d<=on?best:null;
}

// 화면 자리. clip = 대상 위 점의 클립 좌표 {x,y,w}(뷰·투영 행렬을 곱한 뒤, w로 나누기 전).
// 칩의 기준점은 아래 가운데(꼬리 끝)다. box = 칩이 들어갈 수 있는 사각형 {left,top,right,bottom}(CSS px, 칩 크기·안전 영역·HUD를 뺀 것).
//  on   : 대상이 상자 안 → 그 자리
//  edge : 대상이 카메라 앞인데 상자 밖 → 가장 가까운 상자 가장자리에 고정
//  off  : 대상이 카메라 뒤(w≤0) → 숨김
export function chipScreen(clip,{width,height,box=null}){
 if(!clip||!(clip.w>1e-4))return {mode:'off'};
 const x=(clip.x/clip.w*.5+.5)*width,y=(-clip.y/clip.w*.5+.5)*height;
 const b=box??{left:0,top:0,right:width,bottom:height};
 if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom)return {mode:'on',x,y};
 return {mode:'edge',x:Math.min(b.right,Math.max(b.left,x)),y:Math.min(b.bottom,Math.max(b.top,y))};
}
