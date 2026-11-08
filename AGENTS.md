# AGENTS.md — 이 저장소에서 일하는 에이전트가 먼저 읽을 문서

새 대화·새 에이전트는 이전 맥락을 모릅니다. 작업 전에 이 문서를 먼저 읽으세요.
이 문서는 **현재 상태와 이미 내린 결정**을 모아 둔 곳입니다. 결정이 바뀌면 아래 「결정 기록」에 한 줄을 추가하고, 낡은 내용은 고쳐 두세요.

- 마지막 정리: 2026-11-08 (산풍경, 흡연장 같이 피우기 연결)
- `README.md`는 11-02~03 실사 모드 시절의 설명이 많이 남아 있어 **현재 상태와 다릅니다**. 이 문서와 최신 `docs/변경기록-*`을 우선하세요.

---

## 0. 저장소 구성 — 「온라인 메타버스」 (2026-11-08 통합)

- 이 저장소 하나에 체험 여러 개가 들어 있습니다. Vite 다중 페이지입니다(`vite.config.js`의 `PAGES`).
  - `/` = **허브**(체험 고르기). `index.html` → `src/hub/main.js`. 정식 화면은 `src/hub/hub.js`(카드 그리기·시간대)·`hub.css`·`experiences.js`(체험 목록: 배열에 한 줄 더하면 카드가 늘어남). three.js 없음, 카드 그림은 인라인 SVG. 시험용 `/?hubtime=day|dusk|night`.
  - `/hiking/` = **온라인 등산**(아래 §1~§9). `hiking/index.html` → `src/mountain-pick.js`·`src/main.js`.
  - `/smoking/` = **온라인 흡연장**(아래 §10). `smoking/index.html` → `src/lounge/main.js`.
- **옛 주소 유지:** 루트 `/`에 등산 옵션(`multi`·`server`·`start`·`season`·`time`·`weather`·`pick`·`dev` 등, 목록은 `src/hub/legacy-redirect.js`의 `HIKING_PARAMS`)이 붙어 오면 쿼리·해시 그대로 `/hiking/`로 `location.replace` 합니다. 공유했던 `/?multi=방&server=…` 주소가 계속 됩니다.
- **에셋은 한 벌:** `public/`·`assets/`를 세 페이지가 같이 씁니다. 코드에서 에셋 주소는 늘 `${import.meta.env.BASE_URL}assets/…`처럼 BASE_URL 기준으로 씁니다(페이지가 하위 폴더라 상대 경로 `assets/…`는 깨집니다).
- **공용 코드도 한 벌:** `src/lounge/` 밖의 파일(`src/toon/**`·`hiker-*`·`daytime`·`device-profile` 등)은 등산 원본이고 흡연장이 그대로 import 합니다. 공용 파일을 고치면 **등산과 흡연장 둘 다** 테스트·캡처로 확인하세요.
- 배포는 지금처럼 GitHub Pages 하나(`…/gwanak-hiking/` 허브, `…/hiking/`, `…/smoking/`). 저장소 이름 변경(예: `online-metaverse`)은 주소가 바뀌므로 대표 결정 뒤로 미뤘습니다.
- 원래 흡연장 폴더 `~/online-smoking`은 지우지 않고 남겨 두었습니다(대표가 정리). 앞으로 흡연장 작업은 이 저장소에서 합니다.

## 1. 무엇을 만드는가 (온라인 등산)

- **관악산 온라인 등반 체험**입니다. 실제 관악산공원 입구(서울대 옆 광장·일주문)에서 계곡길·깔딱고개를 지나 연주대 정상까지 걷습니다.
- 웹 3D로 만듭니다. Three.js + Vite이고 서버는 없습니다(정적 사이트).
- 그래픽은 **카툰 한 가지**입니다. 낮은 「젤다: 야생의 숨결」, 노을·밤은 「너의 이름은」 느낌입니다. 실사 모드는 2026-11-06에 없앴습니다.
- 주인공은 카툰 등산객 **동동이**입니다. 1.0m, 2.1등신이고 벙거지·빨간 목도리·주황 바람막이·청록 큰 배낭을 갖췄습니다. 복장 고르기는 없앴습니다.
- 경로는 실제 GPX 337점(위경도·평활 고도)입니다. 전체 약 5.1km이고, 모델 기준 전체 걸리는 시간은 150분입니다. 1m = Three.js 1단위, 북쪽 = −z입니다.
- 배포 주소는 https://engchoon.github.io/gwanak-hiking/ 입니다. 대표가 혼자 휴대폰(아이폰 사파리)으로 들어가 확인하는 용도입니다.

## 2. 사람과 역할 (AI Office)

| 이름 | 하는 일 |
|---|---|
| 대표 | 모든 결정을 합니다. 휴대폰으로 확인하고 피드백을 줍니다 |
| 산기획 | 기획·취합·검수를 맡는 랩 리드입니다. 업무를 나누고 대표 결재를 받습니다 |
| 산개발 | 엔진·이동·HUD 코드, 빌드·배포·성능을 맡습니다 |
| 산풍경 | 지형·숲·물·하늘·카툰 재질과 캐릭터 동작을 맡습니다 |
| 산디자인 | UI·색·분위기·HUD 디자인과 카툰 기준값을 맡습니다 |
| 산리서치 | 실제 자료 조사(코스·계절·도심·출처와 이용 조건)를 맡습니다 |

## 3. 대표가 이미 요청한 것 — 다시 빠뜨리지 말 것

같은 요청을 두 번 하게 만든 적이 있습니다. 기획·구현·검수 때마다 아래를 확인하세요.

