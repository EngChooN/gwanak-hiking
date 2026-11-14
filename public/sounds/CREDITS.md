# 발소리 출처 · 변경 사항

원본은 design/sounds/에 보존하며 이 폴더는 동일 바이트 복사본입니다. 확인 근거는 design/발소리-소리목록.md(산디자인, 2026-11-02)입니다. 실제 관악산 계단의 현장 녹음·귀 검수를 완료한 음원이 아닌 임시음입니다.

- 흙(dirt/ 9개), 돌길(stone/ 8개), 데크(deck/ 3개): TinyWorlds, Fantozzi — OpenGameArt/Freesound (CC0).
  - https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud
  - https://opengameart.org/content/fantozzis-footsteps-grasssand-stone
- 돌계단(stairs/stone-stair-01~06.ogg): Fantozzi 돌길 L/R 원본의 산디자인 가공본, CC0. 피치·저역·길이·페이드·음량 조정.
- 통나무·데크 계단(stairs/log-stair-01~07.ogg): TinyWorlds wood01~03 및 BigSoundBank 0180의 산디자인 가공본, CC0.
  - https://bigsoundbank.com/steps-slipper-on-wooden-stairs--s0180.html
- 암릉(rock/ 2개): Rock walk step sound: Blender Foundation, Yo Frankie! (CC BY 3.0, https://creativecommons.org/licenses/by/3.0/), via OpenGameArt.
  - https://opengameart.org/content/rock-walk-step-sound-yo-frankie
  - 앱에서 음높이·음량 조정, 저역 보정, 길이 제한 및 끝 페이드함. 원본 FLAC 파일 자체는 변경하지 않았음.

앱 조작 안내 > 소리 출처에서도 표기를 확인할 수 있습니다. 라이선스가 다른 파일을 CC0로 일괄 재표기하지 않습니다.

## 즐길거리 효과음(trail/ 11개: ①~⑤ 7개 + ⑥ 헥헥·찌릿·비명·뒹굴 4개) — 2026-11-06

산디자인이 `scripts/make-trail-sfx.mjs`로 직접 합성한 소리입니다(외부 녹음·샘플 없음, CC0). 산스장 라디오 뽕짝도 자작 선율입니다. 자세한 표는 `assets/출처-라이선스.md`에 있습니다.

## 흡연장 효과음(lounge/ 10개) — 2026-11-13 (연디자인)

모두 CC0(퍼블릭 도메인) 녹음에서 잘라 만들었고, 새로 합성한 소리는 없습니다. 원본은 `design/sounds/lounge/raw/`에 그대로 두었고 자르는 방법은 `scripts/trim-lounge-sfx.mjs`입니다. 자세한 표는 `docs/흡연장/소리목록-2026-11-13.md`입니다.

- lighter-open: "Zippo click sound", dawith — OpenGameArt (CC0). https://opengameart.org/content/zippo-click-sound
- lighter-strike: BigSoundBank "Match" s0004 (CC0). https://bigsoundbank.com/match-s0004.html
- cig-burn: BigSoundBank "Cigarette 2" s2133 (CC0). https://bigsoundbank.com/cigarette-2-s2133.html
- inhale·exhale-short·exhale-mid: BigSoundBank "Sigh by the mouth" s1405 (CC0). https://bigsoundbank.com/sigh-by-the-mouth-s1405.html
- exhale-long: BigSoundBank "Sigh by the nose" s1404 (CC0). https://bigsoundbank.com/sigh-by-the-nose-s1404.html
- vending-button: BigSoundBank "Mobile key" s0176 + "Beep of a cash register" s1417 (CC0).
- can-drop: BigSoundBank "Tin can 4" s0249 (CC0). https://bigsoundbank.com/tin-can-4-s0249.html
- can-open: BigSoundBank "Can of soda opening" s0116 (CC0). https://bigsoundbank.com/can-of-soda-opening-s0116.html
- 가공: 필요한 구간만 자르고 모노·44.1kHz로 바꿈, 앞쪽 무음 제거, 끝 페이드, 피크 -3dB. lighter-strike는 작은 불꽃 소리를 가볍게 눌러 키우고 '치-화' 사이 빈 틈을 줄임, can-drop은 낮춘 사본을 깔아 '쿵'을 더함, cig-burn은 낮은 쪽을 깎고 이음매를 크로스페이드함.
- 담배를 멋있게 들리게 꾸미는 처리(울림·저음 키우기 등)는 하지 않았습니다.
