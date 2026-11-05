# src/toon — 카툰 모드 비주얼 (산풍경, 2026-11-05)

기획서 `docs/기획-실사-카툰-AB-청크스트리밍-2026-11-05.md` §2.6 인터페이스와 §2.7 수치를 구현한 모듈입니다. 이 폴더의 모듈은 어떤 fetch도 하지 않습니다.

| 파일 | 내용 |
|---|---|
| `index.js` | `createToonStyle({renderer,scene,camera,mobile})` 진입점 |
| `palette.js` | §2.7 수치(`TOON`)와 시간대 보간(`phaseWeights`, `bloomFor`, `gradeFor`, `outlineFor`, `skyFor`). three를 쓰지 않습니다. |
| `gradient.js` | 3단 gradientMap(0.35/0.7/1.0, NearestFilter) |
| `materials.js` | `materialFactory`, `toonify`, `patchFoliage` |
| `sky.js` | 애니풍 하늘 돔. 별은 HDR 값이라 블룸을 받습니다. |
| `city.js` | `styleCity`: 파스텔 MeshBasic, 거리 안개, 밤 창문 격자 |
| `pipeline.js` | RenderPass → 외곽선(깊이 5점) → UnrealBloom → 색보정 → Output |
| `preview.html`·`preview.js` | vite dev에서 `/src/toon/preview.html`을 엽니다. `?el=-20`(태양 고도), `?quality=0` |
| `nature.js` | 카툰 전용 나무·소나무·덤불·풀 다발·바위·절벽(3단계). `natureParts(url)`가 원래 GLB 파일명 대신 새 모양을 주고, `swapGroundCover(mesh)`가 하층 식생을 바꾼다 |
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
- 지형 바위: 경사(약 44°)·고도(500→600m 암반 얼룩, 600→625m 거의 전부)·노두 얼룩으로 판정(`toon-terrain-v2`). 바위 GLB(rock_*·boulder_*·mountainside)는 화강암 회색.
- 풀: `customProgramCacheKey`가 `roadside-grass|shrub-*`(near-detail)·`forest-blades-*`(forest-layers)인 재질은 원래 바람 셰이더를 이어 쓰고 색만 연두↔청록 물결(외곽선 제외). 어린 소나무 솔잎·잔가지도 풀밭색, 큰 소나무 솔잎(`_twig`)은 짙은 청록.
- 근거리 광원: `light-cap.js`가 MeshToon 공용 셰이더에서 점광원·스폿 합을 albedo×.45에 점근하게 누른다(해·달 제외, 밤 노출 2.4배 고려).
- 노을 그늘: 색보정에 `shadowGain`(노을 1.1, 낮·밤 0). 흙길 톤 `#a48c70`.
- 확인 캡처: `node src/toon/capture-game.mjs [서버] [폴더] [접미사] [toon,realistic]` (ready·chunks.ready 대기).
