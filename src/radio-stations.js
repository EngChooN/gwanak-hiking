// 라디오 방송표 — 방송사 주소는 이 파일 한곳에만 둡니다(tests/radio.test.mjs가 src/ 전체를 훑어 막습니다).
//
// 대표 결정(2026-11-08, AGENTS.md §8): 방송사에 허락을 묻지 않습니다. 그래서
//  - STATIONS(앱이 실제 방송을 재생)는 계속 빈 배열입니다. 런타임 외부 접속 없음(AGENTS.md §5) 그대로.
//  - 우리 방송국 "관악산 FM"(FM_CHANNELS)은 같은 출처 assets/radio/의 CC0·CC-BY 파일만 틉니다(목록은 assets/radio/manifest.json).
//  - 실제 방송은 사용자가 누르는 새 탭 링크(EXTERNAL_LINKS)만. 앱이 이 주소로 fetch·<audio>·iframe 요청을 하지 않습니다.
// 근거: docs/radio-options.md §4, 화면·공식: docs/radio-design.md §1·§3-2.

export const FREQ_MIN = 87.5;
export const FREQ_MAX = 108.0;
export const FREQ_STEP = 0.1;

/** 앱 안에서 재생해도 되는 것으로 확인된 실제 방송. 허락 문의를 하지 않으므로 비어 있습니다. */
export const STATIONS = [];

/** 관악산 FM(게임 속 가상 주파수). 실제 방송사와 관계없습니다. */
export const FM_CHANNELS = Object.freeze([
  Object.freeze({ id: 'calm', freq: 91.9, name: '잔잔한 음악' }),
  Object.freeze({ id: 'guide', freq: 95.5, name: '산 날씨·등산 안내' }),
  Object.freeze({ id: 'nature', freq: 99.1, name: '숲과 바람' }),
]);

/** 실제 방송 듣기 — 새 탭 링크만(target=_blank rel="noopener noreferrer"). 글자 이름만, 로고 없음. 배포 전 대표가 한 번씩 열어 확인. */
export const EXTERNAL_LINKS = Object.freeze([
  Object.freeze({ id: 'cbs-music', name: 'CBS 음악FM', url: 'https://www.cbs.co.kr/onair/musicFm' }),
  Object.freeze({ id: 'cbs-fm', name: 'CBS 표준FM', url: 'https://www.cbs.co.kr/onair/fm' }),
  Object.freeze({ id: 'mbc-mini', name: 'MBC mini', url: 'https://mini.imbc.com' }),
]);

const round1 = (v) => Math.round(v * 10) / 10;
/** 다이얼 범위 안으로, 0.1 눈금에 맞춤 */
export const clampFreq = (f) => round1(Math.max(FREQ_MIN, Math.min(FREQ_MAX, Number.isFinite(f) ? f : FREQ_MIN)));

/** 주파수에 가장 가까운 방송(채널)과 거리(MHz). 목록이 비면 null. */
export function nearestStation(freq, stations = FM_CHANNELS) {
  let best = null;
  for (const s of stations) {
    const d = Math.abs(s.freq - freq);
    if (!best || d < best.dist) best = { station: s, dist: d };
  }
  return best;
}

/** 또렷함 0~1 (radio-design §3-2): 0.1 MHz 안 = 1, 0.9 MHz 밖 = 0, 그 사이 직선. */
export function clarityAt(freq, ch) {
  const d = Math.abs(freq - ch);
  if (d <= 0.1 + 1e-9) return 1;
  if (d >= 0.9 - 1e-9) return 0;
  return (0.9 - d) / 0.8;
}

/** 다이얼을 놓았을 때 방송 ±0.1 안이면 그 방송에 붙임(스냅). */
export function snapFreq(freq, channels = FM_CHANNELS) {
  const n = nearestStation(freq, channels);
  return n && n.dist <= 0.1 + 1e-9 ? n.station.freq : clampFreq(freq);
}

/** 수신 막대 글자 */
export function receptionLabel(clarity) {
  if (clarity <= 0) return '수신 불량…';
  if (clarity >= 0.9) return '수신 좋음';
  return clarity < 0.8 ? '수신 약함' : '수신 보통';
}

/**
 * 주파수·볼륨 → 섞기 값 (radio-design §3-2).
 *  broadcast = clarity^1.5 × 볼륨, noise = (1 − clarity)^0.8 × 볼륨 × 0.55, 저역 통과 = 800 + 5200 × clarity Hz, 막대 = ceil(clarity × 5)
 */
export function mixAt(freq, vol = 0.6, channels = FM_CHANNELS) {
  const n = nearestStation(freq, channels);
  const clarity = n ? clarityAt(freq, n.station.freq) : 0;
  const v = Math.max(0, Math.min(1, vol));
  return {
    channel: clarity > 0 ? n.station : null,
    nearest: n?.station ?? null,
    dist: n?.dist ?? Infinity,
    clarity,
    broadcast: clarity ** 1.5 * v,
    noise: (1 - clarity) ** 0.8 * v * 0.55,
    cutoff: 800 + 5200 * clarity,
    bars: Math.max(0, Math.ceil(clarity * 5 - 1e-9)),
    label: receptionLabel(clarity),
    locked: clarity >= 1,
  };
}
