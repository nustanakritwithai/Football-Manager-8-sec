// P3 headless tests: preview, adjust, apply ghosts, corner scenario, retrieval, dataset
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze, shotProbability, findSimilarPastTurn } = await import(`${BASE}/tacticalAnalyzer.js`);
const { runPreview } = await import(`${BASE}/preview.js`);
const { suggestDefensiveAdjustments, applyGhostsAsCommands } = await import(`${BASE}/refine.js`);
const { setupCornerScenario } = await import(`${BASE}/scenarios.js`);
const { movementRadius } = await import(`${BASE}/player.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- Preview: ไม่แตะ state จริง + ได้ path ครบ ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  const snapshot = JSON.stringify(state.players.map((p) => [p.x, p.y, p.stamina]));
  const clockBefore = state.clock, turnBefore = state.turn;

  const pv = runPreview(state);
  assert(pv && pv.paths.length === 22, 'preview ต้องได้ path 22 คน');
  assert(pv.ballPath.length > 5, 'preview ต้องมีเส้นทางบอล');
  assert(['home', 'away'].includes(pv.summary.possessionEnd), 'summary ต้องมี possessionEnd');
  assert(JSON.stringify(state.players.map((p) => [p.x, p.y, p.stamina])) === snapshot, 'preview ห้ามแก้ตำแหน่ง/stamina จริง');
  assert(state.clock === clockBefore && state.turn === turnBefore, 'preview ห้ามเดิน clock/turn จริง');
  assert(state.phase === 'planning', 'preview ห้ามเปลี่ยน phase');
  console.log(`Preview OK — บอลจบที่ ${pv.summary.possessionEnd}, shots เรา ${pv.summary.ourShots}/เขา ${pv.summary.theirShots}`);
}

// ---- Shot probability อยู่ในช่วงสมเหตุผล ----
{
  const state = createInitialState('4-2-3-1');
  const h = shotProbability(state, 'home');
  const a = shotProbability(state, 'away');
  assert(h >= 0 && h <= 0.95 && a >= 0 && a <= 0.95, `xG ผิดช่วง h=${h} a=${a}`);
  console.log(`xG OK — home ${(h * 100).toFixed(0)}%, away ${(a * 100).toFixed(0)}%`);
}

// ---- Adjust: ได้ ghost ภายใน radius และ objective ลดลง ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  // สร้างสถานการณ์อันตราย: ให้คู่แข่งถือบอลใกล้กรอบเรา
  const awaySt = state.players.find((p) => p.team === 'away' && p.role === 'ST');
  awaySt.x = 25; awaySt.y = 30;
  state.ball.x = 25; state.ball.y = 30;
  state.ball.ownerPlayerId = awaySt.id;
  state.ball.possessionTeam = 'away';
  state.ball.isLoose = false;
  state.possessionTeam = 'away';

  const posBefore = JSON.stringify(state.players.map((p) => [p.x, p.y]));
  const r = suggestDefensiveAdjustments(state);
  assert(JSON.stringify(state.players.map((p) => [p.x, p.y])) === posBefore, 'Adjust ห้ามขยับตำแหน่งจริงค้างไว้');
  if (r && r.ghosts.length) {
    assert(r.after < r.before, `objective ต้องลดลง (${r.before.toFixed(1)} → ${r.after.toFixed(1)})`);
    for (const g of r.ghosts) {
      const p = state.players.find((q) => q.id === g.playerId);
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      assert(d <= movementRadius(p) * 0.75 + 0.5, `ghost ${g.playerId} ไกลเกิน radius`);
    }
    // apply เป็นคำสั่ง
    state.assistant.ghosts = r.ghosts;
    const n = applyGhostsAsCommands(state);
    assert(n === r.ghosts.length, 'applyGhosts ต้องตั้งคำสั่งครบ');
    assert(state.players.filter((p) => p.intendedTarget).length === n, 'intendedTarget ต้องถูกตั้ง');
    console.log(`Adjust OK — ${r.ghosts.length} ghosts, risk ${r.before.toFixed(0)} → ${r.after.toFixed(0)}, applied ${n}`);
  } else {
    console.log('Adjust OK — ไม่มีการขยับที่ดีกว่า (ยอมรับได้)');
  }
}

// ---- Corner scenario: จัดตำแหน่งถูกต้องและเล่นต่อได้ ----
{
  const state = createInitialState('4-3-3');
  state.tacticalScores = analyze(state).scores;
  assert(setupCornerScenario(state), 'corner setup ต้องสำเร็จ');
  const owner = state.players.find((p) => p.id === state.ball.ownerPlayerId);
  assert(owner && owner.team === 'home', 'คนเตะมุมต้องเป็นทีมเรา');
  assert(owner.x > 95 && owner.y < 8, `คนเตะต้องอยู่มุมสนาม (${owner.x.toFixed(0)},${owner.y.toFixed(0)})`);
  const homeInBox = state.players.filter((p) => p.team === 'home' && p.x > 88 && p.y > 20 && p.y < 48).length;
  assert(homeInBox >= 3, `ต้องมีตัวโจมตีในกรอบ ≥3 (มี ${homeInBox})`);
  for (const p of state.players) assert(p.x > 0 && p.x < 105 && p.y > 0 && p.y < 68, 'ตำแหน่ง corner หลุดสนาม');
  playTurn(state); // เล่นลูกเตะมุมได้จริง
  assert(state.players.every((p) => Number.isFinite(p.x)), 'เล่นต่อหลัง corner แล้วพัง');
  console.log(`Corner OK — ตัวโจมตีในกรอบ ${homeInBox} คน, เล่นเทิร์นต่อได้`);
}

// ---- Similar retrieval + replay dataset ตลอดหลายเทิร์น ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  for (let t = 0; t < 8; t++) playTurn(state);
  assert(state.replayLog.length === 8, `replayLog ต้องมี 8 เทิร์น (มี ${state.replayLog.length})`);
  const rec = state.replayLog.at(-1);
  assert(rec.start.length === 22 && rec.end.length === 22, 'dataset ต้องมี positions ครบ');
  assert(typeof rec.objective === 'string' && rec.scores, 'dataset ต้องมี objective + scores');
  const sim = findSimilarPastTurn(state);
  assert(sim === null || (typeof sim.turnNumber === 'number' && typeof sim.mirrored === 'boolean'),
    'findSimilarPastTurn คืนรูปแบบผิด');
  console.log(`Retrieval+Dataset OK — log ${state.replayLog.length} เทิร์น, similar: ${sim ? `T${sim.turnNumber} (${sim.avgDist}m${sim.mirrored ? ', mirror' : ''})` : 'ไม่มี'}`);
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P3 TESTS PASS ✅');
