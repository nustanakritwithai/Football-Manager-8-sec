// P2.7 Ball Physics Lite tests — rolling, bounce, deflection, first touch, rebound, second ball
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick, firstTouchQuality, secondBallScore } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const {
  createBall, ensureBallPhysics, makeLoose, createRebound,
  stepLooseBall, applyBallGravity, handleGroundBounce, reflectVelocity, giveBall,
} = await import(`${BASE}/ball.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);
const { firstTouchAttr, reactionAttr } = await import(`${BASE}/player.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- 1) Ball state upgrade + save/load migration ----
{
  const b = createBall();
  for (const f of ['z', 'velocityZ', 'spin', 'radius', 'bounciness', 'friction', 'airDrag', 'ballMode']) {
    assert(b[f] !== undefined, `createBall ต้องมี field ${f}`);
  }
  // save เก่าที่ไม่มี field ฟิสิกส์ → ต้องเติม default ไม่ crash
  const state = createInitialState('4-2-3-1');
  const data = serialize(state);
  delete data.ball.z; delete data.ball.velocityZ; delete data.ball.spin; delete data.ball.ballMode;
  assert(validateSave(data).ok, 'legacy ball save ต้อง validate ผ่าน');
  const fresh = createInitialState('4-3-3');
  applySave(fresh, data);
  assert(fresh.ball.z === 0 && fresh.ball.velocityZ === 0, 'load save เก่าแล้ว z/velocityZ ต้องเป็น 0');
  assert(typeof fresh.ball.ballMode === 'string', 'ballMode ต้องถูกเติม default');
  playTurn(fresh);
  assert(Number.isFinite(fresh.ball.x) && Number.isFinite(fresh.ball.z), 'เล่นต่อหลัง load แล้วบอลไม่พัง');
  console.log('Ball state + migration OK');
}

// ---- 2) Rolling ball physics: loose ball ไหลต่อแล้วค่อยๆ หยุด ----
{
  const b = ensureBallPhysics({ ...createBall(), x: 30, y: 34, isLoose: true });
  b.velocityX = 12; b.velocityY = 0; b.z = 0;
  const x0 = b.x;
  let ticks = 0;
  while (Math.hypot(b.velocityX, b.velocityY) > 0 && ticks < 200) { stepLooseBall(b); ticks++; }
  assert(b.x > x0 + 2, 'บอลต้องกลิ้งไปข้างหน้าจริง');
  assert(Math.hypot(b.velocityX, b.velocityY) === 0, 'บอลต้องค่อยๆ หยุดจาก friction');
  assert(ticks > 3 && ticks < 120, `บอลไม่หยุดทันทีและไม่กลิ้งไม่จบ (${ticks} ticks)`);
  console.log(`Rolling OK — กลิ้ง ${(b.x - x0).toFixed(1)}m แล้วหยุดใน ${ticks} ticks`);
}

// ---- 3) Bounce physics: z + gravity + เด้งลดแรงลง ไม่เด้งไม่จบ ----
{
  const b = ensureBallPhysics({ ...createBall(), x: 50, y: 34, isLoose: true });
  b.z = 6; b.velocityZ = 0; b.velocityX = 0; b.velocityY = 0;
  const peaks = [];
  let prevZ = b.z, rising = false, ticks = 0;
  while (ticks < 300) {
    stepLooseBall(b);
    if (b.z > prevZ) rising = true;
    if (rising && b.z < prevZ) { peaks.push(prevZ); rising = false; } // จุดสูงสุดของแต่ละครั้งเด้ง
    prevZ = b.z;
    if (b.z === 0 && b.velocityZ === 0) break;
    ticks++;
  }
  assert(peaks.length >= 1, 'บอลต้องเด้งอย่างน้อยหนึ่งครั้ง');
  if (peaks.length >= 2) {
    assert(peaks[1] < peaks[0], `ความสูงเด้งต้องลดลง (${peaks.map((p) => p.toFixed(1))})`);
  }
  assert(b.z === 0, 'สุดท้ายบอลต้องตกถึงพื้น (ไม่เด้งไม่จบ)');
  console.log(`Bounce OK — peaks ${peaks.map((p) => p.toFixed(1)).join(',')} แล้วหยุดเด้ง`);
}

// ---- 4) Deflection angle: สะท้อน vector รอบ normal ----
{
  // บอลพุ่ง +x ชนผู้เล่นที่อยู่ทาง +x (normal ชี้กลับมา -x) → สะท้อนกลับ -x
  const r = reflectVelocity(10, 0, -1, 0, 0);
  assert(r.x < 0, `บอลพุ่ง +x ต้องสะท้อนกลับเป็น -x (ได้ ${r.x.toFixed(1)})`);
  // มุมเฉียง: คงขนาดความเร็วโดยประมาณ
  const r2 = reflectVelocity(6, 8, 1, 0, 0);
  const speed1 = Math.hypot(6, 8), speed2 = Math.hypot(r2.x, r2.y);
  assert(Math.abs(speed1 - speed2) < 0.01, 'การสะท้อนต้องรักษาขนาดความเร็ว');
  console.log('Deflection angle OK');
}

