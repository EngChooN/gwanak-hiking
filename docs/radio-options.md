# 라디오 선택지 조사 — 허락 없이 할 수 있는 길만 (2026-11-08, 산리서치)

범위: 방송사·외부에 연락하지 않습니다(대표 결정). 약관·공식 페이지의 공개 문구만 근거로 삼고, 근거가 애매하면 **불가**로 분류합니다. 법률 자문이 아닙니다(⚖️ 법무 확인 항목은 맨 끝).
직전 조사(`docs/라디오-방송-이용조건.md`)의 국내 8곳 약관 판정은 그대로 유효합니다.

## 추천안 (결론)

**1순위: 자체 방송국 "관악산 FM" — CC0·CC-BY 음악을 우리 서버에 올려 재생.** 외부 접속이 없어 AGENTS.md §5 "런타임 외부 접속 없음"을 깨지 않고, 아이폰에서 볼륨 노브·잡음 효과(Web Audio)도 CORS 걱정 없이 됩니다. 약관상 허락이 필요한 일이 없습니다.
**2순위(보조): 방송사 공식 웹 플레이어·앱으로 가는 "링크만" 두기.** 앱이 소리를 틀지 않고 사용자가 누르면 새 탭으로 열 뿐이라 재송신·복제가 아닙니다. 다만 실제 방송은 게임 소리와 섞이지 않습니다.
**실제 방송을 앱 안에서 직접 틀기: 후보 없음(전부 불가).** 근거는 §1.

## 1. 실제 방송 — "외부·제3자 플레이어 재생 허용"을 공개한 곳

**결과: 찾지 못했습니다. 전부 불가입니다.** 허용 문구가 확인된 방송이 0곳이므로 `STATIONS`는 계속 빈 채로 둡니다.

