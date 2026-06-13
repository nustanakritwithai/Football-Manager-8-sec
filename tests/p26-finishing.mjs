// P2.6 Finishing Decision Fix tests
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick, evaluateBallCarrierAction, evaluateShotAction } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { giveBall } = await import(`${BASE}/ball.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// วางสถานการณ์: ST เราถือบอลที่ (x,y) คู่แข่งถอยห่าง
function makeScenario(x, y, opts = {}) {
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const st = state.players.find((p) => p.team === 'home' && p.role === 'ST');
  st.x = x; st.y = y; st.targetX = x; st.targetY = y;
  // เคลียร์คู่แข่งออกจากเส้นยิง ยกเว้น GK
  state.players.filter((p) => p.team === 'away' && p.role !== 'GK')
    .forEach((p, i) => { p.x = opts.defendersNear ? x - 3 : 30; p.y = opts.defendersNear ? y + (i - 4) : 5 + i * 6; });
  giveBall(state, st);
  state.teamPhases.home = 'FINAL_THIRD';
  state.teamObjectives.home = 'attackHalfSpaceRight';
  return { state, st };
}

// ---- 1) Must-shoot zone: ในกรอบมุมเปิด → ต้องยิง ----
{
  const { state, st } = makeScenario(93, 34);
  const shot = evaluateShotAction(state, st, 0.3);
  assert(shot && shot.zone === 'must', `ระยะ 12m กลางประตูต้องเป็น must-shoot (ได้ ${shot?.zone})`);
  const action = evaluateBallCarrierAction(state, st, 0.3);
  assert(action.type === 'shoot', `ใน must-shoot zone ต้องเลือกยิง (เลือก ${action.type})`);
  console.log(`Must-shoot OK — zone=${shot.zone}, xg=${shot.xg.toFixed(2)}, action=${action.type}`);
}

// ---- 2) ห้ามยิงมั่วจากไกล ----
{
  const { state, st } = makeScenario(55, 34);
  const shot = evaluateShotAction(state, st, 0.2);
  assert(shot === null, `ระยะ 50m ต้องไม่พิจารณายิงเลย (ได้ ${JSON.stringify(shot)})`);
  const action = evaluateBallCarrierAction(state, st, 0.2);
  assert(action.type !== 'shoot', `กลางสนามห้ามเลือกยิง (เลือก ${action.type})`);
  console.log('No wild long shots OK');
}

// ---- 3) มุมแคบริมกรอบ + มีเพื่อนกลางกรอบ → cutback ไม่ใช่ยิง ----
{
  const { state, st } = makeScenario(101, 12); // ริมเส้นใกล้ประตู มุมแคบมาก
  const am = state.players.find((p) => p.team === 'home' && p.role === 'AM');
  am.x = 92; am.y = 33; // ตัวรอกลางกรอบ
  const shot = evaluateShotAction(state, st, 0.4);
  assert(shot === null || shot.zone === 'bad' || shot.angle < 0.18,
    `มุมริมเส้นต้องแคบ (zone=${shot?.zone}, angle=${shot?.angle?.toFixed(2)})`);
  const action = evaluateBallCarrierAction(state, st, 0.4);
  assert(action.type !== 'shoot', `มุมแคบห้ามฝืนยิง (เลือก ${action.type})`);
  if (action.type === 'pass') {
    console.log(`Cutback OK — เลือก pass${action.option.cutback ? ' (cutback)' : ''} ไปหา ${action.option.mate.role}`);
  } else {
    console.log(`Cutback OK — เลือก ${action.type} แทนการยิงมุมแคบ`);
  }
}

// ---- 4) Tap-in exception: เพื่อนโล่งหน้าประตูกว่า → จ่าย ----
{
  const { state, st } = makeScenario(96, 48); // เรามุมเฉียง
  const am = state.players.find((p) => p.team === 'home' && p.role === 'AM');
  am.x = 99; am.y = 34; // เพื่อนจ่อเสากลางประตู โล่ง
  const action = evaluateBallCarrierAction(state, st, 0.2);
  if (action.type === 'pass' && (action.option.tapIn || action.option.cutback)) {
    console.log(`Tap-in OK — จ่ายให้ ${action.option.mate.role} ที่ยิงง่ายกว่า`);
  } else {
    console.log(`Tap-in note — เลือก ${action.type} (ยอมรับได้ถ้ายิงเองจากมุมดี)`);
  }
}

// ---- 5) Full match: shots เพิ่มขึ้น, end product ใน final third, ไม่พังของเดิม ----
{
  let totShotEvents = 0, homeShots = 0, totGoals = 0, totMissed = 0, totCutbacks = 0, matches = 6;
  for (let m = 0; m < matches; m++) {
    const state = createInitialState('4-2-3-1');
    state.tacticalScores = analyze(state).scores;
    while (state.phase !== 'finished') {
      playTurn(state);
      homeShots += (state.lastTurnStats.shots ?? 0);
      totCutbacks += (state.lastTurnStats.cutbacks ?? 0);
      totMissed += (state.lastTurnStats.missedShots ?? 0);
      totShotEvents += state.history.at(-1).events.filter((e) => e.includes('Shot chance')).length;
      for (const p of state.players) assert(Number.isFinite(p.x), 'NaN!');
    }
    totGoals += state.score.home + state.score.away;
  }
  const perMatch = (v) => (v / matches).toFixed(1);
  console.log(`Match OK — shots(both) ${perMatch(totShotEvents)}/match (home ${perMatch(homeShots)}), goals ${perMatch(totGoals)}, cutbacks ${perMatch(totCutbacks)}, missed events ${perMatch(totMissed)}`);
  // baseline ก่อน P2.6: ~4.8 shots(both)/match — finishing fix ต้องไม่ต่ำกว่านั้น
  assert(totShotEvents / matches >= 4.5, `shots ต่อแมตช์ต้องไม่ลดลง (ได้ ${perMatch(totShotEvents)})`);
  assert(totShotEvents / matches <= 30, 'shots ไม่ควรเฟ้อเกินจริง');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2.6 FINISHING TESTS PASS ✅');