// ---- 5) First touch: ลูกง่ายรับได้ดี / บอลแรง+โดนบีบ+เด้ง รับยาก ----
{
  const state = createInitialState('4-2-3-1');
  const cm = state.players.find((p) => p.team === 'home' && ['CM','AM','DM'].includes(p.role));
  // ลูกง่าย: บอลนิ่ง ไม่มี pressure
  const easy = ensureBallPhysics({ ...createBall(), velocityX: 0, velocityY: 0, flightSpeed: 0, z: 0 });
  const qEasy = firstTouchQuality(cm, easy, 0);
  // ลูกยาก: บอลแรง เด้งสูง โดนบีบ
  const hard = ensureBallPhysics({ ...createBall(), velocityX: 26, velocityY: 6, z: 3, flightSpeed: 26 });
  const qHard = firstTouchQuality(cm, hard, 2.5);
  assert(qEasy > 0.55, `ลูกง่ายในพื้นที่โล่งต้องรับได้ดี (q=${qEasy.toFixed(2)})`);
  assert(qHard < qEasy, `บอลแรง+เด้ง+โดนบีบต้องรับยากกว่า (hard=${qHard.toFixed(2)} < easy=${qEasy.toFixed(2)})`);
  assert(firstTouchAttr(cm) > 0 && reactionAttr(cm) > 0, 'firstTouch/reaction attr ต้องคำนวณได้');
  console.log(`First touch OK — easy q=${qEasy.toFixed(2)}, hard q=${qHard.toFixed(2)}`);
}

// ---- 6) Second ball score: ผู้เล่นใกล้/เร็ว/หันเข้าหาบอล ได้คะแนนสูงกว่า ----
{
  const state = createInitialState('4-2-3-1');
  state.ball.x = 60; state.ball.y = 34; state.ball.isLoose = true;
  const near = state.players.find((p) => p.team === 'home' && ['CM','AM','DM'].includes(p.role));
  const far = state.players.find((p) => p.team === 'home' && p.role === 'GK');
  near.x = 58; near.y = 34; near.targetX = 60; near.targetY = 34; // หันเข้าหาบอล
  far.x = 4; far.y = 34;
  const sNear = secondBallScore(state, near, state.ball);
  const sFar = secondBallScore(state, far, state.ball);
  assert(sNear > sFar, `ผู้เล่นใกล้บอลควรได้คะแนน second ball สูงกว่า (${sNear.toFixed(2)} > ${sFar.toFixed(2)})`);
  console.log(`Second ball score OK — near ${sNear.toFixed(2)} > far ${sFar.toFixed(2)}`);
}

// ---- 7) Full match: เกิด rebound/block/parry/loose จริง และเกมไม่พัง ----
{
  const tally = { blocked: 0, parried: 0, post: 0, deflected: 0, secondBall: 0, firstTouch: 0, loose: 0 };
  let matches = 8;
  for (let m = 0; m < matches; m++) {
    const state = createInitialState('4-2-3-1');
    state.tacticalScores = analyze(state).scores;
    while (state.phase !== 'finished') {
      playTurn(state);
      for (const e of state.history.at(-1).events) {
        if (e.includes('Shot blocked')) tally.blocked++;
        if (e.includes('parried')) tally.parried++;
        if (e.includes('hits the post')) tally.post++;
        if (e.includes('deflected') || e.includes('ricocheted')) tally.deflected++;
        if (e.includes('second ball') || e.includes('reacts first')) tally.secondBall++;
        if (e.includes('first touch')) tally.firstTouch++;
        if (e.includes('loose')) tally.loose++;
      }
      for (const p of state.players) {
        assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'NaN player position');
      }
      assert(Number.isFinite(state.ball.x) && Number.isFinite(state.ball.z), 'NaN ball position/height');
      assert(state.ball.z >= 0, 'z ของบอลต้องไม่ติดลบ');
    }
  }
  // ในหลายแมตช์ ต้องเกิดจังหวะบอลกระเด็นหลากหลายบ้าง (ไม่ใช่ทุกอย่างเป็น goal/miss ทันที)
  assert(tally.blocked + tally.parried + tally.post > 0, 'ต้องมี block/parry/post เกิดบ้าง');
  assert(tally.secondBall > 0, 'ต้องมีการแย่ง second ball เกิดบ้าง');
  assert(tally.loose > 0, 'ต้องมี loose ball เกิดบ้าง');
  const per = (v) => (v / matches).toFixed(1);
  console.log(`Match physics OK — /match: blocked ${per(tally.blocked)}, parried ${per(tally.parried)}, post ${per(tally.post)}, deflected ${per(tally.deflected)}, secondBall ${per(tally.secondBall)}, firstTouchErr ${per(tally.firstTouch)}`);
}

// ---- 8) Save/load roundtrip รักษา field ฟิสิกส์ ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  for (let t = 0; t < 4; t++) playTurn(state);
  state.ball.z = 2.5; state.ball.velocityZ = 3; state.ball.spin = 0.3; state.ball.ballMode = 'rebound';
  const data = serialize(state);
  assert(validateSave(data).ok, 'save ที่มี field ฟิสิกส์ต้อง validate ผ่าน');
  const fresh = createInitialState('4-4-2');
  applySave(fresh, data);
  assert(fresh.ball.z === 2.5 && fresh.ball.velocityZ === 3, 'load แล้ว z/velocityZ ต้องตรง');
  assert(fresh.ball.ballMode === 'rebound', 'load แล้ว ballMode ต้องตรง');
  console.log('Save/load physics fields OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2.7 BALL PHYSICS TESTS PASS ✅');