- **실제로 참고하는 것은 산 모양(지형)·코스(GPX)·주변 서울 도심 풍경뿐입니다.** 시설·동물·소품·즐길거리·식생 등 나머지는 모두 게임 속 환경입니다. 실제 자료를 조사하거나 실제와 비교하지 않습니다(대표가 여러 번 말함, 2026-11-06).
- **일시정지 개념이 없습니다.** 일시정지·계속하기 버튼과 화면을 만들지 않습니다(`tests/hud-notebook.test.mjs`가 검사합니다).
- **정상(연주대) 쪽에는 계단이 없습니다.** 공중에 떠 있는 계단도 안 됩니다. 계단은 측벽과 지면에 붙어 있어야 합니다.
- **모든 기능은 HUD 버튼으로도 됩니다.** 단축키만 있는 기능을 만들지 않습니다. 휴대폰에는 키보드가 없습니다.
- **모바일 조이스틱은 손가락을 댄 자리에 생깁니다**(떠다니는 조이스틱). `src/joystick.js`를 보세요.
- **구간 이동 버튼(개발용)을 유지합니다.** 설정 탭 안의 '개발용' 점선 칸에 있습니다.
- **1인칭 카메라는 위아래로 흔들지 않습니다**(멀미 때문). 걸음 리듬은 발소리로만 냅니다.
- **시점 전환(1인칭/3인칭)은 늘 보이는 칩**입니다. 진행 카드 옆에 있습니다.
- **쌍안경·휴대폰 카메라는 휴대폰에서 "✕ 내리기" 버튼으로 바로 내릴 수 있어야 합니다.** 버튼은 손가락 크기(44px 이상)이고 안전 영역 안에 둡니다. `scripts/verify-mobile-gadgets.mjs`로 확인합니다.
- **알림이 HUD에 가려지면 안 됩니다.** 이어하기 안내·스탬프·완등 카드 모두 HUD 위에 뜹니다.
- **휴대폰 메모리를 지킵니다.** 아이폰 사파리는 탭 메모리(약 1~1.5GB)를 넘으면 페이지를 다시 엽니다. 대표에게는 "로딩 화면이 다시 뜬다"로 보입니다. 휴대폰 상한은 `src/device-profile.js` 한곳에 모아 두었습니다(도시 칸 8개, 숲 풀 25%, DPR 1.0 등).

## 4. 일하는 방식 (대표 피드백에서 나온 규칙)

- **찾은 결함은 그 턴에 고칩니다.** "남은 점"으로 미루지 않습니다. 정말 못 하는 것만 이유와 함께 적습니다.
- **모양은 숫자가 아니라 화면으로 대조합니다.** 참고 이미지와 맞출 때는 캡처를 나란히 놓고 실루엣(맨몸·측면)을 봅니다.
- **화면을 바꿨으면 캡처로 확인하고 보고에 붙입니다.** 휴대폰 세로 390×844, 가로 844×390, PC 1920×1080을 봅니다.
- **선택이 필요하면 질문 도구(AskUserQuestion)로 묻습니다.** 답변 글 속에 질문을 섞지 않습니다.
- **버전 번호는 정하기 전에 대표에게 묻습니다.**
- **커밋·push·배포는 대표가 시킬 때만 합니다.** 배포는 상호작용 작업 묶음이 끝난 뒤 한 번 합니다.
- **보고는 쉬운 한국어로 씁니다.** 무엇이 문제였고 무엇을 바꿨는지, 어떻게 확인했는지를 적습니다.
- **변경 기록을 남깁니다.** 작업마다 `docs/변경기록-YYYY-MM-DD-주제.md`를 쓰고, 큰 결정은 이 문서 §8에 한 줄을 더합니다.

## 5. 실행·검증·배포

```sh
cd ~/gwanak-hiking
. ~/.nvm/nvm.sh && nvm use 24   # 기본 PATH에 npm이 없음
npm run dev            # 개발 서버 (127.0.0.1:5173) — / 허브 · /hiking/ · /smoking/
npm test               # 단위 테스트 (node --test tests/*.test.mjs, 2026-11-08 기준 704개 = 등산 + 흡연장 lounge-*·smoke-* + 허브 metaverse-hub)
npm run test:e2e       # Playwright, toon 프로젝트 하나
npm run build          # vite build + scripts/copy-assets.mjs
npm run server         # 함께 걷기 서버(기본 8787, 환경 변수는 docs/멀티-서버-운영안내.md)
npm run deploy -- --dry  # 빌드·크기 점검만
npm run deploy         # gh-pages 브랜치에 강제 push (대표 지시가 있을 때만)
```

- 등산 주소 옵션(모두 `/hiking/` 뒤에 붙임, 루트에 붙이면 `/hiking/`로 넘어감): `?start=entrance`(입구 광장 출발), `?start=summit`(정상 10m 앞), `?multi=방이름`(함께 걷기), `?server=wss://…`(함께 걷기 서버 주소, `off`면 BroadcastChannel), `?pick=off|on`(산 고르기 화면 끄기·자동화 브라우저에서 켜기), `?serverpick=on|off`(서버 고르기 창: 자동화 브라우저에서 켜기·끄기, `?multi=`가 있으면 늘 건너뜀), `?dev=off`(개발 버전 끄기 = 자유 설정 잠김·구간 이동 숨김), `?season=`·`?time=`·`?weather=`.
- **점검 스크립트(Playwright)에서는 산 고르기 화면이 자동으로 빠집니다**(navigator.webdriver). 산 고르기를 찍으려면 `?pick=on`을 붙입니다. `scripts/verify-free-settings.mjs`가 산 고르기·도장·자유 설정을 검사합니다.
- 브라우저 콘솔의 `window.hiking`에 진단 함수가 있습니다. `hiking.memory()`, `hiking.loadTiming()` 등을 쓸 수 있습니다.
- 화면 확인 스크립트는 `scripts/capture-*.mjs`(등산 주소는 `/hiking/…`; 허브·등산·흡연장을 한 번에 찍는 `scripts/capture-metaverse.mjs`, 흡연장 `scripts/capture-smoking.mjs`), `scripts/verify-mobile-buttons.mjs`, `scripts/measure-mobile-memory.mjs`, `scripts/measure-first-load.mjs`에 있습니다. 결과는 `artifacts/`에 둡니다.
- GitHub 원격은 `git@github-personal:EngChooN/gwanak-hiking.git`입니다(개인 계정 SSH 별칭). 저장소 생성 같은 계정 작업은 대표가 웹에서 합니다.
- 런타임에 외부 지도·CDN·사진 서비스에 접속하지 않습니다.

## 6. 코드 지도

