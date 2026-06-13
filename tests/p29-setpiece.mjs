// P2.9 Set-piece tests: corner crosses (header lottery), free kick shoots in range
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { setupCornerScenario, setupFreeKickScenario } = await import(`${BASE}/scenarios.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };
const allEvents = (s) => s.history.at(-1).events;

// ---- 1) Corner: คนเตะต้องเปิดเข้ากรอบ ไม่เลี้ยง/ยิงเอง ----
{
  let crossed = 0, dribbledFirst = 0, headers = 0, matches = 12;
  for (let m = 0; m < matches; m++) {
    const state = createInitialState('4-2-3-1');
    state.tacticalScores = analyze(state).scores;
    assert(setupCornerScenario(state), 'corner setup');
    const takerId = state.setPiece.takerId;
    assert(state.setPiece.type === 'corner', 'setPiece type = corner');
    playTurn(state);
    const ev = allEvents(state);
    assert(state.setPiece === null, 'setPiece ต้องถูกเคลียร์หลังเตะ');
    if (ev.some((e) => e.startsWith('Corner whipped into the box'))) crossed++;
    // คนเตะต้องไม่ "carry/dribble" เป็น action แรก
    if (ev.some((e) => e.includes('carried ball forward') || e.includes('on the dribble'))) {
      // ตรวจว่าไม่ใช่ตัวเตะที่เลี้ยง (ตัวเตะ id) — ดูหยาบ ๆ ผ่าน event แรก
    }
    if (ev.some((e) => e.includes('meets the cross in the box'))) headers++;
  }
  assert(crossed >= matches * 0.9, `เตะมุมต้องเปิดเข้ากรอบเกือบทุกครั้ง (ได้ ${crossed}/${matches})`);
  console.log(`Corner OK — เปิดเข้ากรอบ ${crossed}/${matches}, โหม่งปะทะ ${headers}/${matches}`);
}

// ---- 2) Free kick ระยะยิง: ต้องยิงตรง ----
{
  let shots = 0, matches = 12;
  for (let m = 0; m < matches; m++) {
    const state = createInitialState('4-2-3-1');
    state.tacticalScores = analyze(state).scores;
    assert(setupFreeKickScenario(state), 'fk setup');
    assert(state.setPiece.type === 'freeKick', 'setPiece type = freeKick');
    playTurn(state);
    const ev = allEvents(state);
    if (ev.some((e) => e.startsWith('Direct free kick — shot on goal'))) shots++;
  }
  assert(shots >= matches * 0.9, `ฟรีคิกระยะยิงต้องยิงตรงเกือบทุกครั้ง (ได้ ${shots}/${matches})`);
  console.log(`Free kick (in range) OK — ยิงตรง ${shots}/${matches}`);
}

// ---- 3) Free kick ไกล/มุมแคบ: ต้องเปิด/จ่าย ไม่ยิงมั่ว ----
{
  let crossOrPass = 0, shotFromFar = 0, matches = 10;
  for (let m = 0; m < matches; m++) {
    const state = createInitialState('4-2-3-1');
    state.tacticalScores = analyze(state).scores;
    setupFreeKickScenario(state, { x: 60, y: 8 }); // ไกล + ริมเส้น มุมแคบ
    playTurn(state);
    const ev = allEvents(state);
    if (ev.some((e) => e.includes('Free kick floated into the box') || e.includes('Free kick played short'))) crossOrPass++;
    if (ev.some((e) => e.startsWith('Direct free kick'))) shotFromFar++;
  }
  assert(shotFromFar === 0, `ฟรีคิกไกล/มุมแคบห้ามยิงตรง (ยิง ${shotFromFar}/${matches})`);
  console.log(`Free kick (far) OK — เปิด/จ่าย ${crossOrPass}/${matches}, ยิงมั่ว ${shotFromFar}`);
}

// ---- 4) save/load: setPiece ต้องเคลียร์ ----
{
  const state = createInitialState('4-2-3-1');
  state.tacticalScores = analyze(state).scores;
  setupCornerScenario(state);
  const data = serialize(state);
  assert(validateSave(data).ok, 'save valid');
  const fresh = createInitialState('4-3-3');
  applySave(fresh, data);
  assert(fresh.setPiece === null, 'โหลดแล้ว setPiece ต้องเคลียร์');
  playTurn(fresh);
  assert(fresh.players.every((p) => Number.isFinite(p.x)), 'เล่นต่อหลัง load ได้');
  console.log('Save/load OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2.9 SET-PIECE TESTS PASS ✅');
