// P3.1 Arcade tests: team DB integrity, team-id state build, strength scaling
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { TEAMS, getTeamData, strengthBonus } = await import(`${BASE}/teams-data.js`);
const { isValidFormation } = await import(`${BASE}/formations.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 300) throw new Error('stuck'); };
const avgAttr = (players) => {
  const out = players.filter((p) => p.role !== 'GK');
  const keys = ['speed', 'passing', 'shooting', 'tackling', 'vision', 'positioning'];
  let s = 0; for (const p of out) for (const k of keys) s += p[k];
  return s / (out.length * keys.length);
};

// ---- 1) team DB integrity ----
{
  assert(TEAMS.length >= 18, `ควรมีทีม ≥18 (ได้ ${TEAMS.length})`);
  const ids = new Set();
  for (const t of TEAMS) {
    assert(t.id && !ids.has(t.id), `id ซ้ำ/ว่าง: ${t.id}`); ids.add(t.id);
    assert(t.name && t.short && t.color && t.color2, `ข้อมูลทีมไม่ครบ: ${t.id}`);
    assert(t.strength >= 1 && t.strength <= 5, `ดาวผิดช่วง: ${t.id}`);
    assert(isValidFormation(t.formation), `formation ไม่ถูกต้อง: ${t.id} (${t.formation})`);
  }
  assert(strengthBonus(5) === 12 && strengthBonus(3) === 0 && strengthBonus(2) === -6, 'strengthBonus mapping ผิด');
  console.log(`Team DB OK — ${TEAMS.length} ทีม, id ไม่ซ้ำ, formation/ดาวถูกต้อง`);
}

// ---- 2) สร้าง state จาก team id ----
{
  const s = createInitialState({ homeTeamId: 'man-sky', awayTeamId: 'forest' });
  assert(s.players.length === 22, 'ในสนาม 22');
  assert(s.benches.home.length === 7 && s.benches.away.length === 7, 'bench 7/ทีม');
  const hd = getTeamData('man-sky'), ad = getTeamData('forest');
  assert(s.teams.home.teamName === hd.name, 'ชื่อทีมเหย้าตรง DB');
  assert(s.teams.away.teamName === ad.name, 'ชื่อทีมเยือนตรง DB');
  assert(s.teams.home.color === hd.color && s.teams.home.short === hd.short, 'สี/ชื่อย่อตรง DB');
  assert(s.teams.home.formation === hd.formation, 'formation เหย้าตรง DB');
  console.log(`Build-from-id OK — ${s.teams.home.teamName} (${s.teams.home.formation}) vs ${s.teams.away.teamName}`);
}

// ---- 3) strength scaling: ทีม 5 ดาว เก่งกว่า 2 ดาว ----
{
  const strong = createInitialState({ homeTeamId: 'man-red', awayTeamId: 'ipswich' });   // 5★ vs 2★
  const homeAvg = avgAttr(strong.players.filter((p) => p.team === 'home'));
  const awayAvg = avgAttr(strong.players.filter((p) => p.team === 'away'));
  assert(homeAvg > awayAvg + 8, `5★ ควรเก่งกว่า 2★ ชัดเจน (home ${homeAvg.toFixed(1)} vs away ${awayAvg.toFixed(1)})`);
  console.log(`Strength scaling OK — 5★ avg ${homeAvg.toFixed(1)} > 2★ avg ${awayAvg.toFixed(1)}`);
}

// ---- 4) backward compat: createInitialState('4-3-3') ยังได้ทีม default ----
{
  const s = createInitialState('4-3-3');
  assert(s.teams.home.formation === '4-3-3', 'string arg = formation (เข้ากันได้กับเทสต์เดิม)');
  assert(s.players.length === 22, '22 ในสนาม');
  console.log('Backward-compat OK — string arg ยังใช้ได้');
}

// ---- 5) เล่นเต็มแมตช์ด้วยทีม DB ไม่พัง + save/load ----
{
  const s = createInitialState({ homeTeamId: 'wlon-blue', awayTeamId: 'brighton' });
  s.tacticalScores = analyze(s).scores;
  for (let i = 0; i < 6; i++) playTurn(s);
  for (const p of s.players) assert(Number.isFinite(p.x), 'NaN!');
  const data = serialize(s);
  assert(validateSave(data).ok, `save valid: ${validateSave(data).error}`);
  const fresh = createInitialState({ homeTeamId: 'man-red', awayTeamId: 'forest' });
  applySave(fresh, data);
  assert(fresh.teams.home.teamName === getTeamData('wlon-blue').name, 'โหลดแล้วชื่อทีมตรงกับ save');
  playTurn(fresh);
  console.log('Full-match + save/load OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P3.1 ARCADE TESTS PASS ✅');