| 영역 | 파일 |
|---|---|
| 허브(체험 고르기) | `index.html` → `src/hub/main.js`, 화면 `src/hub/hub.js/.css`·`experiences.js`, 옛 주소 넘기기 `src/hub/legacy-redirect.js`. 검사 `tests/hub.test.mjs`·`tests/metaverse-hub.test.mjs`·`scripts/capture-hub.mjs` |
| 온라인 흡연장 | `smoking/index.html` → `src/lounge/**` (§10) |
| 시작·메인 루프 | `hiking/index.html` → `src/mountain-pick.js`(산 고르기, 수동 시작을 건다) → `src/main.js` (`<html data-style="toon">` 고정) |
| 산 목록·완등·자유 설정 | `src/mountains.js`(산 배열), `src/summit-records.js`(localStorage `gwanak-summits`), `src/free-settings.js`(개발 버전 `DEV_BUILD`·값·시각 계산), `src/free-settings-ui.js`(판·도장·HUD 연결), `src/free-settings.css` |
| 경로·좌표 | `src/gpx-data.js`(GPX 337점, CSV와 테스트로 대조), `src/route.js`, `src/route-surfaces.js` |
| 입구 광장 | `src/entrance-config.js`(가설 B 좌표), `src/plaza.js` |
| 정상 | `src/summit.js` (정상 자유 이동 구역) |
| 이동·카메라 | `src/movement.js`, `src/view.js`, `src/auto-view.js`, `src/input.js`, `src/joystick.js` |
| 청크 스트리밍 | `src/chunk-stream.js`, `src/chunk-culling.js`, 자료는 `assets/shared/chunks/` (200m 격자) |
| 카툰 그래픽 | `src/toon/**` (재질·하늘·물·풀·도시·동동이 `link-hiker.js`) |
| 캐릭터 동작 | `src/realistic-hiker.js`(카툰도 쓰는 뼈대 코드라 남김), `src/hiker-*.js` |
| 서울 도심 원경 | `src/city-grid.js`(2km 칸, 지연 생성·해제), `src/city-facade.js`, `src/city-landmarks.js` |
| HUD (등산 수첩) | `src/hud-notebook.js/.css`. main.js와는 `hiking:*` window 이벤트로만 주고받음 |
| 의견 보내기 | `src/feedback.js/.css`(등산·흡연장 공용 카드·GitHub 이슈 주소·복사), 등산은 `hud-notebook.js`, 흡연장은 `lounge/hud.js`가 설치. 검사 `tests/feedback-issue.test.mjs` |
| 상호작용 | `src/interaction-*.js` (안내판·스탬프·완등 카드·쌍안경 이름표), `src/gadget*.js`(쌍안경·휴대폰 카메라) |
| 쉬기 | `src/rest-ui.js` (앉기·차 마시기·스트레칭) |
| 계절 | `src/season.js`(날짜·바꾸기), `src/toon/season.js`(색·눈 셰이더), `src/toon/season-particles.js`(꽃잎·낙엽) |
| 즐길거리 | `src/toon/trail-props.js`(산스장·벤치·먼지털이기·동물 형상, 시안과 공유), `src/trail-sites.js`(자리), `src/trail-world.js`(가까이서만 만들기·동물 3마리·들르기·말풍선), `src/toon/hiker-acts.js`(동동이 동작), `src/exhaustion.js`(⑥ 헥헥·쥐 규칙), `src/trail-rules.js`(초콜릿·벤치·들르기 버튼 규칙), `src/trail-hud.js/.css`(간식 줄·즐길거리 줄·말풍선 모양), `src/trail-lines.js`(말풍선 문구 `pickLine`·효과음 표 `TRAIL_SFX`), `src/trail-sound.js`(효과음 재생: 발소리 마스터·켜기/끄기를 따름, 라디오 18m), 소리 `public/sounds/trail/`(`scripts/make-trail-sfx.mjs`로 합성). 검사 `verify-trail-sound.mjs`(소리 꺼짐 0건)·`verify-full-autowalk.mjs`(입구~정상 이어 걷기, 시계 6배) |
| 시간·날씨·소리 | `src/environment.js`, `src/daytime.js`, `src/weather.js`, `src/footstep-audio.js`, `src/ambient-audio.js` |
| 함께 걷기 | `src/multi-protocol.js`(규격·이름·보간·인사/셀카), `src/multi-transport.js`(BroadcastChannel·가짜 방·**WebSocket** `createWebSocketTransport`·`multiServerUrl`), `src/multi-client.js`(화면·상태 이벤트·동물 중계·`dispose`), main.js의 `hiking:multi-join`/`multi-leave` 처리, HUD 입구 `src/multi-entry-ui.js/.css`(설정 시트 `👋 함께 걷기` 버튼·상태 칩 → 서버 고르기 창, 연결 상태 칩 6종, main.js가 자동으로 불러옴, 이벤트만 주고받음). **서버 고르기 창** `src/server-pick.js/.css`(등산·흡연장 공용, 서버 목록 `SERVERS`·`/health` `servers`, 등산은 `src/hiking-server-pick.js`가 산 고르기 다음·HUD에 같이 씀, 검사 `tests/server-pick.test.mjs`·`scripts/verify-server-pick.mjs`). 서버 `server/multi-server.mjs`(http·upgrade·/health·환경 변수), `server/ws.mjs`(최소 WebSocket), `server/rooms.mjs`(방 로직 순수 모듈, 방 키 `체험:방이름`), `server/Dockerfile`(맨 위 `.dockerignore`도 같은 파일만: 서버 5개 + 채팅 금칙어 목록). 체험 구분은 `multi-protocol.js`의 `EXPERIENCES`·`parseExperience`·`EXPERIENCE_MESSAGES`(hello `exp`, 없으면 `hiking`). **채팅**은 공통 `c`(`CHAT`·`sanitizeChat`·`createChatLimiter`, 서버 금칙어 `server/chat-banned-words.txt`+`BANNED_CHAT_WORDS`), 등산 화면과는 `hiking:chat-send`/`hiking:chat`/`hiking:chat-limit` 이벤트만. 흡연장 `s`·`lounge:smoke`(`SMOKE_STATES`)도 서버가 받음. 흡연장 연결 인터페이스는 운영안내 §3-2. 운영은 `docs/멀티-서버-운영안내.md`. 등산 채팅 HUD `src/hiking-chat-ui.js/.css`(💬 버튼·채팅 창·머리 위 말풍선 4초·빠른 말 칩, `multi-client.js`의 `screenPos(id)`로 머리 위 위치 조회, main.js가 자동으로 불러옴; 검사 `tests/hiking-chat-ui.test.mjs`·`scripts/capture-hiking-chat.mjs`). 검사 `tests/multi-rooms.test.mjs`·`tests/multi-chat.test.mjs`·`tests/multi-server.test.mjs`·`tests/multi-entry-ui.test.mjs`·`scripts/verify-multi-server.mjs`·`scripts/verify-multi-chat.mjs`(두 브라우저 등산·흡연장 채팅·격리). 호스팅 비교 `docs/멀티-서버-호스팅-비교.md` |
| 같이 등산하기(동행) | 규격·문구·클라이언트 상태기계 `src/multi-protocol.js`(`PAIR`·`PAIR_TEXT`·`createPairClient`, 메시지 `pair:*`, 위치 flags `FLAG.auto`), 서버 쌍 상태 `server/rooms.mjs`(한 쌍·30초 만료·60초 재제안 금지·10초 간격·숨김 불가·끊김 60초 유예·resume, 메모리만), 나란히·밀어내기 계산 `src/pair-walk.js`(좌우 ±0.5m·앞뒤 1.5m·0.85m 밀어내기·자동 걷기 속도), main.js `pairStep`(advance에 `laneTarget`·`pace`)·`pairNudge`(노면 반폭−0.3m·`animal-lanes.inForbid`), HUD `src/pair-ui.js/.css`(👥 목록·이름표 고르기·제안 카드·동행 칩, `hiking:pair-*` 이벤트만). 검사 `tests/pair-rules.test.mjs`·`tests/pair-walk.test.mjs`·`scripts/verify-pair-walk.mjs`(두 브라우저, 약 5분) |
| 라디오(관악산 FM) | 방송표·섞기 공식 `src/radio-stations.js`(`STATIONS` 빈 배열·`FM_CHANNELS` 91.9/95.5/99.1·`EXTERNAL_LINKS` 새 탭 링크 3개 — 방송사 주소는 이 파일에만), 곡 목록 `assets/radio/manifest.json`(한 파일, 크레딧 문구 포함)·도우미 `src/radio-tracks.js`(95.5 멘트 고르기), 소리 `src/radio-audio.js`(발소리와 같은 AudioContext·마스터, 잡음 합성, `<audio>` 흘려 받기·겹쳐 잇기), HUD `src/radio-ui.js/.css`(📻 태그·앞/뒷면·설정 시트 「소리 출처」, 저장 `gwanak-radio`). 검사 `tests/radio.test.mjs`·`scripts/verify-radio.mjs` |
| 기기별 상한 | `src/device-profile.js` (등산·흡연장 공용. 흡연장 사본과 다른 점은 등산 쪽에만 있는 `multiFullCap` 하나였고 흡연장은 이 값을 읽지 않으므로 그대로 씀) |

