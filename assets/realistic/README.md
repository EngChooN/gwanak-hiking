# 실사풍 교체 준비 패키지

**미실행·미검증 소스 패키지입니다. 실사풍 완성 자산이 아닙니다.**

- [가정·연결 API·완료 기준 현황·대표 확인 필요 명령](인계-검증계획.md)
- [전체 자산 README](../README.md)
- [출처·라이선스](../출처-라이선스.md)
- `config.json`: 자료 범위·후보·예산·비교 지점
- `geo.js`: 게임과 동일한 좌표·고도·경로 연산
- `load-landscape.js`: 생성 데이터용 Three.js 로더
- `tools/prepare.mjs`: DEM·PBR·HDRI·OSM 다운로드 및 전처리
- `tools/verify.mjs`: 생성 후 좌표·폭·격자·바이트 검사
- `status.json`: 이번 작업의 실제 상태. 생성물 없음·검사 미실행
- `skyline-reference.js`: 연주대 기준 방위·거리 배치, 거리별 대비, 방위 오차
- `방위검토.html` / `direction-review.js`: 0°·60°·340°·200° 렌더 검토 화면(아직 실행하지 않음)
- `tools/capture-directions.mjs`: 네 장의 방위 주석 캡처·좌표 대조 보고 생성(미실행)
- [서울 원경 변경·검증 보고](서울원경-검증-보고.md)

자료가 없으면 로더는 실패합니다. 준비·검증 성공 뒤 산개발이 연결해야 합니다. Powered by Poly Haven.
