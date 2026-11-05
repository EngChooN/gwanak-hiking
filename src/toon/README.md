# src/toon — 카툰 모드 비주얼 (산풍경, 2026-11-05)

기획서 `docs/기획-실사-카툰-AB-청크스트리밍-2026-11-05.md` §2.6 인터페이스와 §2.7 수치를 구현한 모듈입니다. 이 폴더의 모듈은 어떤 fetch도 하지 않습니다.

| 파일 | 내용 |
|---|---|
| `index.js` | `createToonStyle({renderer,scene,camera,mobile})` 진입점 |
| `palette.js` | §2.7 수치(`TOON`)와 시간대 보간(`phaseWeights`, `bloomFor`, `gradeFor`, `outlineFor`, `skyFor`). three를 쓰지 않습니다. |
| `gradient.js` | 3단 gradientMap(0.35/0.7/1.0, NearestFilter) |
| `materials.js` | `materialFactory`, `toonify`, `patchFoliage` |
| `sky.js` | 애니풍 하늘 돔. 별은 HDR 값이라 블룸을 받습니다. |
| `city.js` | `styleCity`: 「너의 이름은」 도심(카툰 2차). 시간대별 파스텔·노을 윤곽빛·밤 창 격자, 시간대 연무, 전 도심 불빛 점·고층 빛무리·차량 불빛 줄기(`styleRoads`)·한강 물빛(`riverMaterial`)·랜드마크(`applyLandmark`). 값은 `CITY_LOOK` |
| `pipeline.js` | RenderPass → 외곽선(깊이 5점) → UnrealBloom → 색보정 → Output |
| `preview.html`·`preview.js` | vite dev에서 `/src/toon/preview.html`을 엽니다. `?el=-20`(태양 고도), `?quality=0` |
| `nature.js` | 카툰 전용 자연물(카툰 2차, 「야생의 숨결」 기준): 둥근 덩어리 수관 활엽수·층진 원뿔 침엽수·둥근 덤불·둥근 관목(어린 나무 자리)·가는 풀 다발·둥근 암괴 바위. `natureParts(url)`가 원래 GLB 파일명 대신 새 모양을 주고, `swapGroundCover(mesh)`가 하층 식생·계곡 판돌·입구 생울타리를 바꾼다 |
| `brush.js` | 붓질 텍스처 GLSL(`bsStroke`·`bsFade`·`bsPlane`). 지형 풀밭·암반, 바위, 흙길, 이끼가 함께 쓴다 |
| `rock-shade.js` | 바위 명암·칠. 회색 바탕 + 어두운 얼룩 + 이끼 `trcPaint`(지형 암반·바위 노면·계곡 암반·바위 부품 공용), 둥근 암괴 법선 `trcBump`(갈라짐 선·셀 경계 그늘은 쓰지 않음), 각진 면 `trcFacet`(지금은 쓰지 않음), 그늘 면 `rockShadeGLSL` |
| `grass-field.js` | 카메라 둘레 풀밭(16m 타일 고정 난수, 화질별 반경 14·22·30m) |
| `capture-preview.mjs` | 미리보기의 낮·노을·밤 캡처 스크립트(개발 서버를 먼저 띄워야 함) |

## 산개발 연결 메모 (main.js·rendering.js·load-landscape.js)
- **재질**
  - `materialFactory.materials()`는 `load-landscape.js`의 `materials`와 키가 같습니다.
    - manifest 7종: soil·stone·granite·leaves·grass·wood·bark
    - 추가 3종: paved·stoneStairs·woodStairs
  - 노면 재질은 `pathMaterials()`가 `{soil,rock,paved,stairs,deck_stairs,ridge}`로 줍니다.
  - 지형 재질은 `terrain()`이 줍니다. `contactOcclusion.apply()`처럼 onBeforeCompile을 체인해도 동작합니다.
  - 모든 재질에 `userData.shared=true`가 붙어 있습니다.
- **GLB:** 로드 직후 `toonify(root,{kind:'nature'|'prop'|'character'})`를 부르세요.
  - `toonAlphaCutout` 잎 카드는 같은 덩어리 메시(공유)로 바꿉니다. InstancedMesh, instanceColor, SkinnedMesh는 그대로 둡니다.
  - 덩어리 메시 geometry에도 `userData.shared=true`가 붙습니다. 청크 dispose에서 건너뛰어야 합니다.
