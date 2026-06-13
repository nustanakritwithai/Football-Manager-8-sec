// P2.8 Match Rules & Restart tests — goal/ball-out classify, restart exec, foul, dead-ball stop
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const {
  startSimulation, simTick, classifyDeadBall, executeRestart, evaluateFoulRisk,
} = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { serialize, validateSave, applySave } = await import(`${BASE}/saveLoad.js`);
const { PITCH } = await import(`${BASE}/config.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- 1) Goal detection (classify) ----
{
  const ball = (o) => ({ x: 0, y: 34, z: 0, lastTouchTeam: 'home', radius: 0.11, ...o });
  assert(classifyDeadBall(ball({ x: PITCH.length + 0.2, y: 34 })).kind === 'goal', 'บอลข้ามเส้นขวากลางประตู = goal');
  assert(classifyDeadBall(ball({ x: PITCH.length + 0.2, y: 34 })).team === 'home', 'ประตูฝั่งขวา = home ทำ');
  assert(classifyDeadBall(ball({ x: -0.2, y: 34 })).team === 'away', 'ประตูฝั่งซ้าย = away ทำ');
  // สูงเกินคาน = ไม่เข้า
  assert(classifyDeadBall(ball({ x: PITCH.length + 0.2, y: 34, z: 5 })).kind !== 'goal', 'บอลสูงเกินคานไม่เป็นประตู');
  // นอกเสา = ไม่เข้า
  assert(classifyDeadBall(ball({ x: PITCH.length + 0.2, y: 10 })).kind !== 'goal', 'บอลนอกเสาไม่เป็นประตู');
  console.log('Goal detection OK');
}

// ---- 2) Ball out: throw-in / goal kick / corner classification ----
{
  // ออกเส้นข้าง → throw-in ทีมตรงข้าม
  let r = classifyDeadBall({ x: 50, y: -0.5, z: 0, lastTouchTeam: 'home', radius: 0.11 });
  assert(r.kind === 'throwIn' && r.team === 'away', `ออกข้าง home แตะ → throw-in away (ได้ ${r.kind}/${r.team})`);
  assert(Math.abs(r.spot.x - 50) < 2 && r.spot.y === 0, 'throw-in spot อยู่ริมเส้นจุดที่ออก');

  // ออกหลังขวา + ทีมบุก (home) แตะล่าสุด → goal kick ให้ away
  r = classifyDeadBall({ x: PITCH.length + 1, y: 10, z: 0, lastTouchTeam: 'home', radius: 0.11 });
  assert(r.kind === 'goalKick' && r.team === 'away', `home ยิงออกหลัง → goal kick away (ได้ ${r.kind}/${r.team})`);

  // ออกหลังขวา + ทีมรับ (away) แตะล่าสุด → corner ให้ home
  r = classifyDeadBall({ x: PITCH.length + 1, y: 10, z: 0, lastTouchTeam: 'away', radius: 0.11 });
  assert(r.kind === 'corner' && r.team === 'home', `away สกัดออกหลัง → corner home (ได้ ${r.kind}/${r.team})`);
  assert(r.spot.x === PITCH.length && r.spot.y === 0, 'corner spot อยู่มุมขวาบน');

  // ออกหลังซ้าย + away บุกแตะ → goal kick home ; home รับแตะ → corner away
  assert(classifyDeadBall({ x: -1, y: 50, z: 0, lastTouchTeam: 'away', radius: 0.11 }).kind === 'goalKick', 'away ยิงออกหลังซ้าย → goal kick home');
  assert(classifyDeadBall({ x: -1, y: 50, z: 0, lastTouchTeam: 'home', radius: 0.11 }).team === 'away', 'home สกัดออกหลังซ้าย → corner away');

  // อยู่ในสนาม → null
  assert(classifyDeadBall({ x: 50, y: 34, z: 0, lastTouchTeam: 'home', radius: 0.11 }) === null, 'บอลในสนามไม่ใช่ dead ball');
  console.log('Ball-out classification OK');
}

// ---- 3) executeRestart วางบอล/ครองบอลถูกต้องทุกประเภท ----
{
  const mk = (type, team, spot, side) => {
    const s = createInitialState('4-2-3-1');
    s.restart = { type, team, spot, side: side ?? null, reason: 'test', takerId: null, createdAtClock: 0 };
    executeRestart(s);
    return s;
  };

  // throw-in
  let s = mk('throwIn', 'home', { x: 30, y: 0 }, 'top');
  assert(s.possessionTeam === 'home', 'throw-in: ครองบอลเป็น home');
  assert(s.ball.ownerPlayerId && s.ball.ownerPlayerId.startsWith('home'), 'throw-in: ผู้ทุ่มเป็น home');
  assert(Math.abs(s.ball.x - 30) < 3, 'throw-in: บอลอยู่ริมเส้นจุดทุ่ม');
  assert(s.restart === null, 'throw-in: restart ถูกเคลียร์หลัง execute');

  // goal kick → GK เป็นคนเล่น
  s = mk('goalKick', 'away', { x: PITCH.length - 5.5, y: 34 }, 'right');
  const gk = s.players.find((p) => p.id === s.ball.ownerPlayerId);
  assert(s.possessionTeam === 'away' && gk && gk.role === 'GK', 'goal kick: GK ของ away เป็นคนเล่น');

  // corner → taker ที่มุม + ball ใกล้มุม
  s = mk('corner', 'home', { x: PITCH.length, y: 0 }, 'top');
  assert(s.possessionTeam === 'home', 'corner: ครองบอล home');
  assert(s.ball.x > PITCH.length - 2 && s.ball.y < 3, 'corner: บอลอยู่ที่มุมขวาบน');

  // free kick
  s = mk('freeKick', 'home', { x: 70, y: 30 }, null);
  assert(s.possessionTeam === 'home' && Math.abs(s.ball.x - 70) < 3, 'free kick: บอล/ครองบอลถูกจุด');

  // kickoff (บอลอยู่ที่เท้าผู้เขี่ยกลางสนาม ไม่จำเป็นต้องตรงจุดกึ่งกลางเป๊ะ)
  s = mk('kickoff', 'away', { x: PITCH.length / 2, y: 34 }, null);
  assert(s.possessionTeam === 'away', 'kickoff: ครองบอล away (ทีมเสียประตูเขี่ย)');
  assert(s.ball.ownerPlayerId && s.ball.ownerPlayerId.startsWith('away'), 'kickoff: ผู้เขี่ยเป็น away');
  console.log('executeRestart OK (throw-in/goal kick/corner/free kick/kickoff)');
}

// ---- 4) Penalty restart resolve (เข้า/เซฟ — post-conditions sane) ----
{
  for (let i = 0; i < 30; i++) {
    const s = createInitialState('4-2-3-1');
    const before = s.score.home + s.score.away;
    s.restart = { type: 'penalty', team: 'home', spot: { x: PITCH.length - 11, y: 34 }, side: null, reason: 'foul', takerId: null, createdAtClock: 0 };
    executeRestart(s);
    assert(s.restart === null, 'penalty: restart เคลียร์หลัง resolve');
    assert((s.score.home + s.score.away) >= before, 'penalty: สกอร์ไม่ลดลง');
    assert(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y), 'penalty: บอลไม่ NaN');
    assert(s.possessionTeam === 'home' || s.possessionTeam === 'away', 'penalty: possession ถูกตั้ง');
  }
  console.log('Penalty resolve OK');
}

// ---- 5) evaluateFoulRisk: context-sensitive, bounded ----
{
  const s = createInitialState('4-2-3-1');
  const carrier = s.players.find((p) => p.team === 'home' && p.role === 'AM');
  const calm = s.players.find((p) => p.team === 'away' && p.role === 'CB');
  // นักเตะวินัยสูง/skill สูง pressure ต่ำ → เสี่ยงน้อย ; aggressive ล้าหนัก pressure สูง → เสี่ยงมาก
  calm.discipline = 90; calm.tackling = 85; calm.positioning = 85; calm.aggression = 30; calm.stamina = 100;
  const lowRisk = evaluateFoulRisk(s, calm, carrier, 0.2);
  const reckless = { ...calm, discipline: 30, tackling: 40, positioning: 40, aggression: 90, stamina: 20 };
  const highRisk = evaluateFoulRisk(s, reckless, carrier, 2.5);
  assert(highRisk > lowRisk, `ปะทะดุ+ล้า+โดนบีบ ต้องเสี่ยงฟาวล์มากกว่า (${highRisk.toFixed(3)} > ${lowRisk.toFixed(3)})`);
  assert(lowRisk >= 0 && highRisk <= 0.06, 'foul risk ต้องอยู่ในช่วงที่คุมได้ (ไม่ฟาวล์ถี่เกิน)');
  console.log(`Foul risk OK — low ${lowRisk.toFixed(3)}, high ${highRisk.toFixed(3)}`);
}

// ---- 6) Dead ball หยุดเทิร์น + clock เดินเฉพาะ live + restart ทำงานในแมตช์จริง ----
{
  let earlyStops = 0, corners = 0, goalKicks = 0, goals = 0, matches = 10;
  for (let m = 0; m < matches; m++) {
    const s = createInitialState('4-2-3-1');
    s.tacticalScores = analyze(s).scores;
    while (s.phase !== 'finished') {
      const c0 = s.clock;
      playTurn(s);
      const delta = s.clock - c0;
      assert(delta >= 1 && delta <= 8, `clock เดินต่อเทิร์น 1<=delta<=8 (ได้ ${delta})`);
      if (delta < 8) earlyStops++; // เทิร์นที่หยุดเพราะบอลตาย
      for (const e of s.history.at(-1).events) {
        if (e.includes('Corner to')) corners++;
        if (e.includes('Goal kick to')) goalKicks++;
        if (e.startsWith('GOAL')) goals++;
      }
      for (const p of s.players) assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'NaN position');
      assert(Number.isFinite(s.ball.x), 'NaN ball');
      assert(s.score.home >= 0 && s.score.away >= 0, 'score ผิด');
    }
    assert(s.clock <= 38 * 8, 'clock รวมต้องไม่เกิน 38*8');
  }
  assert(earlyStops > 0, 'ต้องมีเทิร์นที่หยุดกลางคันเพราะบอลตายบ้าง');
  assert(corners > 0, 'ต้องมี corner เกิดในแมตช์');
  assert(goalKicks > 0, 'ต้องมี goal kick เกิดในแมตช์');
  const per = (v) => (v / matches).toFixed(1);
  console.log(`Match rules OK — /match: earlyStops ${per(earlyStops)}, corners ${per(corners)}, goalKicks ${per(goalKicks)}, goals ${per(goals)}`);
}

// ---- 7) Save/load ตอน dead ball (restart) ----
{
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  for (let t = 0; t < 3; t++) playTurn(s);
  s.playState = 'deadBall';
  s.restart = { type: 'corner', team: 'home', spot: { x: PITCH.length, y: 0 }, side: 'top', reason: 'ballOut', takerId: null, createdAtClock: 12 };
  s.foulCount = { home: 2, away: 1 };
  const data = serialize(s);
  assert(validateSave(data).ok, 'save ตอน dead ball ต้อง validate ผ่าน');
  const fresh = createInitialState('4-4-2');
  applySave(fresh, data);
  assert(fresh.restart && fresh.restart.type === 'corner', 'load แล้ว restart ยังเป็น corner');
  assert(fresh.restart.spot.x === PITCH.length && fresh.restart.side === 'top', 'restart spot/side คงอยู่');
  assert(fresh.playState === 'deadBall', 'playState คงอยู่');
  assert(fresh.foulCount.home === 2, 'foulCount คงอยู่');
  // กด Play Restart ต่อได้ — corner ถูก execute (อาจเกิด dead ball ใหม่ในเทิร์นนั้นได้)
  const clockBefore = fresh.clock;
  playTurn(fresh);
  assert(fresh.players.every((p) => Number.isFinite(p.x)), 'เล่นต่อหลัง load dead ball ได้');
  assert(fresh.clock > clockBefore, 'restart ถูก execute และเทิร์นเดินต่อ (clock เพิ่ม)');
  console.log('Save/load dead ball OK');
}

// ---- 8) save เก่า (ไม่มี match-rule fields) ต้อง migrate ----
{
  const s = createInitialState('4-2-3-1');
  const data = serialize(s);
  delete data.playState; delete data.restart; delete data.foulCount; delete data.cards;
  assert(validateSave(data).ok, 'legacy save (ไม่มี match fields) validate ผ่าน');
  const fresh = createInitialState('4-3-3');
  applySave(fresh, data);
  assert(fresh.playState === 'live' && fresh.restart === null, 'migrate: playState=live, restart=null');
  assert(fresh.foulCount && fresh.cards, 'migrate: foulCount/cards เติม default');
  console.log('Legacy migration OK');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P2.8 MATCH RULES TESTS PASS ✅');