## 7. 지금 상태와 다음 일 (2026-11-08)

- **멀티 채팅(11-08, 커밋 안 함):** 서버·프로토콜에 공통 채팅 `c`와 흡연장(위치·담배 상태)을 열고 등산 클라이언트에 채팅 이벤트를 붙였습니다. 등산 채팅 HUD는 붙었습니다(산디자인, `docs/변경기록-2026-11-08-등산채팅-HUD.md`). 흡연장 화면도 붙었습니다(산풍경, `docs/변경기록-2026-11-08-흡연장-멀티.md`, `verify-multi-chat.mjs` 흡연장 칸 통과). 금칙어 기본 목록 127개와 운영 정책·처리방침 초안도 나왔습니다(산리서치, `docs/채팅-운영정책.md`·`docs/개인정보-처리방침-초안.md`). 남은 일: 실제 휴대폰 키보드·인터넷 시험, 정책 §E 대표 결정 6개, 그 결정에 따른 서버 보강(허용 단어 줄·전화번호/URL 가림·숨김 중 채팅 막기·채팅 신고 사유), 법무 검토. `docs/변경기록-2026-11-08-멀티채팅-서버.md`.
- **메타버스 통합(11-08, 커밋 안 함):** 흡연장을 `/smoking/`, 등산을 `/hiking/`으로 옮기고 허브 정식 화면을 붙였습니다. 멀티 서버는 방 키를 `체험:방이름`으로 나눕니다(옛 클라이언트는 등산, 흡연장 실시간 접속은 자리만 설계 — `docs/멀티-서버-운영안내.md` §3-1). 다음: Render 배포. `docs/변경기록-2026-11-08-메타버스-통합.md`·`…-멀티서버-체험구분.md`.

- 11-06 저녁에 그동안 커밋하지 않았던 변경을 커밋하고 GitHub Pages에 다시 배포했습니다(대표 지시: 즐길거리가 끝나면 함께). 커밋 목록은 `git log`를 보세요.
  - 담은 것: 망원경 랜드마크 설명·도심 건물 시야 우선·알림 겹침, 계절 모습(봄 벚꽃·여름·가을 단풍·겨울 눈), 산 고르기·완등 도장·자유 설정, 즐길거리 6종(산스장·초콜릿·벤치·동물·먼지털이기·헥헥/쥐)과 HUD·소리·말풍선 문구.
  - 커밋에서 뺀 것: 참고 이미지(§9), `artifacts/probe/` 같은 임시 파일, 큰 캡처 묶음(`artifacts/ui-concepts/shots*`·`seasons`·`dongdong`·`toon-face`·`trail-hud`·`trail-props` 등). 로컬에만 있습니다.
- **함께 걷기 서버**는 로컬 완성·배포 준비까지 했습니다(11-08, 커밋·배포 안 함). `npm run server`로 뜨고, 게임은 `?multi=방&server=wss://…`로 붙습니다. 1차 시험은 대표 결정대로 내 맥 + Cloudflare Quick Tunnel입니다(`docs/멀티-서버-운영안내.md` §5). HUD 입구(설정 시트 `👋 함께 걷기` 버튼·참가 카드·연결 상태 칩)도 붙었습니다. 남은 일: 실제 휴대폰·인터넷 시험(키보드가 카드를 가리는지 포함), 호스팅 결정(추천 Fly.io 도쿄, `docs/멀티-서버-호스팅-비교.md`), 처리방침·법무 확인(IP는 디스크에 저장하지 않는 구현 기준으로 쓸 것), 광장 스냅샷 기준 갱신 여부.
- **실사 에셋 파일**은 저장소에 남아 있지만 배포에서는 뺐습니다. 지우려면 되돌릴 수 있게 커밋 하나에 담습니다.
- **아직 확인하지 못한 것:** 숲 밀도·단풍 비율·일주문 치수는 근거가 약한 제안값입니다. 관악산을 아는 사람의 확인과 현장 사진 대조가 필요합니다.

## 8. 결정 기록 (최신이 위)