- **풀:** 풀 재질에 `patchFoliage(material,{kind:'grass'})`를 쓰면 바람결 색 물결이 들어갑니다.
  - 알파 0.5 표시가 붙어 외곽선에서 빠집니다.
  - 시간은 `foliageUniforms.foliageTime`을 공유합니다.
- **도시:** `const c=styleCity({material:cityMaterial,nightLights})`를 만든 뒤 `c.apply(createCityGrid 반환 root 또는 부모)`를 부르세요.
  - 나중에 추가되는 도시 칸도 `childadded` 이벤트로 바뀝니다.
  - 밤 불빛은 `pipeline.update(env)`가 갱신합니다(`env.night`·`env.city`).
- **렌더:**
  - 프레임마다 `updateSky(env,sunVector,moonVector)`와 `pipeline.update(env)`를 부르고, 그다음 `pipeline.render(dt)`를 부릅니다.
  - 창 크기가 바뀌면 `pipeline.resize(quality,w,h,dpr)`를 부릅니다. quality 0과 모바일은 외곽선과 블룸을 절반 해상도로 돌립니다.
- **이 폴더 밖에서 쓰는 코드**
  - `assets/realistic/foliage-shader.js`(JS 셰이더, 텍스처 없음)
  - `src/light-fx.js`
  - 미리보기 전용: `src/daytime.js`, `src/look-profile.js`

## 실제 게임 화면 보정 (2026-11-05)
- 광장 바닥: 절차 캔버스 텍스처 + 흰 틴트 재질(`entrance-plaza.js` 블록·아스팔트)은 텍스처 평균색 바탕 + 3단 약한 무늬(12~50m에서 사라짐). GLB 텍스처는 그대로 버린다.
- 지형 바위: 경사(약 44°)·고도(500→600m 암반 얼룩, 600→625m 거의 전부)·노두 얼룩으로 판정. 카툰 2차 재판정부터 암반은 둥근 암괴 + 회색 얼룩·이끼 칠(가로 층 띠·붓 줄무늬·갈라짐 선 없음), 능선·정상의 완만한 암반은 수 m 크기 얼룩으로 풀밭과 반쯤 섞인다. 풀밭은 바람 방향 붓 자국(`toon-terrain-v6-paint`). 흙길·바위 노면은 법선을 위로 세워 마디마다 어두운 가로 띠가 생기지 않게 한다. 바위 GLB(rock_*·boulder_*·mountainside)는 회색.
- 계곡 물 띠·암반 홈: 카툰에서 행 옆 방향을 ±3행 평균으로 둥글게 고친다(`water.js` `smoothRibbon`).
- 자연물 확인: `node scripts/cartoon-compare.mjs n-entrance,n-forest,n-valley,n-ridge,n-summit --out nature`, 성능 `node scripts/measure-toon-nature.mjs`.
- 풀: `customProgramCacheKey`가 `roadside-grass|shrub-*`(near-detail)·`forest-blades-*`(forest-layers)인 재질은 원래 바람 셰이더를 이어 쓰고 색만 연두↔청록 물결(외곽선 제외). 어린 소나무 솔잎·잔가지도 풀밭색, 큰 소나무 솔잎(`_twig`)은 짙은 청록.
- 근거리 광원: `light-cap.js`가 MeshToon 공용 셰이더에서 점광원·스폿 합을 albedo×.45에 점근하게 누른다(해·달 제외, 밤 노출 2.4배 고려).
- 노을 그늘: 색보정에 `shadowGain`(노을 1.1, 낮·밤 0). 흙길 톤 `#a48c70`.
- 확인 캡처: `node src/toon/capture-game.mjs [서버] [폴더] [접미사] [toon,realistic]` (ready·chunks.ready 대기).