| 방송 | 근거 문구·출처 | 송출 주소 / CORS | 분류 |
|---|---|---|---|
| KBS | 약관 제10조 ④ "회사가 허용한 경우를 제외하고 … 본 사이트 이외의 공간에 … 공중송신" 금지. https://sso.kbs.co.kr/SSO2/KBSWeb/information/ServiceTerms00SN.php | 토큰 주소(약 48시간). PC 크롬 CORS 통과 | 불가 |
| MBC | 약관 제11조 ③ 서비스 내 이용 외 복제·전송 금지. https://m.imbc.com/notice/terms.html | 토큰 주소. CORS 통과 | 불가 |
| SBS | 약관 제15조 "서비스 외에서의 … 일체의 이용은 금지". https://m.sbs.co.kr/main/customer_rules_01.do | 토큰 주소. 시간대에 따라 온에어 불가 | 불가 |
| EBS | 약관 제12조 ④ 1호 사전 승낙 없는 "방송 기타의 방법으로 사용" 금지. https://sso.ebs.co.kr/policy/termsInfo | 고정 주소, CORS 통과 | 불가 |
| CBS | 외부 재생 허용 문구 없음(금지 문구도 없음), 제13조 ① 8호 영리 목적 사용 금지. https://www.cbs.co.kr/event/view/TermsofService | 고정 주소, CORS 통과 | 불가(허용 근거 없음) |
| TBS | 공공누리 1유형은 홈페이지 저작물만, 라이브에는 표시 없음. https://tbs.seoul.kr/help/policy.do | 고정 주소, CORS 통과 | 불가 |
| 국악방송 | 약관 페이지를 찾지 못함 | 고정 주소, CORS 통과 | 불가(근거 없음) |
| 아리랑 | 약관 본문 확인 못함 | 확인 못함 | 불가(근거 없음) |
| SomaFM | **명시 금지.** 약관: "Embedding the Content in any website, application, or platform without explicit prior written permission from SomaFM", "We can't grant permission for third-party SomaFM clients or applications, even noncommercial ones." https://somafm.com/contact/tos.html (2026-09-04 갱신) | `.pls` 주소는 링크용으로만 안내(https://somafm.com/linktous/) | 불가 |
| KEXP | 약관: 개인·비상업 이용만, "not to resell or make commercial use of the Sites". 임베드 직접 언급은 없음. https://kexp.org/terms-and-conditions/ (2024-04-24) | 재생 주소 확인 못함 | 불가 |
| NTS Radio | 읽은 약관(https://www.nts.live/terms-and-conditions)은 후원 약관뿐, 스트림 이용 조항 없음 | 확인 못함 | 불가(근거 없음) |
| Radio Paradise | 사이트 약관 본문을 읽지 못함(검색으로도 약관 미확인) | 확인 못함 | 불가(근거 없음) |
| BBC, Radio France/FIP | 약관 페이지가 이 환경에서 열리지 않음 | 확인 못함 | 불가(확인 못함) |
| Internet Archive 라이브, Radio Browser | 본문이 비어 읽지 못함. Radio Browser는 남의 스트림 주소를 모아 둔 목록이라 목록 자체가 재생 허락이 아님 | — | 불가(확인 못함) |

- "공식 사이트가 쓰는 주소를 시험해 보니 재생된다"는 허용 근거가 아닙니다. 방송사가 막거나 바꿀 수 있습니다.
- 우리 서버에서 받아 다시 내보내는 중계는 재송신이라 후보에서 뺐습니다.
- 확인 못함이 많은 곳(BBC·Radio France·Radio Paradise·Internet Archive)은 대표가 브라우저로 약관을 직접 읽어 보면 판정이 바뀔 수 있습니다. 읽어서 "제3자 재생 허용"이 나오면 이 표만 갱신하면 됩니다.

## 2. 자체 방송국 "관악산 FM" — 음악·소리 출처

모든 곡은 **곡마다 라이선스가 다릅니다.** 곡 단위로 라이선스를 확인해 `data/자료-출처-이용조건-기록표.md`에 한 줄씩 적은 뒤에만 서버에 올립니다. 비상업(NC)·SA(동일조건)·ND(변경금지)·FMA-Limited 곡은 쓰지 않습니다.

| 출처 | 라이선스 조건 (읽은 원문) | 표기 방법 | 서버에 올려 게임 안에서 재생 | 비고 |
|---|---|---|---|---|
| **Kevin MacLeod (incompetech.com)** | 곡 대부분 CC-BY(옛 곡은 3.0, 새 곡은 4.0). 공식 라이선스 페이지는 이 환경에서 404라 직접 읽지 못했고, FAQ 요약 검색으로 "Kevin MacLeod (incompetech.com)을 표기, CC BY 링크 제시" 확인(https://incompetech.com/music/royalty-free/faq.html) | `"곡명" Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 License / http://creativecommons.org/licenses/by/4.0/` — 곡 페이지의 버전(3.0/4.0)에 맞춤 | **가능**(CC BY는 상업적 복제·재배포 허용: https://creativecommons.org/licenses/by/4.0/). 단 라이선스 원문을 대표가 한 번 열어 확인 필요 | 곡 수 많음. 환경음악·잔잔한 곡 많아 1순위 |
| **Freesound (CC0 필터)** | CC0는 "for the 'zero' license you can do pretty much what you want with the sound". BY는 제작자 표기, BY-NC는 수익 활동 금지. https://freesound.org/help/faq/ | CC0는 불필요(출처 기록은 우리가 보관). BY는 `"소리명" by 작성자 (http://freesound.org/s/소리ID/) licensed under CC BY 4.0` | **CC0·BY만 가능** | 자연 소리(바람·새·계곡·발소리) 채널용. "Freesound isn't meant for sharing songs"라 음악은 부적합 |
| **Wikimedia Commons (퍼블릭도메인·CC0·CC-BY)** | 공개 파일은 PD 또는 CC0급, NC 전용은 받지 않음. https://commons.wikimedia.org/wiki/Commons:Licensing | 파일 설명 페이지의 저작자·라이선스 정보 그대로 | **가능**(파일별 확인) | 오래된 클래식은 작곡이 PD여도 **녹음 저작권**이 따로 있을 수 있어 녹음의 라이선스를 확인 |
| **OpenGameArt (CC0·CC-BY만 필터)** | FAQ 요약(검색 결과로 확인, 사이트는 이 환경에서 403): 상업 게임에서도 각 작품 라이선스를 지키면 사용 가능, CC-BY는 표기, CC0는 링크 권장 | `에셋명 · 작성자 · 라이선스 · URL` | **가능**(작품별 확인) | 게임용 루프 음악·효과음 위주. FAQ 원문은 대표가 열어 확인 필요 |
| **Free Music Archive** | CC BY는 표기 필수, NC는 상업 이용 불가, "FMA-Limited"는 재배포 금지. https://freemusicarchive.org/faq | `"곡명" by 아티스트 / From the Free Music Archive, CC BY` | **CC BY·CC0 곡만 가능** | FAQ가 CC0에도 표기를 요구하는 등 모순이 있어 곡 페이지에서 확인. 아티스트가 Content ID 클레임을 걸 수 있다고 안내 |
| ~~Pixabay 음악~~ | 상업 이용·표기 불필요이지만 "cannot sell or distribute Content … on a Standalone basis". https://pixabay.com/service/license-summary/ | — | **보류(불가 쪽)**: 곡 파일을 그대로 내려주는 방식이 단독 배포 금지와 충돌할 소지 | 근거가 애매해 제외 |
| 확인 못함 | Purple Planet(원문 없음), Uppbeat(429), Musopen(403) | — | 불가(확인 못함) | |

- 서버 업로드 규칙: 우리 서버에서 곡 파일을 전송하는 것은 CC0·CC-BY 모두 "상업적 복제·재배포 허용" 범위입니다. CC-BY 곡은 **게임 안 크레딧 화면(또는 설정의 "소리 출처")에 표기**를 반드시 두고, 변경(루프 편집·페이드)했으면 "변경함"을 적습니다.
- 곡마다 라이선스가 다르다는 점이 가장 큰 위험입니다. 곡을 고르면 라이선스 페이지 주소·확인일을 기록표에 남기는 것을 완료 조건으로 합니다.

### 채널 구성 예시 (3채널, 다이얼 위 가상 주파수)

| 채널 | 주파수(예) | 내용 | 주 출처 |
|---|---|---|---|
| ① 관악산 FM 잔잔한 음악 | 91.9 | CC0·CC-BY 환경음악·어쿠스틱 6~10곡 순환 | Kevin MacLeod, OpenGameArt |
| ② 산 날씨·등산 안내 | 95.5 | 게임 안 날씨·시각·계절 상태를 읽어 우리가 쓴 문구를 말하는 멘트(자작 대본). 음성은 직접 녹음하거나 브라우저 합성음성 대신 **직접 녹음 파일**(합성음성 서비스는 약관 별도 확인) | 자작 |
| ③ 숲과 바람(자연 소리) | 99.1 | 바람·새·계곡물 루프를 길게 이어 방송처럼 흘림 | Freesound CC0 |

방송이 없는 주파수는 "수신 불량 + 잡음"(이미 정한 동작). 아이폰에서는 서버 파일을 같은 출처에서 받으므로 CORS 문제가 없습니다.

## 3. 링크로 넘기기 — 공식 웹 플레이어·앱

**판정: 문제없다고 봅니다(근거 약함 주의).** 확인한 약관 중 외부 사이트의 단순 링크를 금지하거나 사전 승인을 요구하는 조항은 없었습니다(CBS 이용약관 제1~23조 전체 확인, 나머지 방송사는 링크 조항 언급 없음 — 단 일부 약관은 이 환경에서 못 읽음). 앱이 소리를 틀거나 화면에 끼워 넣지 않고(프레임·iframe 금지), 사용자가 누르면 새 탭(`target=_blank rel="noopener noreferrer"`)으로 방송사 페이지만 엽니다. 방송사 로고·이름 사용은 상표 문제가 있으니 **글자 이름만** 씁니다.
SomaFM은 링크 안내 페이지(https://somafm.com/linktous/)가 링크 자체를 환영하는 문구를 두고 있습니다.

| 방송 | 공식 링크 | 확인 결과 | 앱 이름 |
|---|---|---|---|
| KBS | https://kong.kbs.co.kr | 이 환경에서 접속 불가(도구 차단). 대표가 브라우저로 확인 필요 | KBS KONG(앱스토어 확인) |
| MBC | https://mini.imbc.com | 열림(→ miniwebapp.imbc.com, 200). 명칭 "MBC 스마트라디오 mini" | 미니(앱 이름은 페이지에서 확인 못함) |
| SBS | https://www.sbs.co.kr/radio/gorealra.html (블로그 언급, 미확인). 이전에 쓴 gorealra.sbs.co.kr은 404 | **링크 확인 못함** | SBS 고릴라(앱스토어 확인) |
| EBS | https://www.ebs.co.kr (307, 라디오 페이지 위치 확인 못함) | 홈페이지만 확인 | EBS 반디(앱스토어 확인) |
| CBS | https://www.cbs.co.kr/onair/musicFm (음악FM), /onair/fm (표준FM) | 열림(200), 메뉴에서 확인 | 레인보우 |
| TBS | https://tbs.seoul.kr | 인증서 오류로 확인 못함 | 확인 못함 |
| 국악방송 | https://igbs.kr | **주의: 이 환경에서 열었더니 도박 사이트 내용이 나왔음.** 공식 주소가 맞는지, 가로채인 것인지 대표가 확인하기 전까지 링크 목록에 넣지 않음. 앱은 "국악방송 덩더쿵"(앱스토어 확인) | 덩더쿵 |
| 아리랑 | https://radio.arirang.com | DNS 실패 | 확인 못함 |

→ 링크를 코드에 넣기 전에 **대표가 브라우저로 각 링크를 한 번씩 열어 보는 것**을 조건으로 합니다(위에서 "확인 못함"인 5곳은 특히). 확인된 CBS·MBC 두 곳만 먼저 넣어도 됩니다.

## 4. 바뀐 규칙: 외부 접속 예외 범위

- 앱이 코드로 외부 방송 주소에 접속하는 예외는 **만들지 않습니다.** `STATIONS`는 비어 있고, AGENTS.md §5 "런타임에 외부 지도·CDN·사진 서비스에 접속하지 않습니다"는 그대로입니다.
- 새로 허용하는 것: **사용자가 직접 누르는 하이퍼링크**(새 탭). 앱이 외부 서버로 요청을 보내는 것이 아니라 브라우저가 사용자 동작으로 이동하는 것이므로 §5 위반이 아닙니다. 링크는 `src/radio-stations.js`에 한곳으로 모읍니다.
- 음악·소리 파일은 우리 서버(같은 출처)에서만 받습니다.

## ⚖️ 법무·대표 확인 필요

1. 각 링크·약관을 대표가 브라우저로 열어 확인(특히 igbs.kr 도박 사이트 응답, kong.kbs.co.kr, SBS·TBS·아리랑·EBS 라디오 링크).
2. Kevin MacLeod 라이선스 원문(incompetech 404)과 OpenGameArt FAQ 원문(403) 직접 확인.
3. 곡을 고를 때마다 곡 라이선스 페이지 확인 → 기록표 기입(CC-BY 크레딧 문구는 게임 안에 두기).
4. 앱을 상업적으로 쓸 경우 NC·SA 곡 제외 유지.
5. 방송 재송신·링크에 대한 법령은 읽지 않았습니다.
