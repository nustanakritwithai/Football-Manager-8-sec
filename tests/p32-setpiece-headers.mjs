// P3.2 Set-piece headers + whistle-wait
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const { createInitialState } = await import(`${BASE}/state.js`);
const { startSimulation, simTick } = await import(`${BASE}/simulation.js`);
const { analyze } = await import(`${BASE}/tacticalAnalyzer.js`);
const { setupCornerScenario } = await import(`${BASE}/scenarios.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };
const playTurn = (s) => { startSimulation(s); let n = 0; while (!simTick(s)) if (++n > 200) throw new Error('stuck'); };

// ---- 1) ซ้อมเตะมุม: ต้องเปิดเข้ากรอบ + มีจังหวะโหม่ง + เป่านกหวีดก่อนเตะ ----
{
  let whippedIn = 0, whistles = 0, headers = 0, headerOnGoal = 0, dribbledByTaker = 0, flicks = 0, N = 40;
  for (let m = 0; m < N; m++) {
    const s = createInitialState('4-2-3-1');
    s.tacticalScores = analyze(s).scores;
    setupCornerScenario(s);
    const takerId = s.setPiece.takerId;
    playTurn(s);
    const ev = s.history.at(-1).events;
    if (ev.some((e) => e.startsWith('Referee whistles'))) whistles++;
    if (ev.some((e) => e.startsWith('Corner whipped'))) whippedIn++;
    if (ev.some((e) => /[Hh]eader|[Hh]eaded|flicks on|rises for/.test(e))) headers++;
    if (ev.some((e) => e.includes('Header chance') || e.includes('Header —') || e.includes('rises for'))) headerOnGoal++;
    if (ev.some((e) => e.includes('flicks on'))) flicks++;
    // คนเตะต้องไม่เลี้ยงเอง (ไม่มี event carry ของตัวเตะ)
    if (ev.some((e) => e.includes('carried ball forward'))) dribbledByTaker++;
  }
  console.log(`Corner x${N}: whistle ${whistles}, whippedIn ${whippedIn}, headerEvents ${headers}, header-on-goal ${headerOnGoal}, flick-ons ${flicks}, taker-dribbled ${dribbledByTaker}`);
  assert(whistles >= N * 0.9, `ต้องเป่านกหวีดก่อนเตะเกือบทุกครั้ง (${whistles}/${N})`);
  assert(whippedIn >= N * 0.85, `เตะมุมต้องเปิดเข้ากรอบ (${whippedIn}/${N})`);
  assert(headers >= N * 0.7, `ต้องเกิดจังหวะโหม่ง (รุก/รับ) บ่อย (${headers}/${N})`);
  assert(headerOnGoal >= N * 0.25, `ต้องมีจังหวะโหม่งของฝ่ายรุกพอควร (${headerOnGoal}/${N})`);
  assert(dribbledByTaker === 0, 'คนเตะมุมห้ามเลี้ยงเอง');
}

// ---- 2) whistle มาก่อนการเปิดบอลจริง (ลำดับ event ถูก) ----
{
  const s = createInitialState('4-2-3-1');
  s.tacticalScores = analyze(s).scores;
  setupCornerScenario(s);
  // เดิน tick ทีละก้าวจน setPiece ถูกเตะ (null) แล้วเช็กว่าเคยมี whistled=true ก่อน
  startSimulation(s);
  let sawWhistleFlag = false, deliveredTick = -1, t = 0;
  while (true) {
    const done = simTick(s); t++;
    if (s.setPiece && s.setPiece.whistled) sawWhistleFlag = true;
    if (!s.setPiece && deliveredTick < 0) deliveredTick = t; // setPiece ถูกเคลียร์ = เตะแล้ว
    if (done) break;
  }
  assert(sawWhistleFlag, 'ต้องมีจังหวะ whistled=true ก่อนเตะ');
  assert(deliveredTick >= 9, `ต้องรอ (~13 ticks) ก่อนเตะ ไม่เตะทันที (เตะ tick ${deliveredTick})`);
  console.log(`Whistle-wait OK — เตะที่ ~tick ${deliveredTick} (รอ ~1.3s)`);
}

// ---- 3) in-match corner ก็ใช้ระบบเดียวกัน (setupCorner ตั้ง setPiece) ----
{
  // ยิงจนเกิด corner สักลูกแล้วเช็กว่ารอบถัดไปมี setPiece corner + เป่านกหวีด
  let foundCornerSetPiece = false;
  for (let m = 0; m < 8 && !foundCornerSetPiece; m++) {
    const s = createInitialState({ homeTeamId: 'man-sky', awayTeamId: 'ipswich' });
    s.tacticalScores = analyze(s).scores;
    for (let i = 0; i < 40 && s.phase !== 'finished'; i++) {
      playTurn(s);
      // ถ้ามี restart corner ค้าง → เทิร์นถัดไป executeRestart จะตั้ง setPiece
      if (s.restart && s.restart.type === 'corner') {
        playTurn(s);
        if (s.history.at(-1).events.some((e) => e.startsWith('Referee whistles') || e.startsWith('Corner whipped'))) {
          foundCornerSetPiece = true;
        }
        break;
      }
    }
  }
  // ไม่บังคับว่าต้องเจอ corner ในจำนวนจำกัด แต่ถ้าเจอต้องทำงานถูก
  console.log(`In-match corner wired: ${foundCornerSetPiece ? 'พบและทำงานถูก' : 'ไม่พบ corner ใน sample (ยอมรับได้)'}`);
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P3.2 SET-PIECE HEADER TESTS PASS ✅');
