// P5 headless tests: penalty, learning, ghost replay, what-if restore, fog visibility
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick, defensiveIdealFor } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { awardPenalty, resolvePenalty, PENALTY_DIRS } = await import(`${BASE}/penalty.js`);
const { trainPassModel, predictPass, collectPassSample, PASS_FEATURE_COUNT } = await import(`${BASE}/learning.js`);
const { isOpponentVisible } = await import(`${BASE}/ui.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);
const { deepClone } = await import(`${BASE}/utils.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- Penalty: award บล็อก Play, resolve อัปเดตสกอร์/รีเซ็ตสนาม ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const st = state.players.find((p) => p.team === 'home' && p.role === 'ST');
  assert(awardPenalty(state, 'home', st.id), 'awardPenalty ต้องสำเร็จ');
  assert(!awardPenalty(state, 'home', st.id), 'จุดโทษซ้อนกันต้องไม่ได้');
  assert(!startSimulation(state), 'Play ต้องถูกบล็อกระหว่างรอจุดโทษ');

  // สถิติผลลัพธ์: เดาทางถูก vs ผิด
  let goalsSame = 0, goalsDiff = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    // เดาทางถูกเสมอ: ยิงซ้ายตลอด — GK เป็น AI สุ่ม จึงวัดผ่าน resolve ปกติ
    const s = createInitialState('4-3-3');
    s.pendingPenalty = { team: 'home', takerId: s.players[10].id };
    const before = s.score.home;
    const r = resolvePenalty(s, 'left');
    assert(PENALTY_DIRS.includes(r.shotDir) && PENALTY_DIRS.includes(r.diveDir), 'ทิศทางผิดรูป');
    assert(s.pendingPenalty === null, 'pendingPenalty ต้องถูกเคลียร์');
    if (r.outcome === 'goal') {
      assert(s.score.home === before + 1, 'ประตูต้องเพิ่มสกอร์');
      if (r.shotDir === r.diveDir) goalsSame++; else goalsDiff++;
    } else {
      assert(s.score.home === before, 'ไม่ใช่ประตูห้ามเพิ่มสกอร์');
      assert(s.ball.ownerPlayerId, 'หลังเซฟ/พลาดต้องมีคนถือบอล');
    }
  }
  console.log(`Penalty OK — goals when guessed: ${goalsSame}, when wrong-footed: ${goalsDiff} (ผิดทางต้องมากกว่า)`);
  assert(goalsDiff > goalsSame, 'เดาทางผิดควรเป็นประตูบ่อยกว่า');
}

// ---- Learning: เทรนจาก pattern สังเคราะห์ได้จริง ----
{
  const fake = { passSamples: [] };
  for (let i = 0; i < 200; i++) {
    const f = Array.from({ length: PASS_FEATURE_COUNT }, () => Math.random());
    // กติกาแอบแฝง: lane ปลอดภัย + pressure ต่ำ = สำเร็จ
    const y = f[0] > 0.45 && f[6] < 0.6 ? (Math.random() < 0.9 ? 1 : 0) : (Math.random() < 0.2 ? 1 : 0);
    collectPassSample(fake, f, y);
  }
  const model = trainPassModel(fake.passSamples);
  assert(model && model.acc > 0.7, `โมเดลควรเรียน pattern ได้ (acc=${model?.acc})`);
  const pGood = predictPass(model, [0.9, 0.5, 0.5, 0.5, 0.5, 0.3, 0.1]);
  const pBad = predictPass(model, [0.1, 0.5, 0.5, 0.5, 0.5, 0.3, 0.9]);
  assert(pGood > pBad, 'lane ปลอดภัยต้องได้คะแนนสูงกว่า');
  assert(trainPassModel([]) === null, 'ข้อมูลน้อยต้องคืน null');
  console.log(`Learning OK — acc ${(model.acc * 100).toFixed(0)}%, P(good)=${pGood.toFixed(2)} > P(bad)=${pBad.toFixed(2)}`);
}

