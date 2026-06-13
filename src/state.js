// game state กลางของทั้งเกม

import { MATCH_TURNS, MAX_EVENTS_PER_TURN, SIM_SPEED_DEFAULT } from './config.js';
import { FORMATIONS } from './formations.js';
import { createBall, giveBall } from './ball.js';
import { createTeam, formationToField, randomAwayStyle, teamPlayers } from './team.js';

export function createInitialState(homeFormation = '4-2-3-1') {
  const awayStyle = randomAwayStyle();
  const home = createTeam('home', 'Tactic Lab FC', '#2f6fed', homeFormation);
  const away = createTeam('away', 'Rival United', '#e0473d', '4-3-3', { styleName: awayStyle });

  const state = {
    phase: 'planning', // planning | simulating | finished
    turn: 1,
    clock: 0,          // วินาทีจำลองที่ผ่านไป
    score: { home: 0, away: 0 },
    teams: { home: home.team, away: away.team },
    players: [...home.players, ...away.players],
    ball: createBall(),
    possessionTeam: 'home',
    // P2.8: match rules & restart state
    possessionStreak: { team: 'home', turns: 0 }, // กี่เทิร์นติดที่ทีมเดิมครองบอลแบบไม่คืบ (กัน stuck DEFENDING)
    playState: 'live',     // live | deadBall | setPiece | goalCelebration | finished
    restart: null,         // { type, team, spot, side, reason, takerId, createdAtClock }
    structuredEvents: [],   // เหตุการณ์แบบ structured ของเทิร์นล่าสุด
    foulCount: { home: 0, away: 0 },
    cards: { yellow: [], red: [] },
    // P2.9: สถิติการยิงสะสมทั้งแมตช์ (ใช้คุม balance + AI วิเคราะห์)
    matchStats: {
      home: { shots: 0, shotsOnTarget: 0, goals: 0, bigChances: 0, xg: 0, saves: 0, blocks: 0, posts: 0, rebounds: 0 },
      away: { shots: 0, shotsOnTarget: 0, goals: 0, bigChances: 0, xg: 0, saves: 0, blocks: 0, posts: 0, rebounds: 0 },
    },
    tacticalScores: null,
    prevScores: null,
    // P2: tactical intelligence
    teamPhases: { home: 'BUILD_UP', away: 'DEFENDING' },
    teamObjectives: { home: 'buildUp', away: 'midBlock' },
    passMemory: { lastPasserId: null, lastReceiverId: null, recentPasses: [] },
    lastTurnStats: { passes: 0, carries: 0, dribbles: 0, runs: 0, shots: 0, cutbacks: 0, missedShots: 0, crosses: 0 },
    replayLog: [], // P3: dataset ต่อเทิร์นสำหรับ export ไปฝึกโมเดลภายหลัง
    // P5: ระบบจาก backlog วิจัย
    pendingPenalty: null,   // { team, takerId } รอผู้เล่นเลือกมุม
    passSamples: [],        // ตัวอย่างการจ่ายบอล (features + สำเร็จ/พลาด) ไว้ฝึกโมเดล
    passModel: null,        // logistic regression ที่ฝึกแล้ว { w, b, acc, n }
    lastTurnEvents: [],
    assistant: { messages: [], ghosts: [] },
    history: [],
    ui: {
      selectedId: null,
      hoverId: null,
      dragId: null,
      simSpeed: SIM_SPEED_DEFAULT,
      scoresDirty: true,
      mouseX: 0,
      mouseY: 0,
    },
    sim: null, // context ระหว่าง simulation
  };

  kickoff(state, 'home');
  return state;
}

// ให้บอลเริ่มที่กลางสนามกับทีมที่ได้เขี่ย
export function kickoff(state, team) {
  const mids = teamPlayers(state, team).filter((p) => ['CM', 'AM', 'DM', 'ST'].includes(p.role));
  const center = { x: 52.5, y: 34 };
  let nearest = mids[0] || teamPlayers(state, team)[0];
  let best = Infinity;
  for (const p of mids) {
    const d = Math.hypot(p.x - center.x, p.y - center.y);
    if (d < best) { best = d; nearest = p; }
  }
  state.ball.x = nearest.x;
  state.ball.y = nearest.y;
  giveBall(state, nearest);
}

export function recordEvent(state, text) {
  if (state.lastTurnEvents.length >= MAX_EVENTS_PER_TURN) return;
  state.lastTurnEvents.push(text);
}

// P2.8: เก็บเหตุการณ์แบบ structured คู่กับ string event (ไว้ให้ UI/analyzer ใช้)
export function recordStructuredEvent(state, ev) {
  if (!Array.isArray(state.structuredEvents)) state.structuredEvents = [];
  state.structuredEvents.push({ clock: Math.round(state.clock), ...ev });
}

// เปลี่ยน formation ของทีมเรา (ใช้ตอน planning) — จัดตำแหน่งใหม่ตาม preset
export function applyFormation(state, formationName) {
  const slots = FORMATIONS[formationName];
  if (!slots) return;
  state.teams.home.formation = formationName;
  const homePlayers = teamPlayers(state, 'home');
  slots.forEach((slot, i) => {
    const p = homePlayers[i];
    if (!p) return;
    const pos = formationToField(slot, 'home');
    p.role = slot.role;
    p.x = pos.x; p.y = pos.y;
    p.targetX = pos.x; p.targetY = pos.y;
    p.baseX = pos.x; p.baseY = pos.y;
    p.pathHistory = [];
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
  });
  state.ui.scoresDirty = true;
}

// reset ตำแหน่งทุกคนกลับ formation (ผู้เล่นกดเองเท่านั้น)
export function resetFormation(state) {
  applyFormation(state, state.teams.home.formation);
  const awaySlots = FORMATIONS[state.teams.away.formation];
  const awayPlayers = teamPlayers(state, 'away');
  awaySlots.forEach((slot, i) => {
    const p = awayPlayers[i];
    if (!p) return;
    const pos = formationToField(slot, 'away');
    p.x = pos.x; p.y = pos.y;
    p.targetX = pos.x; p.targetY = pos.y;
    p.baseX = pos.x; p.baseY = pos.y;
    p.pathHistory = [];
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
  });
  state.passMemory = { lastPasserId: null, lastReceiverId: null, recentPasses: [] };
  kickoff(state, 'home');
  state.assistant = { messages: [{ text: 'รีเซ็ตตำแหน่งกลับ formation เริ่มต้นแล้ว', severity: 'info' }], ghosts: [] };
  state.ui.scoresDirty = true;
}

export function clearPaths(state) {
  for (const p of state.players) p.pathHistory = [];
}

export function isMatchOver(state) {
  return state.turn > MATCH_TURNS;
}