| 날짜 | 결정 | 근거 문서 |
|---|---|---|
| 11-08 | 관악산 FM 라디오 구현: 📻 태그(켜지면 `📻 91.9`, 잡음이면 `~`) → 휴대용 라디오(전원·끌어서 돌리는 다이얼·0.1 단추·채널 바로 가기·볼륨 노브·뒷면 링크). 91.9 Kevin MacLeod 8곡(CC BY 4.0, 시각 % 총길이로 이어 듣기·1.5초 겹침), 95.5 자막 + 합성 낮은 톤(녹음 파일은 manifest `lines[].file`만 채우면 붙음), 99.1 Freesound CC0 6개 두 층(3초 겹침). 잡음·딸깍은 Web Audio 합성, 섞기 공식 radio-design §3-2. 기본 꺼짐·주파수·볼륨만 저장, 끄면 노드·`<audio>` 해제, 소리 꺼짐 연동, 켜지면 환경음 ×0.7. 파일은 원본 그대로 `assets/radio/`(빌드 복사) | 변경기록-2026-11-08-동행-라디오.md, radio-design.md |
| 11-08 | 같이 등산하기(동행) 구현: 이름표 누르기·👥 목록으로 제안, 서버가 쌍 상태(한 쌍·30초 만료=저절로 거절·거절/만료 뒤 같은 사람 60초 금지·제안 10초 1번·숨김 불가·소켓 끊김 60초 유예와 resume 이어 붙임·나가기는 바로 끝, 메모리만). 8m 안 나란히(폭 1.6m 이상·계단 아님 = 좌우 ±0.5m·ID 작은 쪽 왼쪽, 아니면 앞뒤 1.5m), 0.85m 안 밀어내기(최대 0.8m/s, 노면 반폭−0.3m·금지 원 지킴, 서버 순간이동 거부 0), 자동 걷기는 앞선 쪽이 맞춤·8m 0.4배·15m 0.2배+'기다리는 중'. 동행 아닌 사람끼리 겹침은 범위 밖 | 변경기록-2026-11-08-동행-라디오.md |
| 11-08 | 의견 보내기(등산·흡연장 공용 `src/feedback.js/.css`, 사본 금지): 사용자가 「🐙 GitHub에 올리기」를 누를 때만 새 탭(noopener)으로 `EngChooN/gwanak-hiking` 이슈 작성 페이지를 미리 채워 엶(게임이 몰래 보내지 않음, §5 예외 아님). 제목 `[등산|흡연장] 아이콘 내용 앞 40자`, 라벨 `feedback`+`bug`/`idea`+`hiking`/`smoking`, 본문 6000자 안(내용 쪽을 자름). 붙는 정보 = 체험·경로(옵션 `name`·`multi` 지움)·화면·기기·방향·브라우저 이름·시간대/날씨·빌드 날짜(`__BUILD_DATE__`)·시각, 닉네임·채팅·위치·IP 없음. 「📋 내용 복사」는 clipboard 실패 시 글을 골라 보여 줌. 카드가 열린 동안 키는 document 잡기 단계에서 멈추고 이동은 `feedbackOpen()`으로 0. 등산 = 설정 시트 `💌 의견 보내기` 줄(`hiking:feedback-open`) | 변경기록-2026-11-08-의견보내기.md, docs/흡연장/의견보내기-디자인.md |
| 11-08 | 라디오: 방송사에 허락 문의 안 함. 외부 방송 주소 접속 예외는 만들지 않음(§5 유지, `STATIONS` 빈 채). 허용은 ① 사용자가 누르는 방송사 공식 페이지 링크(새 탭, 대표가 열어 확인한 것만) ② CC0·CC-BY 음악·소리를 우리 서버에서 재생하는 자체 방송국 "관악산 FM"(CC-BY는 게임 안 크레딧 표기, NC·SA·Pixabay 원본 직접 제공 제외). 추천 1순위 = 관악산 FM | docs/radio-options.md, 변경기록-2026-11-08-라디오-허락없는길.md |
| 11-08 | 등산 첫 화면(산 고르기)에 닉네임 칸: 12자·비우면 `등산객XXXX`, 저장값은 서버 고르기 창과 같은 `gwanak-multi-name`(치는 대로 저장, 서버 창은 열 때 다시 읽어 미리 채움, 혼자 걷기도 저장), 입력 중 단축키 막음, 키보드가 올라오면 `pk-typing`으로 스크롤 | 변경기록-2026-11-08-서버고르기.md |
| 11-08 | 서버 고르기 창(등산·흡연장 공용 `src/server-pick.js`): 서버 목록은 `multi-protocol.js` `SERVERS`(관악산 1서버 `관악산-1`→`hiking:관악산`, 옥상 1서버 `옥상-1`→`smoking:옥상`, 줄 하나 = 서버 하나), 정원 20·서버 방은 꽉 차면 `-2` 대신 `full` 거절(목록 밖 방은 옛 규칙), `/health`에 `servers`·`total`, 창은 5초마다 갱신·`방금 꽉 찼어요`·연결 실패면 혼자만. 등산 산 고르기 → 서버 고르기 → 출발, 흡연장 로딩 뒤. 방 이름 칸 없앰, `?multi=` 옛 주소·webdriver는 건너뜀(`?serverpick=on`) | 변경기록-2026-11-08-서버고르기.md |
| 11-08 | 등산 채팅 PC 단축: 함께 걷기 중 Enter = 채팅 열고 입력, 글 있으면 보내고 입력 유지, 빈 Enter·Esc = 접기. `?multi`로 바로 참가해도 💬가 보이게 채팅 HUD 설치 뒤 `statusNow()` | 변경기록-2026-11-08-채팅-엔터.md |
| 11-08 | 자동 걷기는 다른 창·탭으로 가도 계속(blur·숨김에 끄지 않음). 숨은 탭은 워커 타이머로 0.1초씩 보충 걸음(그리기 생략, 최대 60초 따라잡기), 소리는 숨은 동안 없음 | 변경기록-2026-11-08-자동걷기-백그라운드.md |
| 11-08 | 멀티 채팅·흡연장 열기: 채팅은 두 체험 공통 `c`(`lounge:chat` 예약 대체), 80자·제어/방향 문자 제거·금칙어 `***`, 2초 1번·10초 4번(넘으면 `c-limit`), 보낸 사람 포함 중계, 디스크 저장 없음(신고 기록에만 대상 최근 3줄). 흡연장 = 공통 + `s` + `lounge:smoke {state,lit}`(smoke.js 상태 허용 목록). 익명 `등산객`/`손님`. BroadcastChannel `gwanak-multi:체험:방`(등산은 옛 이름) | 변경기록-2026-11-08-멀티채팅-서버.md, 멀티-서버-운영안내.md §3-1·§3-2 |
| 11-08 | 멀티 서버 체험 구분: hello에 `exp`(`hiking`\|`smoking` 허용 목록, 없으면 `hiking`, 목록 밖은 `reject`로 거절), 방 키 `체험:방이름`(끝 번호는 원래대로 떼서 `?multi=관악산-1` → `hiking:관악산`), -2 규칙·속도 제한·신고는 체험별 방 안에서, 신고·resume은 체험을 넘지 않음, 체험별 받는 메시지 종류(흡연장은 공통만, `s`·`lounge:chat`·`lounge:smoke` 예약) | 변경기록-2026-11-08-멀티서버-체험구분.md, 멀티-서버-운영안내.md §3-1 |
| 11-08 | **온라인 메타버스 통합**: 저장소는 `gwanak-hiking` 하나, Vite 다중 페이지 `/` 허브·`/hiking/`·`/smoking/`, 공용 코드 한 벌(흡연장 사본 없앰), 루트의 등산 옵션 주소는 `/hiking/`로 replace, `~/online-smoking`은 남겨 둠. 저장소 이름 변경은 대표 결정 뒤 | 기획(산기획 11-08), 변경기록-2026-11-08-메타버스-통합.md |
| 11-08 | 함께 걷기 HUD 입구: 새 탭 대신 설정 시트에 `👋 함께 걷기` 버튼, 방 이름(기본 `관악산-1`)·닉네임(12자, 비우면 `등산객XXXX`) 카드, 연결 상태 칩 6종(연결 중·연결됨·다시 연결 중·끊김·방 꽉 참·내 컴퓨터 모드), 입력 중 단축키 막음. 호스팅 추천 1안 Fly.io 도쿄(미결정, 2안 Vultr 서울) | 변경기록-2026-11-08-함께걷기-HUD입구.md, 멀티-서버-호스팅-비교.md |
| 11-08 | 함께 걷기 서버 1차: 직접 만든 WebSocket(Node 내장 http·crypto, 새 패키지 없음). 방 20명(차면 방이름-2), 위치 초당 15회, 순간이동 거부(FLAG.jump 1초 1번, 3초 고집하면 다시 맞춤), 10Hz 묶음, 인사·셀카·동물 놀람 중계, 신고 서로 다른 3명 → 24시간 이름표 숨김·재배정, IP는 메모리 해시만, 신고 JSONL 90일. 서버는 ws://만, wss는 앞단. 설정은 환경 변수(PORT·DATA_DIR·ALLOWED_ORIGINS 등), `/health`. 주소는 `?server=` → `VITE_MULTI_SERVER_URL` → 없으면 BroadcastChannel. 휴대폰 모델 2명. 1차 시험은 내 맥 + Quick Tunnel(대표) | 변경기록-2026-11-08-멀티서버.md, 멀티-서버-운영안내.md |
| 11-07 | 빈 구간 벤치 5곳 더(850·1,863·2,858·3,445·3,870m, est), 4,106m 벤치는 나무계단 경사(다리 차 0.4m) 때문에 3,870m 평탄참으로 옮김. 즐길거리 자리는 물줄기 띠를 피하고 계단 옆은 가장자리에서 1.3m, 나무계단 난간은 벤치 앞만 틈. 동물 허용 폭·금지 영역 자료 `src/animal-lanes.js`(자동 생성, 연결은 산개발) | 변경기록-2026-11-07-빈구간소품-지형검증.md |
| 11-07 | 동물은 고정 자리 대신 출현 구역(`ANIMAL_ZONES`) + 5분 시간 칸 결정적 난수(`src/animal-zones.js`)로 나오고 시간의 함수로 배회(같은 방 = 같은 동물, 서버 없음, 반응은 각자 화면). 멧토끼 추가, `CAT_SPOTS` 삭제, 빈 구간 벤치 4곳(640·2,600·3,224·4,106m) | 변경기록-2026-11-07-동물배회-토끼.md |
| 11-07 | 동물 출현·배회가 `src/animal-lanes.js` 허용 폭(절벽·물·다른 구간 노면)과 금지 원(바위·시설)을 지킴: offset 상한 = min(종류 상한, zone.maxOffset, laneLimit), 막히면 반대쪽 → 같은 씨앗 난수열로 다시 뽑기(결정성 유지), 걷는 다리는 0.05m 간격 검사 | 변경기록-2026-11-07-동물허용폭연결.md |
| 11-06 | 즐길거리 소리·문구 연결: 효과음은 `src/trail-sound.js` 하나로, 발소리와 같은 AudioContext·마스터를 거치고 '소리 꺼짐'이면 재생 0(즐길거리 쪽 합성음·자체 AudioContext 없앰). 파일 11개 `TRAIL_SFX`대로, 라디오는 산스장 18m 안 반복·거리 감쇠. 말풍선은 모두 `pickLine`(⑥ 문구 5개도 표로 옮김), 자주 생기는 장면은 다른 말풍선이 있으면 건너뜀. 계곡 고양이 2곳 est | 변경기록-2026-11-06-즐길거리-소리문구연결.md |
| 11-06 | 즐길거리 HUD 디자인: 수첩 토큰에 형광펜·말풍선 낮/노을/밤 색 추가, 말풍선은 trail-hud.css가 덮음. 문구 `src/trail-lines.js`(첫 문구 = 시안), 효과음 7개는 `scripts/make-trail-sfx.mjs`로 직접 합성(CC0, `public/sounds/trail/`). 소리 연결은 산개발 | 변경기록-2026-11-06-즐길거리-디자인-효과음.md |
| 11-06 | 즐길거리 HUD 연결: 진행 카드 간식 줄(🍫 n/5·먹기·⚡ 빨라짐), 화면 아래 즐길거리 줄(들르기 4초·기구 버튼·역기 연타·일어나기·발끝 당기기). 초콜릿 개수는 이어하기 저장, +20%는 계단 제외. 들르기는 자동걷기 중에만, 거리는 소품 가장자리부터. 수첩에 즐길거리 칸 2개(득근·깨끗한 신발, 완등 조건 아님). 검사 `verify-trail-buttons.mjs`·`verify-trail-dropin-route.mjs` | 변경기록-2026-11-06-즐길거리-HUD.md |
| 11-06 | 첫 화면 = 산 고르기(산 배열, 지금 관악산 1곳). 완등 기록은 localStorage, 도장은 SVG. 자유 설정(날씨·시간·계절·출발 지점·현재 그대로)은 완등 또는 개발 버전에서 열림. 개발 버전 = 구간 이동과 같은 조건(`DEV_BUILD`), 배포본도 개발 버전. 고른 값은 sessionStorage. 중간 출발 등산은 가장 빠른 기록에서 뺌 | 변경기록-2026-11-06-산고르기-완등도장-자유설정.md |
| 11-06 | ⑥ 헥헥·쥐 구현: 규칙은 `src/exhaustion.js`(쥐가 풀리면 헥헥 1.5초 없이 바로 터벅터벅), 1인칭은 쥐 동안 시야만 0.3m 낮춤, HUD는 `hiking:trail {type:'exhaust'}`·`cramp-release` 명령으로 연결 | 변경기록-2026-11-06-헥헥-쥐.md |
| 11-06 | 즐길거리 오브젝트·동물 게임에 넣음: 산스장 2,416m·벤치 5곳(1,552·1,692·2,148·3,639·4,513m)·먼지털이기(광장 왼편), 동물 3마리 상한, 들르기는 `hiking:trail-offer`/`trail-play` 이벤트. 모자·배낭은 따로 된 메시 | 변경기록-2026-11-06-즐길거리-오브젝트-동물.md |
| 11-06 | ⑥ 무리해서 뛰면 추가 승인: 스테미너 0이면 헥헥 1.5초, 오르막에서 25% 확률로 쥐 3초(🦶 발끝 당기기 1초), 2분 재발 없음. 즐길거리 계획에 합침 | 기획-2026-11-06-자동걷기-즐길거리.md §⑥ |
| 11-06 | 자동걷기 즐길거리 5종 시안 승인: 산스장·초콜릿(5개, 30초 +20%)·벤치·동물(다람쥐·고양이·까치)·등산화 먼지털이기. 웃음은 시안 정도, 자동걷기 중에는 들르기 버튼을 4초 동안 띄움 | 기획-2026-11-06-자동걷기-즐길거리.md, artifacts/props-concepts/board.html |
| 11-06 | 계절 모습 구현: 서울 날짜(봄 3/25·여름 5/1·가을 10/15·겨울 12/1), `?season=`·`hiking.setSeason`·`hiking:free-settings`로 바꿈. 셰이더 uniform 하나로 색·잎·눈을 바꿔 다시 로딩·큰 텍스처 없음. 쌓인 눈은 날씨와 별개 | 변경기록-2026-11-06-계절별-산-모습.md |
| 11-06 | 휴대폰에서 쌍안경·카메라 "✕ 내리기" 버튼, 카메라 틀은 화면 방향을 따름, 기구 사용 중 조이스틱 숨김 | 변경기록-2026-11-06-모바일-쌍안경-휴대폰-내리기.md |
| 11-06 | 망원경 사용 중에는 시야 안 도심 칸부터 실제 건물로 만들고, 나머지는 상자 건물로 그림(납작한 판 금지) | (미커밋, 직전 작업) |
| 11-06 | 아이폰 재로딩 대책: 도시 칸 지연 생성·해제, 휴대폰 기본 화질 '낮음', 1인칭 헤드밥 제거, 시점 칩 상시 | 변경기록-2026-11-06-아이폰-메모리-1인칭-시점칩.md |
| 11-06 | HUD를 「등산 수첩」 디자인으로 바꿈(진행 카드·책갈피 탭·도장 버튼·낮/노을/밤 종이 톤). 복장 고르기 삭제 | 변경기록-2026-11-06-등산수첩-HUD.md, UI-등산수첩-사양.md |
| 11-06 | **실사 모드 제거, 카툰만 남김.** 모드 선택 화면 삭제, 첫 로딩 단축 | 변경기록-2026-11-06-피드백8건.md |
| 11-05 | 카툰 캐릭터는 귀여운 시안 중 ① 동동이로 결정(링크 비율 폐기). 다른 시안은 `src/toon/mascot-concepts.js`에 보관 | 변경기록-2026-11-05-카툰-동동이.md |
| 11-05 | 카툰 방향: 낮 = 야생의 숨결, 노을·밤 = 너의 이름은. 참고 사진 `design/ref-cartoon/`은 커밋·배포 금지 | 카툰-기준값.md |
| 11-05 | 200m 청크 스트리밍 도입 | 기획-실사-카툰-AB-청크스트리밍-2026-11-05.md |
| 11-04 | 배포는 GitHub Pages(공개 주소 괜찮음), 상호작용 작업이 끝난 뒤 한 번. 개발용 구간 이동 버튼 포함 | — |
| 11-04 | 일시정지 제거, 모든 기능 HUD 버튼 노출, 모바일 떠다니는 조이스틱 | 변경기록-2026-11-04-HUD-일시정지-조이스틱.md |
| 11-04 | 정상 계단 제거, 계단 측벽·지면 밀착 | 변경기록-2026-11-04-계단-정리.md |
| 11-04 | 함께 걷기는 내 컴퓨터 시제품까지만. 서버는 대표 결정 뒤 | 멀티-설계.md |
| 11-03 | 입구 광장 출발점은 가설 B(대표가 로드뷰로 고름, 현장 실측 아님) | 입구광장-배치조사.md |
| 11-02 | 1:1 스케일, 실제 걷는 속도(전체 150분, 계단 초당 1.2걸음). 경로 길이를 공식 수치에 맞춰 줄이지 않음 | 기획서-구현방식-1대1스케일-실제속도.md |

