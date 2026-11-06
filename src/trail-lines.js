// 즐길거리 말풍선 문구와 효과음 표(2026-11-06, 산디자인). 웃음 세기는 승인 시안(artifacts/props-concepts/board.html) 정도:
// 몸 개그 + 말풍선 한 줄. 첫 문구가 시안 그대로이고, 나머지는 같은 세기의 바꿔 쓰기(여러 번 들러도 덜 지루하게).
// 종류(kind): '' 동동이 말 · 'sfx' 소리 글자(형광펜 노랑) · 'tag' 이름표·속마음. 자리(at): head·soul·hat·feet·hands·animal.
// 쓰는 법: const l=pickLine('gym-lift.start');say(l.text,{kind:l.kind,at:l.at,seconds:l.seconds});
export const TRAIL_LINES={
 // ① 산스장 — 역기(머리로 듦)
 'gym-lift.start':{kind:'',at:'head',seconds:2.4,lines:['팔이… 짧아서… 머리로 들었다','이거 시멘트야… 바위야…','모자가… 납작해진다…']},
 'gym-lift.strain':{kind:'sfx',at:'hands',seconds:1.2,lines:['부들부들','끄응…','후들후들']},
 'gym-lift.done':{kind:'',at:'head',seconds:1.8,lines:['득근!! 💪','득근!! (모자는 납작)','득근!! 내일 팔 못 듦']},
 // 거꾸리
 'gym-hang.start':{kind:'',at:'head',seconds:2.8,lines:['피가 머리로 쏠린다… 원래 머리가 몸 절반인데…','세상이 뒤집혔다…','하늘이 발밑에 있다…']},
 'gym-hang.hat':{kind:'sfx',at:'hat',seconds:1.6,lines:['툭 (모자)']},
 // 허리돌리기
 'gym-twist.spin':{kind:'sfx',at:'head',seconds:1.6,lines:['빙글빙글~','뱅글뱅글~']},
 'gym-twist.dizzy':{kind:'',at:'head',seconds:1.8,lines:['어지러워…','길이… 두 개로 보여…','산이 돈다…']},
 // 철봉
 'gym-bar.hang':{kind:'',at:'head',seconds:2,lines:['발이… 안 닿아…!','철봉이 높은 거야… 다리가 아니라…','내려 줘…!']},
 'gym-bar.kick':{kind:'sfx',at:'feet',seconds:1.2,lines:['버둥버둥']},
 // 라디오(산스장 근처를 지날 때)
 'gym-radio':{kind:'sfx',at:'animal',seconds:1.6,lines:['♪ 뽕짝 ♪','♪ 쿵짝 쿵짝 ♪']},
 // ③ 벤치 — 영혼
 'bench.soul':{kind:'',at:'soul',seconds:2.6,lines:['후우… (영혼 휴식 중)','영혼: 5분만…','…(영혼 외출 중)']},
 'bench.back':{kind:'sfx',at:'head',seconds:1,lines:['쏙!']},
 'bench.cat':{kind:'tag',at:'animal',seconds:2.2,lines:['(자리 맡아 둠)']},
 // ② 초콜릿
 'choco.eat':{kind:'',at:'head',seconds:1.8,lines:['당 충전!! 슝—','바삭! 다리에 모터 달렸다','초콜릿 파워!!']},
 'choco.crunch':{kind:'sfx',at:'head',seconds:1,lines:['바삭!']},
 'choco.squirrel':{kind:'tag',at:'animal',seconds:2,lines:['…(침)']},
 // ④ 다람쥐
 'squirrel.look':{kind:'sfx',at:'animal',seconds:1,lines:['찍?','찍찍?']},
 'squirrel.hat':{kind:'tag',at:'animal',seconds:2.2,lines:['여기 내 자리']},
 'squirrel.heavy':{kind:'tag',at:'head',seconds:2,lines:['…무거워','…목이 짧아지는 기분']},
 'squirrel.flee':{kind:'sfx',at:'animal',seconds:1,lines:['찍!']},
 // 고양이
 'cat.pet':{kind:'',at:'animal',seconds:2.4,lines:['골골골…','골골… (배 보여 줌)']},
 'cat.punch':{kind:'sfx',at:'animal',seconds:1.2,lines:['냥펀치!']},
 'cat.after':{kind:'',at:'head',seconds:1.4,lines:['앗!','…맞을 만했다']},
 // 까치
 'magpie.fly':{kind:'sfx',at:'animal',seconds:1,lines:['깍깍!','푸드덕']},
 'magpie.ride':{kind:'sfx',at:'animal',seconds:1.8,lines:['깍! (같이 감)']},
 'magpie.rider':{kind:'tag',at:'head',seconds:2,lines:['…무임승차?','…배낭 무거워졌다']},
 // ⑤ 에어건
 'airgun.blast':{kind:'sfx',at:'feet',seconds:1.6,lines:['치이이익—!!!']},
 'airgun.hat':{kind:'',at:'head',seconds:1.8,lines:['내 모자!!']},
 'airgun.land':{kind:'sfx',at:'hat',seconds:1,lines:['툭']},
 'airgun.shine':{kind:'tag',at:'feet',seconds:1.8,lines:['신발 반짝 ✨','새 신발 같다!']},
 // ⑥ 무리해서 뛰면(산풍경 동작에 있던 문구를 표로 옮김, 2026-11-06 산개발)
 'pant.start':{kind:'',at:'head',seconds:2.5,lines:['헥… 헥… 다리가… 내 말을… 안 들어…']},
 'cramp.start':{kind:'',at:'head',seconds:2.4,lines:['으아아 쥐났다!! 종아리!!']},
 'cramp.zap':{kind:'sfx',at:'calf',seconds:1.2,lines:['찌릿']},
 'cramp.release':{kind:'',at:'head',seconds:1.4,lines:['발끝… 쭈욱—']},
 'cramp.done':{kind:'',at:'head',seconds:1.6,lines:['휴… 풀렸다']},
};

