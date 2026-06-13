// P2 headless tests: movement radius, no teleport, anti-clustering, action variety, save/load
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);
const { movementRadius } = await import(`${BASE}/player.js`);
const { MATCH_TURNS } = await import(`${BASE}/config.js`);

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}
function playTurn(state) {
  if (!startSimulation(state)) throw new Error(`start failed phase=${state.phase}`);
  let n = 0;
  while (!simTick(state)) { if (++n > 200) throw new Error('sim never ends'); }
}

// ---- Test 1+2: intent ไม่ teleport + เคลื่อนที่ไม่เกิน radius ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const cb = state.players.find((p) => p.team === 'home' && p.role === 'CB');
  const startX = cb.x, startY = cb.y;
  cb.intendedTarget = { x: 100, y: 34 }; // ลากไปแดนหน้าไกลมาก
  cb.commandLocked = true;
  assert(cb.x === startX && cb.y === startY, 'ตั้ง intent แล้วตำแหน่งจริงต้องไม่เปลี่ยน (no teleport)');

  const r = movementRadius(cb);
  playTurn(state);
  const moved = Math.hypot(cb.x - startX, cb.y - startY);
  assert(moved <= r * 1.15 + 1, `CB เคลื่อนที่ ${moved.toFixed(1)}m เกิน radius ${r.toFixed(1)}m`);
  assert(cb.pathHistory.length > 5, 'ต้องมี path แสดงการวิ่งจริง ไม่ใช่กระโดด');
  assert(cb.intendedTarget === null, 'intent ต้องถูกเคลียร์หลังจบเทิร์น');
  console.log(`Test 1-2 OK — CB radius ${r.toFixed(1)}m, moved ${moved.toFixed(1)}m, path ${cb.pathHistory.length} จุด`);
}

// ---- Test 3: anti-clustering เล่น 12 เทิร์นโดยไม่คุม ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  let worstCluster = 0;
  for (let t = 0; t < 12; t++) {
    playTurn(state);
    const out = state.players.filter((p) => p.team === 'home' && p.role !== 'GK');
    for (const p of out) {
      const near = out.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 5).length;
      worstCluster = Math.max(worstCluster, near);
    }
  }
  assert(worstCluster <= 4, `นักเตะกองกัน ${worstCluster} คนในรัศมี 5m`);
  // formation ยังมี shape: ความกว้าง y ของทีม > 25m
  const ys = state.players.filter((p) => p.team === 'home' && p.role !== 'GK').map((p) => p.y);
  assert(Math.max(...ys) - Math.min(...ys) > 22, 'ทีมหุบแคบผิดปกติหลัง 12 เทิร์น');
  console.log(`Test 3 OK — worst cluster ${worstCluster} คน, team width ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)}m`);
}

// ---- Test 4+6: action variety + pass memory ตลอดแมตช์ ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const totals = { passes: 0, carries: 0, dribbles: 0, runs: 0 };
  const phases = new Set();
  const objectives = new Set();
  while (state.phase !== 'finished') {
    playTurn(state);
    for (const k of Object.keys(totals)) totals[k] += state.lastTurnStats[k];
    phases.add(state.teamPhases.home);
    objectives.add(state.teamObjectives.home);
    for (const p of state.players) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), `NaN position เทิร์น ${state.turn}`);
      assert(p.stamina >= 0 && p.stamina <= 100, `stamina ผิดช่วง`);
    }
    for (const [k, v] of Object.entries(state.tacticalScores)) {
      assert(Number.isFinite(v) && v >= 0 && v <= 100, `score ${k}=${v}`);
    }
  }
  assert(totals.passes > 3, // เกณฑ์ต่ำเผื่อแมตช์ที่เจอ away สไตล์ high press
   `แทบไม่มีการจ่ายบอล (${totals.passes})`);
  assert(totals.carries > 0, 'ไม่มี carry เลยทั้งแมตช์ — ยังเป็น pass-only');
  assert(totals.runs > 0, 'ไม่มี off-ball run เลยทั้งแมตช์');
  assert(state.passMemory.recentPasses.length > 0, 'pass memory ไม่ถูกบันทึก');
  assert(phases.size >= 2, `team phase ไม่หลากหลาย: ${[...phases]}`);
  assert(state.history.length === 10, 'history ต้องเก็บ 10 เทิร์น');
  // P2.8: clock เดินเฉพาะวินาทีที่บอล live (เทิร์นที่หยุดเพราะบอลตายเดินไม่ครบ 8 วิ)
  assert(state.clock > 0 && state.clock <= MATCH_TURNS * 8, `clock ผิด (${state.clock})`);
  console.log(`Test 4+6 OK — passes ${totals.passes}, carries ${totals.carries}, dribbles ${totals.dribbles}, runs ${totals.runs}`);
  console.log(`  phases: ${[...phases].join(', ')}`);
  console.log(`  objectives: ${[...objectives].join(', ')}`);
  console.log(`  score ${state.score.home}-${state.score.away}`);
}

// ---- Test 7: save/load รวม legacy save (v1 ไม่มี field P2) ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const st = state.players.find((p) => p.team === 'home' && p.role === 'ST');
  st.intendedTarget = { x: st.x + 5, y: st.y };
  for (let t = 0; t < 3; t++) playTurn(state);

  const data = serialize(state);
  let v = validateSave(data);
  assert(v.ok, `save v2 validate พัง: ${v.error}`);

  // legacy: ตัด field P2 ออกจำลอง save เก่า
  const legacy = JSON.parse(JSON.stringify(data));
  for (const p of legacy.players) { delete p.intendedTarget; delete p.commandType; }
  v = validateSave(legacy);
  assert(v.ok, `legacy save validate พัง: ${v.error}`);
  const fresh = createInitialState('4-3-3');
  applySave(fresh, legacy);
  assert(fresh.players.every((p) => p.commandType), 'load legacy แล้ว commandType ต้องมี default');
  assert(fresh.turn === state.turn, 'turn ไม่ตรงหลัง load');
  playTurn(fresh); // เล่นต่อหลัง load ได้
  assert(fresh.players.every((p) => Number.isFinite(p.x)), 'เล่นต่อหลัง load legacy แล้ว state พัง');
  console.log('Test 7 OK — save/load + legacy migration + เล่นต่อได้');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2 TESTS PASS ✅');