## 9. 자료·저작권 주의

- 출처와 이용 조건은 `data/자료-출처-이용조건-기록표.md`, `assets/출처-라이선스.md`에 기록합니다. 새 자료를 쓰면 여기에 추가합니다.
- 다음은 커밋·배포하면 안 됩니다: 게임·영화 참고 이미지(`design/ref-cartoon/`, `artifacts/cartoon-compare/`), 재배포 조건을 확인하지 못한 모델(Mixamo 유래 `Soldier.glb`).
- 지도·도심 건물은 OSM 자료입니다. 화면 아래 출처 줄(`#source-line`)을 유지하세요.
- 설명글은 위키 글을 옮기지 않고 사실만 확인해서 새로 씁니다. 나무위키는 자동 접속이 막혀 있으니 한국어 위키백과와 공공 자료를 씁니다.

## 10. 온라인 흡연장 (`/smoking/`, 온라인 시리즈 ②)

기획서 `docs/흡연장/기획서-온라인흡연장-v1.md`, 맛·상호작용 v2 `docs/흡연장/기획서-맛과상호작용-v2.md`, 결과보고·점검표도 같은 폴더에 있습니다.

### 무엇을 만드는가
- 금연 중이거나 원래 안 피우는 사람이 **옥상 흡연장 메타버스**에서 채팅으로 떠들며 **가상 담배**를 피우는 웹 3D 체험입니다. 장소는 서울 도심 빌딩 옥상입니다.
- NPC 동동이 4명(미나·지훈·보미·대호)이 함께 있습니다. 사람이 들어와도 NPC는 그대로 4명입니다.
- **같이 피우기(실시간 멀티, 11-08):** 같은 방 사람의 동동이(회사원 옷, ID로 정해짐)·위치·채팅·담배(불씨·연기)를 서버(`smoking:방`) 또는 같은 브라우저 창끼리(BroadcastChannel `gwanak-multi:smoking:방`)로 주고받습니다. HUD 위 오른쪽 `👥 같이 피우기` 단추(참가하면 연결 상태 칩) → 방 이름(기본 `옥상-1`)·닉네임 카드. 주소 `?multi=옥상-1&server=ws://…`(`&name=`)로 바로 참가. 규격은 `docs/멀티-서버-운영안내.md` §3-1·§3-2, 기록은 `docs/변경기록-2026-11-08-흡연장-멀티.md`.