## 카툰 캐릭터 「동동이」 (link-hiker.js)
- 카툰 모드 전용 등산객. 대표 선택 시안 ①(`mascot-concepts.js`의 `dongdong()`) 모양 그대로: 키 1.0m·2.1등신·목 없음·머리 반지름 0.25m, 큰 눈(얼굴 높이 42% 자리, 하이라이트 2개)·볼터치·웃는 입, 벙거지(빨간 띠)·빨간 목도리·주황 바람막이·남색 바지·갈색 등산화·빨간 벙어리장갑·돗자리 얹은 청록 큰 배낭. 파일 이름은 이전 링크 캐릭터 때 그대로다.
- `assets/toon/models/hiker/Hiker.glb`의 Mixamo 뼈대를 복제해 뼈 길이만 줄인다(`BONE_SCALE`·`HIPS_SCALE`). 서기·걷기·뛰기·계단·바위 클립은 짧은 다리(엉덩이 관절 0.2m)에 맞춰 여기서 만든다(`GAIT_SHAPE`). 이동 속도는 그대로, 걸음 수가 늘어난다(걷기 0.22m·약 6걸음/s, 뛰기 0.42m·약 8걸음/s, 걷기의 2.5배 속도).
- 결과는 `createRealisticHiker`에 넘기므로 앉기·차·쌍안경·휴대폰·스틱·IK·접지는 실사와 같은 코드다. 몸마다 다른 값은 `scene.userData.hikerProfile`에 있다: 눈높이(`eyeHeight` 서기 0.695m·앉기 0.55m), 앉은 자리·컵(`seat`), 발·스틱 간격(`stance`·`poleStep`·`poleLength`), 팔 흔들기(`arm`=`TOON_ARM`), 쌍안경·휴대폰 자리와 어깨 들기(`gadget`), 셀카(`selfie`·`selfieStick`), 3인칭 카메라 배율(`cameraScale` 0.62), 이름표 높이(`height`).
- 머리가 커서 얼굴이 어깨보다 한참 앞이고 팔이 짧다: 쌍안경·휴대폰·차를 들 때 쇄골을 들어 올리고 내밀며, 셀카는 셀카봉을 뻗는다. 쌍안경은 몸집에 맞춘 작은 카툰 쌍안경(`hiker-gadgets.js` `TOON_BINOCULARS_SIZE`, 폭 9.8cm)이다.
- 서 있을 때는 팔꿈치를 굽혀 장갑을 시안 높이(0.25m)에 둔다(`TOON_ARM.stand`).
- 걷기↔뛰기(또는 계단 클립)를 섞을 때 디딤 구간을 같은 위상에 맞추고(`gaitStance`) 걸음 길이를 같은 빠르기로 옮긴다.
- 계단(`stairHop`): 보폭 배율 1(`TOON_STRIDE.stairs`)로 한 칸에 한 발씩 통통 뛰어오르고, 걸음 위상을 디딤판에 맞춰 발이 디딤판 가운데에 내린다. 계단 발소리는 실제로 디딘 순간에 난다(`main.js`).
- 발소리: 카툰은 두 걸음에 한 번(앞 소리에서 0.24초 안은 건너뜀) 가볍고 작은 '톡톡'으로 낸다(`footstep-audio.js` `toonStepGate`).
- 낮에는 화면 외곽선이 꺼져 있어 캐릭터만 뒤집은 껍질 외곽선(`ToonHiker_line*`)을 쓴다. 얼굴 부품(눈·볼·입)은 외곽선 두께 0.
- 얼굴·머리카락·벙거지는 `ToonHiker_Head` 메시로 따로 두고 그림자를 받지 않는다(`userData.noReceiveShadow`).
- 확인 화면: `/src/toon/character-preview.html?view=front|sideL|back|threeL&clip=Idle|Walk|Run&phase=0~2&pose=sit|tea&gadget=binoculars|phone&selfie=1&anim=1` (`&match=concept`: 시안 보드와 같은 카메라). `charPreview.set({lookYaw,lookPitch})`로 보는 방향, `set({runFrames:n})`로 걷기→뛰기 전환 n프레임째를 본다.
- 대조 캡처: `node scripts/capture-dongdong.mjs [서버] [폴더]` → `node scripts/make-dongdong-board.mjs [폴더]`, 게임 캡처: `scripts/capture-dongdong-game.mjs`·`scripts/capture-dongdong-stairs.mjs`(계단 디딘 간격·발소리 빈도 측정), 쌍안경·걷기→뛰기: `scripts/capture-dongdong-fixes.mjs`
