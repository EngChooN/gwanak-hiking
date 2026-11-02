# 경량 실사 모델 연결 계약

나무·바위의 최종 인덱스는 `../generated/nature/index.json`입니다. 앱은 이 위치를 직접 읽습니다. 이 폴더의 index.json은 이전 로더 호환용 빈 목록입니다.

- GLB 27개: 나무 4종과 바위 5종 × LOD 3단계. Y-up·미터 단위, 모델 밑동을 0으로 정규화합니다.
- levels: `{url,distance}`. placements: `{x,z,y,scale,yaw,embed?}`. +X 동쪽, -Z 북쪽.
- y는 원시 DSM에 경로 보정을 적용한 높이입니다. 앱은 기존 floorHeight로 재접지하며 embed×scale만큼 바위를 묻습니다.
- 종류별 128m 청크·공유 형상/재질 캐시·인스턴싱을 사용합니다. 나무 0/40/120m, 바위 0/90/240m LOD, 950m 가시 거리입니다.
- 먼 나무는 스캔 모델을 직접 렌더링한 1K 투명 사진 2장을 직교시킨 4삼각형 GLB입니다.
- 상세 인계·이용 조건·성능 상한: `../generated/nature/인계보고.md`.

사람은 이번 업무 범위에 포함되지 않습니다. `src/realistic-models.js`의 loadHikerModel 로더와 기존 임시 캐릭터를 유지합니다.

## hiker/Hiker.glb (직접 제작 등산객, 2026-11-02)
- 몸·얼굴: MPFB2/MakeHuman 기본 인체(https://github.com/makehumancommunity/mpfb2 · https://static.makehumancommunity.org/). 에셋 라이선스 CC0, 프로그램은 AGPL(산출 모델에는 적용되지 않음). 
- 동작: Quaternius Universal Animation Library(https://quaternius.com/packs/universalanimationlibrary.html), CC0. Mixamo 호환 뼈대로 리타겟해 Idle·Look·Walk·Stairs·Rock 5개로 구성.
- 등산복·모자·배낭·신발: 직접 모델링. 원단 텍스처(ripstop·nylon·fabric·cotton)는 Poly Haven 계열 CC0 텍스처(https://polyhaven.com/textures)로 기록되었으나 **개별 텍스처 원문 링크는 제작 기록에 없어 확인불가** — 산리서치 확인 필요.
- 이전 임시 모델 Soldier(Mixamo 유래)는 `../../models-raw/hiker-prev-soldier/`에 보관만 하고 앱은 쓰지 않습니다(삭제하지 않음).
- 발 접지: 실제 신발 바닥 꼭짓점을 노면에 맞춰 관통·뜸을 보정합니다(`scripts/probe-hiker.mjs` 검사).