### 브랜드 기준 — 가장 중요
- **온라인 등산이 브랜드입니다.** 캐릭터 「동동이」(1.0m·2.1등신·큰 머리)와 카툰 그래픽(3단 툰 명암·얇은 외곽선·낮 야생의 숨결/노을·밤 너의 이름은)을 그대로 씁니다. 이제 사본이 아니라 등산 원본 파일을 직접 import 합니다.
- **흡연장에서 바꾸는 것은 옷뿐입니다**(`src/lounge/outfit.js`). 대표 지시로 등산복이 아니라 **회사원 옷**(셔츠·넥타이(기본)·정장 재킷·카디건·롱패딩)을 입히고 벙거지·배낭·쌍안경은 숨기며 장갑은 맨손(피부색)입니다. 형상·비율·얼굴·동작 속도는 그대로입니다. 예전 저장값(hiker·hoodie)은 셔츠로 읽습니다.
- 흡연장 때문에 공용 파일(동동이·카툰·`device-profile` 등)을 바꿔야 하면 등산 쪽도 같이 확인하고 대표 확인을 받습니다. 흡연장만 다르게 해야 하면 공용 파일에 옵션을 더합니다(사본을 만들지 않음).
- HUD는 등산 「등산 수첩」 종이 톤 계열입니다(`src/lounge/hud.css`). 일하는 방식(§4)·일시정지 없음·HUD 버튼·떠다니는 조이스틱 규칙은 등산과 같습니다.

