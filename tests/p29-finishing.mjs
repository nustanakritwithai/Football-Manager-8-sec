// P2.9 Finishing Engine tests — xG bands, target selection, GK not a wall, score balance
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const {
  startSimulation, simTick, evaluateShotContext, calculateXG, chooseShotTarget,
} = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);
const { SHOT_XG_MAX } = await import(`${BASE}/config.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// วาง ST ที่ (x,y) เคลียร์กองหลังออกจากเส้นยิง, GK อยู่ใกล้เส้นประตู
function shotAt(x, y, shooting = 80) {
  const s = createInitialState('4-2-3-1');
  const st = s.players.find((p) => p.team === 'home' && p.role === 'ST');
  st.x = x; st.y = y; st.shooting = shooting;
  s.players.filter((p) => p.team === 'away').forEach((p, i) => {
    if (p.role === 'GK') { p.x = 104; p.y = 34; } else { p.x = 12; p.y = 2 + i * 6; }
  });
  const ctx = evaluateShotContext(s, st, 0);
  return { s, st, ctx, xg: calculateXG(ctx, st) };
}

// ---- 1) xG bands สมจริง ----
{
  const long = shotAt(80, 34);   // ~25m
  const edge = shotAt(86, 34);   // ~19m
  const box = shotAt(94, 34);    // ~11m กลาง
  const big = shotAt(98, 34);    // ~7m กลาง เปิด
  const tight = shotAt(104, 10); // ในกรอบแต่มุมแคบมาก
  // หมายเหตุ: ฉากทดสอบเคลียร์กองหลังออกหมด (โล่งจริง) ค่าจึงสูงกว่าช่วงในเกมจริงที่มีคนประกบ
  assert(long.xg <= 0.08, `long shot xG ต่ำ (ได้ ${long.xg.toFixed(3)})`);
  assert(edge.xg > 0.02 && edge.xg < 0.5, `edge-of-box xG (โล่ง) (ได้ ${edge.xg.toFixed(3)})`);
  assert(box.xg > 0.1 && box.xg <= SHOT_XG_MAX, `in-box xG (โล่ง) (ได้ ${box.xg.toFixed(3)})`);
  assert(big.xg >= 0.28, `big chance xG สูง (ได้ ${big.xg.toFixed(3)})`);
  assert(tight.xg <= 0.16, `tight angle xG ถูก cap (ได้ ${tight.xg.toFixed(3)})`);
  assert(big.xg > box.xg && box.xg > edge.xg && edge.xg > long.xg, 'xG ต้องเรียงตามคุณภาพโอกาส');
  console.log(`xG bands OK — long ${long.xg.toFixed(2)} edge ${edge.xg.toFixed(2)} box ${box.xg.toFixed(2)} big ${big.xg.toFixed(2)} tight ${tight.xg.toFixed(2)}`);
}

// ---- 2) chooseShotTarget: ความแม่นขึ้นกับ skill/pressure, มี zone หลากหลาย ----
{
  const { ctx, st } = shotAt(94, 34);
  // ยิงนิ่งคนแม่น vs โดนบีบคนแม่นน้อย
  const good = chooseShotTarget({ ...ctx, pressure: 0 }, { ...st, shooting: 90 });
  const bad = chooseShotTarget({ ...ctx, pressure: 3, isTightAngle: true }, { ...st, shooting: 40 });
  assert(good.aim > bad.aim, `ยิงนิ่ง+แม่น ต้อง aim ดีกว่าโดนบีบ+ไม่แม่น (${good.aim.toFixed(2)} > ${bad.aim.toFixed(2)})`);
  assert(good.aim >= 0.2 && good.aim <= 0.85, 'aim อยู่ในช่วงที่กำหนด');
  // เก็บ zone หลายครั้ง ต้องไม่ใช่ central อย่างเดียว
  const zones = new Set();
  for (let i = 0; i < 60; i++) zones.add(chooseShotTarget(ctx, { ...st, shooting: 85 }).zone);
  assert(zones.size >= 2, `target zone ต้องหลากหลาย ไม่ใช่ยิงกลางตลอด (ได้ ${[...zones].join(',')})`);
  console.log(`Target selection OK — zones: ${[...zones].join(', ')}`);
}

// ---- 3) Goal ผูกกับ xG (กันสกอร์ล้น) + GK ไม่ใช่กำแพง ----
{
  let goals = 0, xg = 0, sot = 0, shots = 0, saves = 0, matches = 25;
  for (let m = 0; m < matches; m++) {
    const s = createInitialState('4-2-3-1');
    s.tacticalScores = analyze(s).scores;
    while (s.phase !== 'finished') playTurn(s);
    const h = s.matchStats.home, a = s.matchStats.away;
    goals += h.goals + a.goals;
    xg += h.xg + a.xg;
    sot += h.shotsOnTarget + a.shotsOnTarget;
    shots += h.shots + a.shots;
    saves += h.saves + a.saves;
  }
  const per = (v) => v / matches;
  // goals ต้องตามคุณภาพโอกาส (xG) — ใช้อัตราส่วนกัน variance (goals สูงกว่า xG เล็กน้อยจาก rebound/penalty)
  const ratio = goals / Math.max(xg, 0.01);
  assert(ratio > 0.7 && ratio < 1.7, `goals (${per(goals).toFixed(2)}) ต้องตาม xG (${per(xg).toFixed(2)}) — ratio ${ratio.toFixed(2)}`);
  // GK ไม่ใช่กำแพง: ลูกเข้ากรอบต้องมีทั้งเข้าและเซฟ
  assert(goals > 0, 'ต้องมีประตูเกิดขึ้น (GK ไม่ใช่กำแพง)');
  assert(saves > 0, 'ต้องมีการเซฟเกิดขึ้น (ไม่ใช่ยิงเข้าหมด)');
  assert(goals < sot, `ไม่ใช่ทุก on-target เป็นประตู (goals ${goals} < onTarget ${sot})`);
  console.log(`Calibration OK — goals/g ${per(goals).toFixed(2)} ≈ xG/g ${per(xg).toFixed(2)}, onTarget/g ${per(sot).toFixed(1)}, saves/g ${per(saves).toFixed(1)}`);
}

// ---- 4) Balance: 38 เทิร์น สกอร์ไม่ล้น ----
{
  let goals = 0, shots = 0, sot = 0, big = 0, matches = 25, maxGoals = 0;
  for (let m = 0; m < matches; m++) {
    const s = createInitialState('4-2-3-1');
    s.tacticalScores = analyze(s).scores;
    while (s.phase !== 'finished') {
      playTurn(s);
      for (const p of s.players) assert(Number.isFinite(p.x), 'NaN!');
    }
    const tg = s.score.home + s.score.away;
    goals += tg; maxGoals = Math.max(maxGoals, tg);
    shots += s.matchStats.home.shots + s.matchStats.away.shots;
    sot += s.matchStats.home.shotsOnTarget + s.matchStats.away.shotsOnTarget;
    big += s.matchStats.home.bigChances + s.matchStats.away.bigChances;
  }
  const per = (v) => (v / matches);
  assert(per(goals) >= 0.8 && per(goals) <= 3.4, `goals/เกม ต้องอยู่ราว 0–3 (ได้ ${per(goals).toFixed(2)})`);
  assert(per(shots) >= 6 && per(shots) <= 16, `shots/เกม 6–16 (ได้ ${per(shots).toFixed(1)})`);
  assert(per(sot) >= 2 && per(sot) <= 7, `on-target/เกม 2–7 (ได้ ${per(sot).toFixed(1)})`);
  assert(maxGoals <= 8, `ไม่ควรมีเกมสกอร์ล้นเกิน (max ${maxGoals})`);
  console.log(`Balance OK — goals/g ${per(goals).toFixed(2)}, shots/g ${per(shots).toFixed(1)}, onTarget/g ${per(sot).toFixed(1)}, big/g ${per(big).toFixed(1)}, maxGoals ${maxGoals}`);
}

// ---- 5) Outcome variety + matchStats save/load ----
{
  const tally = { goal: 0, save: 0, block: 0, wide: 0, post: 0 };
  for (let m = 0; m < 8; m++) {
    const s = createInitialState('4-2-3-1');
    s.tacticalScores = analyze(s).scores;
    while (s.phase !== 'finished') {
      playTurn(s);
      for (const e of s.history.at(-1).events) {
        if (e.includes('— GOAL')) tally.goal++;
        if (e.includes('saved') || e.includes('Great save')) tally.save++;
        if (e.includes('blocked')) tally.block++;
        if (e.includes('shoots wide')) tally.wide++;
        if (e.includes('hits the post')) tally.post++;
      }
    }
  }
  assert(tally.save > 0 && tally.block > 0 && tally.wide > 0, `ผลยิงต้องหลากหลาย (${JSON.stringify(tally)})`);
  console.log(`Variety OK — ${JSON.stringify(tally)}`);

  // save/load matchStats
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  for (let t = 0; t < 5; t++) playTurn(s);
  const data = serialize(s);
  assert(validateSave(data).ok, 'save มี matchStats ต้อง validate ผ่าน');
  const fresh = createInitialState('4-4-2');
  applySave(fresh, data);
  assert(fresh.matchStats && typeof fresh.matchStats.home.xg === 'number', 'load แล้ว matchStats คงอยู่');
  // legacy save ไม่มี matchStats
  delete data.matchStats;
  const f2 = createInitialState('4-3-3');
  applySave(f2, data);
  assert(f2.matchStats && f2.matchStats.home.shots === 0, 'legacy migrate matchStats เป็น default');
  console.log('matchStats save/load OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2.9 FINISHING TESTS PASS ✅');