// ---- Pass samples ถูกเก็บระหว่างเล่นจริง ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  for (let t = 0; t < 12 && state.phase !== 'finished'; t++) playTurn(state);
  assert(state.passSamples.length > 0, `ต้องมี pass samples สะสม (มี ${state.passSamples.length})`);
  assert(state.passSamples.every((s) => s.f.length === PASS_FEATURE_COUNT && (s.y === 0 || s.y === 1)), 'sample ผิดรูป');
  console.log(`Pass samples OK — เก็บได้ ${state.passSamples.length} จาก 12 เทิร์น`);
}

// ---- Ghost replay: defensiveIdealFor สมเหตุผล ----
{
  const state = createInitialState('4-2-3-1');
  const cb = state.players.find((p) => p.team === 'home' && p.role === 'CB');
  const ideal = defensiveIdealFor(state, cb);
  assert(ideal && ideal.x > 2 && ideal.x < 52, `แนวรับ ideal ควรอยู่แดนเรา (x=${ideal?.x})`);
  const stHome = state.players.find((p) => p.team === 'home' && p.role === 'ST');
  assert(defensiveIdealFor(state, stHome) === null, 'ST ไม่มี defensive ideal');
  console.log(`Ghost replay OK — CB ideal (${ideal.x.toFixed(1)}, ${ideal.y.toFixed(1)})`);
}

// ---- What-if: stash → แก้มั่ว → restore แล้วเหมือนเดิม ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  playTurn(state);
  const fingerprint = () => JSON.stringify({
    pl: state.players.map((p) => [p.x, p.y, p.stamina]),
    ball: state.ball, turn: state.turn, clock: state.clock, score: state.score,
  });
  const before = fingerprint();
  const stash = deepClone(state);
  // จำลองการเล่นมั่วใน sandbox
  playTurn(state);
  playTurn(state);
  state.score.home += 5;
  assert(fingerprint() !== before, 'sandbox ต้องเปลี่ยน state ได้');
  Object.assign(state, stash);
  assert(fingerprint() === before, 'restore แล้วต้องกลับมาเหมือนเดิมทุกค่า');
  console.log('What-if OK — stash/restore ตรงกัน 100%');
}

// ---- Fog of war: ใกล้มองเห็น ไกลมองไม่เห็น ----
{
  const state = createInitialState('4-2-3-1');
  const away = state.players.find((p) => p.team === 'away' && p.role === 'ST');
  // away ST อยู่กลางสนามใกล้แนวเรา → ควรเห็น
  assert(isOpponentVisible(state, away), 'away ST ใกล้แนวเราต้องมองเห็น');
  const awayGK = state.players.find((p) => p.team === 'away' && p.role === 'GK');
  // ย้ายทุกคนของเรากลับไปไกลๆ จาก away GK
  for (const p of state.players) if (p.team === 'home') { p.x = 5; p.y = 5; }
  state.ball.x = 5; state.ball.y = 5;
  assert(!isOpponentVisible(state, awayGK), 'away GK ไกลทุกคนต้องมองไม่เห็น');
  console.log('Fog of war OK');
}

// ---- Save/load: passModel persist, pendingPenalty เคลียร์ ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  playTurn(state);
  state.passModel = { w: [0.1, 0.2, 0.3, 0, 0, 0, -0.5], b: 0.05, acc: 0.8, n: 100 };
  state.pendingPenalty = { team: 'home', takerId: 'home-9' };
  const data = serialize(state);
  const v = validateSave(data);
  assert(v.ok, `validate พัง: ${v.error}`);
  const fresh = createInitialState('4-3-3');
  applySave(fresh, data);
  assert(fresh.passModel && fresh.passModel.acc === 0.8, 'passModel ต้อง persist');
  assert(fresh.pendingPenalty === null, 'โหลดแล้ว pendingPenalty ต้องเคลียร์');
  playTurn(fresh);
  console.log('Save/load P5 OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P5 TESTS PASS ✅');
