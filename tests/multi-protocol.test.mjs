import test from 'node:test';import assert from 'node:assert/strict';
import {NET,TIERS,sanitizeName,anonymousName,encodeState,decodeState,createInterpolator,classify,nearestWithin,selfieSpot,createSocial,createModeration,BINARY_STATE_BYTES} from '../src/multi-protocol.js';
import {createLoopbackHub} from '../src/multi-transport.js';

test('이름 정리: 제어문자·길이·링크·금칙어', () => {
 assert.equal(sanitizeName('  산‮타기\u0000  '), '산타기');
 assert.equal(sanitizeName('가'.repeat(30)).length, NET.nameMax);
 assert.equal(sanitizeName('http://spam.example', '등산객'), '등산객');
 assert.equal(sanitizeName('나쁜말닉', '대체', ['나쁜말']), '대체');
 assert.equal(sanitizeName('', anonymousName('ab12cd34')), '등산객CD34');
 assert.equal(sanitizeName('👍🏽산', 'x'), '👍🏽산');
});

test('위치 메시지 왕복과 크기', () => {
 const m = encodeState('a', 7, {zone:'summit', x:1.234, z:-5.678, heading:3.14159}, {speed:1.2, flags:2});
 const d = decodeState(m);
 assert.deepEqual([d.zone, d.x, d.z, d.heading, d.speed, d.flags, d.seq], ['summit', 1.23, -5.68, 3.14, 1.2, 2, 7]);
 assert.equal(decodeState({t:'s', x:NaN, y:1, h:0}), null);
 assert.ok(JSON.stringify(m).length < 90);
 assert.equal(BINARY_STATE_BYTES, 15);
});

test('보간: 지연 시각의 중간 위치, 각도 최단 경로, 오래된 패킷 무시', () => {
 const it = createInterpolator({delay:.1});
 it.push(0, {seq:1, zone:'plaza', x:0, z:0, heading:3.0});
 it.push(.1, {seq:2, zone:'plaza', x:1, z:0, heading:-3.0});
 assert.equal(it.push(.2, {seq:1, zone:'plaza', x:9, z:9, heading:0}), false);
 const s = it.sample(.15); // 보간 시각 .05
 assert.ok(Math.abs(s.x - .5) < 1e-9);
 assert.ok(Math.abs(Math.abs(s.heading) - Math.PI) < .2); // ±π를 가로질러 도는 쪽
 assert.ok(s.moving && Math.abs(s.speed - 10) < 1e-6);
});

test('보간: 끊기면 잠깐 이어 가다 멈춤, 구간 이동은 즉시', () => {
 const it = createInterpolator({delay:.1, maxExtrapolate:.2});
 it.push(0, {seq:1, zone:'route', x:0, z:0, heading:0});
 it.push(.1, {seq:2, zone:'route', x:1, z:0, heading:0});
 const a = it.sample(.35); // t=.25, 마지막+.15 → 외삽
 assert.ok(a.x > 1 && a.x < 2.6 && a.moving);
 const b = it.sample(2); assert.ok(b.x <= 1 + 10 * .2 + 1e-9 && !b.moving);
 it.push(2.1, {seq:3, zone:'route', x:300, z:0, heading:0});
 assert.equal(it.size, 1); assert.equal(it.sample(2.3).x, 300);
 it.push(2.2, {seq:4, zone:'summit', x:300, z:1, heading:0}); assert.equal(it.size, 1);
});

test('표시 단계: 모델 4명, 캡슐, 이름 8명, 점, 숨김', () => {
 const players = Array.from({length:60}, (_, i) => ({id:'p'+i, x:i*3, z:0}));
 const c = classify(players, {x:0, z:0});
 assert.equal(c.avatar.length, TIERS.fullCap);
 assert.ok(c.avatar.every(r => r.d <= TIERS.fullAvatar));
 assert.ok(c.name.length <= TIERS.nameCap && c.name.every(r => r.d <= TIERS.name));
 assert.ok(c.dot.every(r => r.d > 0 && r.d <= TIERS.dot) && c.dot.length <= TIERS.dotCap);
 assert.equal(c.avatar.length + c.capsule.length + c.hidden, 60);
 assert.ok(c.capsule.every(r => r.d <= TIERS.capsuleRange));
 assert.equal(nearestWithin(players.slice(1), {x:0, z:0}, 2), null);
 assert.equal(nearestWithin(players.slice(1), {x:0, z:0}, 4).player.id, 'p1');
});

test('같이 셀카 자리: 요청자 오른쪽 0.7m·뒤 0.45m, 같은 방향', () => {
 const s = selfieSpot({zone:'plaza', x:10, z:20, heading:0});
 assert.ok(Math.abs(s.x - 10.7) < 1e-9 && Math.abs(s.z - 20.45) < 1e-9 && s.heading === 0);
 const t = selfieSpot({zone:'plaza', x:0, z:0, heading:Math.PI / 2});
 assert.ok(Math.abs(t.z + .7) < 1e-9 && Math.abs(t.x - .45) < 1e-9);
});

