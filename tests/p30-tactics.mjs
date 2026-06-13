// P3.0 Tactics tests: bench, substitution, base-position edit, save/load round-trip
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { substitute, teamPlayers, getPlayer } = await import(`${BASE}/team.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- 1) โครงสร้าง bench ----
{
  const s = createInitialState('4-2-3-1');
  assert(s.players.length === 22, `ในสนามต้อง 22 (ได้ ${s.players.length})`);
  assert(s.benches.home.length === 7 && s.benches.away.length === 7, 'bench ต้อง 7/ทีม');
  assert(s.subsMax === 5, 'subsMax = 5');
  const allIds = new Set([...s.players, ...s.benches.home, ...s.benches.away].map((p) => p.id));
  assert(allIds.size === 36, `id ต้องไม่ซ้ำ รวม 36 (ได้ ${allIds.size})`);
  // bench ไม่ถูกจำลอง: เล่นเทิร์น แล้วตัวสำรองตำแหน่ง/แรงไม่เปลี่ยน
  const benchSnap = JSON.stringify(s.benches.home.map((p) => [p.x, p.y, p.stamina]));
  playTurn(s);
  assert(JSON.stringify(s.benches.home.map((p) => [p.x, p.y, p.stamina])) === benchSnap, 'bench ห้ามถูกจำลอง (ตำแหน่ง/stamina ต้องคงที่)');
  console.log('Bench structure OK — 22 on pitch, 7+7 bench, ไม่ถูกจำลอง');
}

// ---- 2) เปลี่ยนตัว: รับ base/ตำแหน่ง, เพิ่ม counter, จำกัด 5 ----
{
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  const out = teamPlayers(s, 'home').find((p) => p.role === 'ST');
  const inP = s.benches.home.find((p) => p.role === 'ST') || s.benches.home[6];
  const ob = { x: out.baseX, y: out.baseY };
  const inId = inP.id;
  const r = substitute(s, 'home', out.id, inId);
  assert(r.ok, `เปลี่ยนตัวต้องสำเร็จ: ${r.error}`);
  assert(s.players.some((p) => p.id === inId), 'ตัวลงต้องอยู่ในสนาม');
  assert(!s.players.some((p) => p.id === out.id), 'ตัวออกต้องไม่อยู่ในสนาม');
  assert(s.benches.home.some((p) => p.id === out.id), 'ตัวออกต้องไปนั่งสำรอง');
  const now = getPlayer(s, inId);
  assert(Math.abs(now.baseX - ob.x) < 0.01 && Math.abs(now.baseY - ob.y) < 0.01, 'ตัวลงต้องรับตำแหน่งหลักของตัวออก');
  assert(s.players.length === 22, 'ในสนามต้องยัง 22');
  assert(s.subsUsed.home === 1, 'subsUsed ต้อง = 1');
  console.log(`Substitution OK — ${r.outP.name} ↔ ${r.inP.name}, base inherited`);

  // จำกัด 5 ครั้ง
  let ok = 1;
  for (const bp of [...s.benches.home]) {
    const target = teamPlayers(s, 'home').find((p) => p.role !== 'GK');
    const res = substitute(s, 'home', target.id, bp.id);
    if (res.ok) ok++;
  }
  assert(s.subsUsed.home === 5, `ต้องเปลี่ยนได้สูงสุด 5 (ได้ ${s.subsUsed.home})`);
  const extra = substitute(s, 'home', teamPlayers(s, 'home')[1].id, s.benches.home[0].id);
  assert(!extra.ok, 'เกิน 5 ต้องถูกปฏิเสธ');
  console.log(`Sub limit OK — ใช้ครบ 5, ครั้งที่ 6 ถูกปฏิเสธ`);
}

// ---- 3) เปลี่ยนตัวระหว่างจำลองไม่ได้ ----
{
  const s = createInitialState('4-2-3-1');
  s.phase = 'simulating';
  const r = substitute(s, 'home', s.players[1].id, s.benches.home[0].id);
  assert(!r.ok, 'ระหว่าง simulating ต้องเปลี่ยนตัวไม่ได้');
  console.log('Block sub during sim OK');
}

// ---- 4) เปลี่ยนตัวคนถือบอล → บอลย้ายให้ตัวลง ----
{
  const s = createInitialState('4-2-3-1');
  const owner = getPlayer(s, s.ball.ownerPlayerId);
  if (owner && owner.role !== 'GK') {
    const inP = s.benches.home.find((p) => p.role !== 'GK');
    const r = substitute(s, 'home', owner.id, inP.id);
    assert(r.ok, 'sub คนถือบอลต้องได้');
    assert(s.ball.ownerPlayerId === inP.id, 'บอลต้องย้ายไปตัวที่ลง');
    console.log('Ball handover on sub OK');
  } else {
    console.log('Ball handover OK (skip — GK ถือบอล)');
  }
}

// ---- 5) save/load round-trip หลังเปลี่ยนตัว ----
{
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  const out = teamPlayers(s, 'home').find((p) => p.role !== 'GK');
  const inP = s.benches.home.find((p) => p.role !== 'GK');
  const inId = inP.id;
  const subRes = substitute(s, 'home', out.id, inId);
  assert(subRes.ok, `sub for save test: ${subRes.error}`);
  // แก้ base position ของตัวลง
  const moved = getPlayer(s, inId);
  moved.baseX = 40; moved.baseY = 20;
  playTurn(s);

  const data = serialize(s);
  assert(validateSave(data).ok, `save valid: ${validateSave(data).error}`);
  assert(data.benches && data.benches.home.length === 7, 'save ต้องมี benches');

  const fresh = createInitialState('4-3-3');
  applySave(fresh, data);
  assert(fresh.players.length === 22, 'โหลดแล้วในสนามต้อง 22');
  assert(fresh.players.some((p) => p.id === inId), 'ตัวที่ถูกเปลี่ยนลงต้องยังอยู่ในสนามหลังโหลด');
  assert(fresh.benches.home.length === 7 && fresh.benches.away.length === 7, 'bench หลังโหลดต้อง 7/ทีม');
  assert(fresh.subsUsed.home === 1, 'subsUsed ต้องคงหลังโหลด');
  const allIds = new Set([...fresh.players, ...fresh.benches.home, ...fresh.benches.away].map((p) => p.id));
  assert(allIds.size === 36, `หลังโหลด id ต้องครบ 36 ไม่ซ้ำ (ได้ ${allIds.size})`);
  playTurn(fresh);
  assert(fresh.players.every((p) => Number.isFinite(p.x)), 'เล่นต่อหลังโหลดได้');
  console.log('Save/load with sub OK');
}

// ---- 6) backward compat: save เก่าไม่มี benches → regenerate ----
{
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  playTurn(s);
  const data = serialize(s);
  delete data.benches; delete data.subsUsed; delete data.subsMax; // จำลอง save เก่า
  assert(validateSave(data).ok, 'save เก่ายัง valid');
  const fresh = createInitialState('4-4-2');
  applySave(fresh, data);
  assert(fresh.benches.home.length === 7 && fresh.benches.away.length === 7, 'save เก่าต้อง regenerate bench 7/ทีม');
  assert(fresh.players.length === 22, 'save เก่าโหลดแล้ว 22 ในสนาม');
  console.log('Legacy save (no bench) OK — regenerated');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P3.0 TACTICS TESTS PASS ✅');