// 같은 자리에서 바로 전 문구는 피한다(문구가 둘 이상일 때).
const last=new Map();
export function pickLine(id,random=Math.random){
 const e=TRAIL_LINES[id];if(!e)return null;const n=e.lines.length;let i=Math.floor(random()*n)%n;
 if(n>1&&i===last.get(id))i=(i+1)%n;last.set(id,i);return {text:e.lines[i],kind:e.kind,at:e.at,seconds:e.seconds};
}

// 효과음 표. 파일은 public/sounds/trail/(scripts/make-trail-sfx.mjs로 자체 합성, CC0).
// db = 재생 음량(발소리 기준 0dB 대비), rate = 재생 속도 흔들기 범위(같은 소리 반복이 덜 기계적), loop = 반복,
// near = 이 거리(m) 안에서만 들림(라디오: 가까울수록 크게, near 밖 0). on = 틀 때(hiking:trail type 또는 말풍선 id).
export const TRAIL_SFX={
 radio:{file:'radio-ppongjjak-loop.wav',db:-14,loop:true,near:18,on:'산스장 18m 안(거리 감쇠, 자동걷기로 지나갈 때도)'},
 airgun:{file:'airgun-hiss.wav',db:-6,rate:[.96,1.04],on:'airgun-blast'},
 squeak:{file:'squirrel-squeak.wav',db:-10,rate:[.9,1.12],on:"tone('squeak') 자리"},
 meow:{file:'cat-meow.wav',db:-9,rate:[.92,1.08],on:"tone('meow') 자리"},
 caw:{file:'magpie-caw.wav',db:-8,rate:[.94,1.06],on:"tone('caw') 자리"},
 crunch:{file:'choco-crunch.wav',db:-6,rate:[.95,1.05],on:'choco-eaten'},
 whoo:{file:'soul-whoo.wav',db:-10,on:'bench.soul 말풍선과 함께'},
 // ⑥ 무리해서 뛰면 — trail-world.js의 합성음 tone('pant')·tone('zap') 자리를 이 파일로 바꾼다
 pant:{file:'pant-huff.wav',db:-8,rate:[.94,1.08],on:"'pant'·'pant-breath'(헥헥 1.5초, 터벅터벅 중 가끔)"},
 zap:{file:'cramp-zap.wav',db:-9,rate:[.95,1.05],on:"'cramp-zap'(0.5초에 한 번까지)"},
 scream:{file:'cramp-scream.wav',db:-9,on:"'exhaust' phase가 'cramp'로 바뀌는 순간 한 번(동동이 '으아아 쥐났다!!' 말풍선과 함께)"},
 roll:{file:'cramp-roll.wav',db:-12,rate:[.95,1.05],on:'쥐 동안 1.5초마다(뒹굴뒹굴 좌우 한 번 = 쓸림 한 번), 발끝 당기기로 풀리면 멈춤'},
};