function pair(distance = 3) {
 const out = {a:[], b:[]}, pos = {a:{x:0, z:0, zone:'plaza'}, b:{x:distance, z:0, zone:'plaza'}};
 const A = createSocial({id:'a', send:m => out.a.push(m), position:() => pos.b, mine:() => pos.a});
 const B = createSocial({id:'b', send:m => out.b.push(m), position:() => pos.a, mine:() => pos.b});
 const flush = (now) => { for (const m of out.a.splice(0)) B.handle(m, now); for (const m of out.b.splice(0)) A.handle(m, now); };
 return {A, B, flush, pos};
}

test('손 흔들기: 쿨다운, 거리 밖은 무시', () => {
 const {A, B, flush, pos} = pair(3);
 const seen = [];
 assert.equal(A.gesture('wave', 0), true);
 assert.equal(A.gesture('wave', 1), false);
 assert.equal(A.gesture('wave', 3.1), true);
 for (const m of [{t:'g', id:'a', k:'wave'}]) B.handle(m, 4, (id, k) => seen.push([id, k]));
 assert.deepEqual(seen, [['a', 'wave']]);
 pos.a.x = 100; B.handle({t:'g', id:'a', k:'wave'}, 5, (id, k) => seen.push([id, k]));
 assert.equal(seen.length, 1);
 B.handle({t:'g', id:'a', k:'dance'}, 6, (id, k) => seen.push([id, k]));
 assert.equal(seen.length, 1);
});

test('같이 셀카: 요청 → 수락 → 세션 → 시간이 지나면 종료', () => {
 const {A, B, flush} = pair(3);
 assert.equal(A.requestSelfie('b', 0).ok, true);
 assert.equal(A.requestSelfie('b', 1).reason, 'pending');
 flush(0.1);
 assert.equal(B.state.incoming.from, 'a');
 assert.equal(B.accept(1), true);
 flush(1.1);
 assert.equal(A.state.session.role, 'requester');
 assert.equal(B.state.session.role, 'partner');
 assert.equal(A.tick(2), null);
 assert.equal(A.gesture('wave', 2), false); // 세션 중에는 다른 행동 불가
 const ended = A.tick(1 + NET.selfieSeconds + .1);
 assert.equal(ended.partner, 'b'); assert.equal(A.state.session, null);
});

test('같이 셀카: 거절·시간 초과·멀리 있으면 실패, 중복 요청은 자동 거절', () => {
 let p = pair(3);
 p.A.requestSelfie('b', 0); p.flush(0); p.B.decline(1); p.flush(1);
 assert.equal(p.A.state.outgoing, null); assert.equal(p.A.state.session, null);
 p = pair(3);
 p.A.requestSelfie('b', 0); p.flush(0);
 assert.equal(p.B.accept(NET.selfieTimeout + 1), false); // 요청이 오래돼 수락 불가
 assert.equal(p.A.tick(NET.selfieTimeout + 1), null); assert.equal(p.A.state.outgoing, null);
 p = pair(NET.selfieRange + 1);
 assert.equal(p.A.requestSelfie('b', 0).reason, 'far');
 p = pair(3);
 p.A.requestSelfie('b', 0); p.flush(0); p.B.accept(1); p.flush(1);
 p.B.handle({t:'sr', id:'c', to:'b'}, 2); // 다른 사람의 요청은 바쁨 → 자동 거절 메시지
});

test('차단한 사람의 메시지는 버린다', () => {
 const sent = [], seen = [];
 const B = createSocial({id:'b', send:m => sent.push(m), position:() => ({x:1, z:0, zone:'plaza'}), mine:() => ({x:0, z:0, zone:'plaza'}), blocked:id => id === 'bad'});
 B.handle({t:'g', id:'bad', k:'wave'}, 0, () => seen.push('x'));
 B.handle({t:'sr', id:'bad', to:'b'}, 0);
 assert.equal(seen.length, 0); assert.equal(B.state.incoming, null);
 B.handle({t:'sr', id:'good', to:'b'}, 0); assert.equal(B.state.incoming.from, 'good');
});

test('신고·차단 기록은 저장되고 이유는 정해진 것만', () => {
 const store = new Map(), storage = {getItem:k => store.get(k) ?? null, setItem:(k, v) => store.set(k, v)};
 const m = createModeration({storage});
 assert.equal(m.report({id:'x', name:'n', reason:'모르는이유'}), false);
 assert.equal(m.report({id:'x', name:'n', reason:'방해·괴롭힘'}, 5), true);
 assert.equal(m.isBlocked('x'), true);
 assert.equal(createModeration({storage}).data.reports.length, 1);
 m.unblock('x'); assert.equal(m.isBlocked('x'), false);
});

test('가짜 방: 지연·유실·자기 자신 제외', () => {
 const hub = createLoopbackHub({latency:50, jitter:0, loss:0});
 const a = hub.join(), b = hub.join(), c = hub.join(), got = {a:0, b:0, c:0};
 a.onmessage(() => got.a++); b.onmessage(() => got.b++); c.onmessage(() => got.c++);
 a.send({x:1}, 0); hub.pump(40); assert.equal(got.b, 0); hub.pump(60);
 assert.deepEqual(got, {a:0, b:1, c:1});
 const lossy = createLoopbackHub({latency:0, jitter:0, loss:1}), p = lossy.join(), q = lossy.join(); let n = 0; q.onmessage(() => n++);
 p.send({}, 0); lossy.pump(10); assert.equal(n, 0); assert.equal(lossy.stats.dropped, 1);
});