### 실행·점검
- `npm run dev` 뒤 `http://127.0.0.1:5173/smoking/`. 주소 옵션 `?time=day|dusk|night|auto`.
- 콘솔 `window.lounge`: `status()`, `setTime()`, `teleport()`, `setCam()`, `goTo()`, `smoker`(start·light·puff·flick…), `npcs`, `multi`(join·leave·status·people).
- 같이 피우기 확인: `node scripts/capture-smoking-multi.mjs`(서버 8789·vite 5199를 직접 띄움, 두 브라우저 → `artifacts/multi-chat-2026-11-08/smoking-*.png`), `node scripts/verify-multi-chat.mjs`(등산·흡연장·격리).
- 캡처 `node scripts/capture-smoking.mjs <이름> <w> <h> "<query>" "<js>" <ms>` → `artifacts/smoking/`.
- 테스트 `tests/lounge-*.test.mjs`(흡연장 core·moment-record·npc-social·spots-scene·spots-walk·multi, 원래 이름에 `lounge-`를 붙임). HUD 덮는 넓이·겹치는 단추 측정 `node scripts/hud-cover.mjs <이름> <w> <h> "<query>" "<js>" <ms>` → `artifacts/smoking/`, `tests/smoke-feel.test.mjs`·`tests/smoke-run.test.mjs`.

### 코드 지도 (`src/lounge/`)
- 모듈끼리는 `ctx` 객체와 window 이벤트(`lounge:chat`·`lounge:smoke`·`lounge:phase`·`lounge:ready`·`lounge:emote`·`lounge:spot` 등)로만 주고받습니다.
- `main.js`(시작·루프·`window.lounge`), `scene.js`·`rooftop.js`(옥상), `avatar.js`·`outfit.js`(동동이 + 회사원 옷), `smoke.js`·`smoke-feel.js`(담배 상태·연기·맛), `npc.js`·`lines.js`(NPC·대화), `hud.js/.css`(수첩·흡연 버튼·채팅), `spots.js/.css`(자리), `moment.js`·`profile.js`(기록·금연 수첩), `audio.js`, `input.js`, `multi.js`(같이 피우기 연결: 전송·보간·상대 몸·상대 담배 `smokePlan`·채팅 중계, 이벤트 `lounge:multi-status`·`lounge:multi-note`), `multi-ui.js/.css`(👥 단추=상태 칩·참가 카드·이름표). HUD 말풍선은 `ctx.multi.avatarOf(id)`로 다른 사람도 찾고, NPC는 사람 채팅에 가끔 대답(`npc.js` `REMOTE_REACT`).

### 흡연장 결정 기록
| 날짜 | 결정 |
|---|---|
| 11-08 | 의견 보내기: 흡연장은 ⚙️ 설정 창 맨 아래 `💌 의견 보내기`와 「상황」 패널 맨 아래 같은 단추(둘 다 `lounge:feedback-open`, 카드는 hud.js가 공용 `src/feedback.js`로 설치). HUD에 새 단추를 늘리지 않음 |
| 11-08 | 옛 폴더 `~/online-smoking`에서만 했던 모바일 HUD 재배치·할 일 걷기 수정·대상 위 표시(`spots.js/.css`·`hud.js/.css`)와 담배 소리(`audio.js`·`smoke.js`)를 이 저장소로 합침(같이 피우기 줄은 살림). 「상황」 단추는 PC = 위 오른쪽 줄 아래, 휴대폰 = 오른쪽 가장자리 가운데라 `multi.css`의 옛 가로 규칙(상황 줄을 160px 왼쪽으로)은 지움. 대상 위 표시는 「상황」 단추와 겹치면 왼쪽으로 비킴. 걷기 실패는 `lounge:spot {state:'fail'}` + 알림. 측정 `scripts/hud-cover.mjs`(5173 `/smoking/`) |
| 11-08 | 같이 피우기(실시간 멀티) 연결: 흡연장 쪽 코드는 `src/lounge/multi.js`·`multi-ui.js`에 모음. 상대 옷은 ID로 결정적 선택(옷은 아직 안 보냄), 받는 쪽이 같은 smoke.js로 담배를 그림, 내 글은 서버 되돌림을 다시 그리지 않음, NPC 각본 대사는 안 보냄, NPC는 그대로 4명·사람 채팅에 가끔(0.3·12초) 대답, 상태 칩은 👥 단추가 겸함 |
| 11-08 | 메타버스 통합으로 `~/gwanak-hiking`의 `/smoking/`으로 옮김. 공용 코드 사본을 없애고 등산 원본을 import |
| 11-08 | **대표 지시: 옷은 등산복을 따라 하지 말고 회사원 옷.** 캐릭터(몸·비율·얼굴·동작)만 동동이 그대로. 옷 4종 = 셔츠·넥타이(기본)·정장 재킷·카디건·롱패딩 |
| 11-08 | 프로젝트 시작. 장소 = 서울 도심 빌딩 옥상 흡연장. 멀티는 미룸(NPC 4명). 시간대는 지금 서울 시각 기본 + 낮/노을/밤 고르기 |
