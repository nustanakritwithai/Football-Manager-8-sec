// simulation 8 วินาที — หัวใจของเกม
// P2 Tactical Intelligence: ball carrier เลือก pass/carry/dribble/hold/shoot/clear/switch
// คนไม่มีบอลวิ่งตาม role + team phase + objective, มี separation กันกองรวมกัน

import {
  PITCH, TICKS_PER_TURN, TICK_DT, TURN_SECONDS,
  PATH_SAMPLE_EVERY, MAX_HISTORY, MATCH_TURNS, HALF_TURNS, MATCH_SECONDS, HALFTIME_STAMINA_BOOST,
  MIN_PLAYER_SPACING, SEPARATION_FORCE, CONGESTION_GRID, CONGESTION_LIMIT,
  CARRY_SPACE_THRESHOLD, DRIBBLE_PRESSURE_MAX, PASS_MEMORY_SIZE,
  PLAYER_TOUCH_RADIUS, PLAYER_BLOCK_RADIUS, BALL_REACH_HEIGHT, DEFLECTION_NOISE,
  SECOND_BALL_RADIUS, FIRST_TOUCH_LOOSE, FIRST_TOUCH_CLEAN,
  POST_HIT_CHANCE, POST_REBOUND_POWER, GK_HOLD_CHANCE, GK_PARRY_POWER, GK_PARRY_CENTER_CHANCE,
  GOAL_HALF_WIDTH, CROSSBAR_HEIGHT, PENALTY_AREA_DEPTH, PENALTY_AREA_HALF_WIDTH,
  PENALTY_SPOT_DISTANCE, SIX_YARD_DEPTH, FOUL_BASE_RATE, FOUL_PRESSURE_WEIGHT,
  YELLOW_CARD_THRESHOLD, TACKLE_RADIUS, TACKLE_BASE_CHANCE,
  GOAL_HEIGHT, SHOT_XG_MIN, SHOT_XG_MAX, BIG_CHANCE_XG, LONG_SHOT_MAX_XG,
  GK_BASE_REACH, GK_REACTION_WEIGHT, SHOT_TARGET_ERROR_BASE, SHOT_PRESSURE_ERROR,
  POST_CHANCE_MAX, REBOUND_CHANCE_BASE,
} from './config.js';
import { clamp, dist, distP, lerp, pointSegDist, rand } from './utils.js';
import { maxSpeed, movementRadius, firstTouchAttr, reactionAttr } from './player.js';
import {
  giveBall, startPass, makeLoose, createRebound, stepLooseBall, reflectVelocity,
  markLastTouch, placeBallAtRestartSpot, markShotLastTouch,
} from './ball.js';
import { attackDir, goalAttackedBy, goalDefendedBy, teamPlayers, getPlayer } from './team.js';
import { recordEvent, recordStructuredEvent, kickoff, isMatchOver } from './state.js';
import { analyze } from './tacticalAnalyzer.js';
import { generateAdvice } from './aiAssistant.js';
import { epvGain, epvValue } from './pitchControl.js';
import { awardPenalty } from './penalty.js';
import { collectPassSample, predictPass } from './learning.js';

// ---------- เริ่ม / จบ เทิร์น ----------

export function startSimulation(state) {
  if (state.phase !== 'planning') return false;
  if (state.pendingPenalty) return false; // ต้องตัดสินจุดโทษก่อน

  state.structuredEvents = [];

  // P2.8: ถ้ามี restart ค้างอยู่ (dead ball เทิร์นก่อน) → วางบอล/จัดตำแหน่งตามกติกาก่อนเริ่มเล่น
  if (state.restart) {
    executeRestart(state);
  }
  state.playState = 'live';

  // ล็อกคำสั่ง: intended target (clamp ตาม radius อีกรอบ) → targetX/Y ของเทิร์นนี้
  for (const p of state.players) {
    p.pathHistory = [{ x: p.x, y: p.y }];
    p.isSelected = p.id === state.ui.selectedId;
    p.runType = null;
    p.runTarget = null;
    p.currentAction = null;
    if (p.team === 'home' && p.intendedTarget) {
      const t = clampToRadius(p, p.intendedTarget.x, p.intendedTarget.y);
      p.targetX = t.x;
      p.targetY = t.y;
      p.commandLocked = true;
    } else if (p.team === 'home') {
      p.targetX = p.x;
      p.targetY = p.y;
      p.commandLocked = false;
    }
  }

  opponentPlan(state); // AI คู่แข่งวางแผน (rule-based)

  state.prevScores = state.tacticalScores ? { ...state.tacticalScores } : null;
  state.lastTurnEvents = [];
  state.sim = {
    tick: 0,
    cooldowns: new Map(),     // playerId -> วินาทีก่อนตัดสินใจครั้งถัดไป
    carrierMove: new Map(),   // playerId -> { x, y, mode: 'carry'|'dribble'|'hold', defenderId? }
    possessionTicks: { home: 0, away: 0 },
    transition: { home: 0, away: 0 }, // ตัวจับเวลา transition หลังบอลเปลี่ยนมือ
    lastPossession: state.possessionTeam,
    startSnapshot: snapshotPositions(state),
    ballStart: { x: state.ball.x, y: state.ball.y },
    possessionStart: state.possessionTeam,
    pendingPass: null,        // { fromId, startX, toRunner }
    justReceived: new Map(),  // playerId -> tick ที่เพิ่งได้บอล (first-time shot bonus)
    holdCount: new Map(),     // playerId -> จำนวนครั้งที่เลือก hold ติดกัน (กันถือบอลค้างทั้งเทิร์น)
    stats: {
      home: { passes: 0, carries: 0, dribbles: 0, runs: 0, shots: 0, cutbacks: 0, missedShots: 0, crosses: 0, shotsOnTarget: 0, xg: 0, saves: 0, blocks: 0, posts: 0 },
      away: { passes: 0, carries: 0, dribbles: 0, runs: 0, shots: 0, cutbacks: 0, missedShots: 0, crosses: 0, shotsOnTarget: 0, xg: 0, saves: 0, blocks: 0, posts: 0 },
    },
    congestion: null,
    lastAction: null,         // ป้าย action ล่าสุดของผู้ถือบอล (แสดงบนสนาม)
    pressEvents: 0,
    carryEventLogged: false,
    goalScored: false,
    // P2.7: ball physics state
    ballFx: null,             // { label, x, y, ttl } ป้ายชั่วคราว (Deflect/Rebound/Parry/Loose)
    secondBall: null,         // { mode, team } loose ball ที่รอ second-ball contest
    contestLogged: false,     // กัน log "Second ball contest" ซ้ำ
  };

  updatePhases(state);
  updateObjectives(state, true);
  state.phase = 'simulating';
  return true;
}

export function simTick(state) {
  const sim = state.sim;
  if (!sim) return true;

  stepTick(state);
  sim.tick++;

  if (sim.tick % PATH_SAMPLE_EVERY === 0) {
    for (const p of state.players) {
      p.pathHistory.push({ x: p.x, y: p.y });
      if (p.pathHistory.length > 60) p.pathHistory.shift();
    }
  }

  if (sim.tick >= TICKS_PER_TURN || sim.forceEnd) {
    finishSimulation(state);
    return true;
  }
  return false;
}

function finishSimulation(state) {
  const sim = state.sim;

  // Resolution: ตำแหน่งสุดท้ายกลายเป็นสถานะจริง — คำสั่งถูกใช้ไปแล้ว เคลียร์ intent
  for (const p of state.players) {
    p.targetX = p.x;
    p.targetY = p.y;
    p.intendedTarget = null;
    p.commandLocked = false;
  }

  // นาฬิกาแมตช์ 90 นาที: แต่ละเทิร์น (action 8 วิ) เดินนาฬิกาแมตช์ทีละก้อน
  // เพื่อให้ครบ 0→45:00 (พักครึ่ง เทิร์น 40) และ →90:00 (จบ เทิร์น 80)
  const turnStartClock = Math.round(((state.turn - 1) / MATCH_TURNS) * MATCH_SECONDS);
  state.clock = Math.round((state.turn / MATCH_TURNS) * MATCH_SECONDS);
  if (!sim.endedByRestart) state.playState = 'live';
  state.lastTurnStats = { ...sim.stats.home };
  state.setPiece = null; // ลูกตั้งเตะถูกเล่นไปแล้ว (หรือหมดจังหวะ) เล่นปกติต่อ

  // P2.8/fix: ติดตามการครองบอลยืดเยื้อ — ถ้าทีมเดิมครองต่อเนื่องโดยไม่มีการยิง = stall
  // ใช้เร่ง pressing ของอีกฝ่ายให้แย่งบอลคืน กัน "ติด DEFENDING/midBlock วนไม่จบ"
  {
    const poss = state.possessionTeam;
    const hadShot = (sim.stats.home.shots + sim.stats.away.shots) > 0;
    const prev = state.possessionStreak;
    if (!prev || prev.team !== poss || hadShot) state.possessionStreak = { team: poss, turns: 1 };
    else state.possessionStreak = { team: poss, turns: prev.turns + 1 };
  }

  const analysis = analyze(state);
  state.tacticalScores = analysis.scores;
  const advice = generateAdvice(state, analysis, state.lastTurnEvents, state.prevScores);
  state.assistant = advice;

  // P5: Ghost defender replay — เทิร์นที่โดนเจาะ ชี้กองหลังที่หลุดแนวมากสุด
  addGhostReplay(state, advice);

  if (state.pendingPenalty) {
    advice.messages.unshift({
      severity: 'danger',
      text: state.pendingPenalty.team === 'home'
        ? 'จุดโทษของเรา! เลือกมุมยิงในการ์ด Penalty ก่อนเล่นต่อ'
        : 'คู่แข่งได้จุดโทษ! เลือกทางพุ่งของ GK ในการ์ด Penalty ก่อนเล่นต่อ',
    });
  }

  state.history.push({
    turnNumber: state.turn,
    startClock: turnStartClock,
    endClock: state.clock,
    startingPositions: sim.startSnapshot,
    endingPositions: snapshotPositions(state),
    ballStart: sim.ballStart,
    ballEnd: { x: state.ball.x, y: state.ball.y },
    possessionStart: sim.possessionStart,
    possessionEnd: state.possessionTeam,
    teamPhase: state.teamPhases.home,
    teamObjective: state.teamObjectives.home,
    tacticalScoresBefore: state.prevScores,
    tacticalScoresAfter: { ...analysis.scores },
    events: [...state.lastTurnEvents],
    assistantMessages: advice.messages.map((m) => m.text),
  });
  if (state.history.length > MAX_HISTORY) state.history.shift();

  // P3: replay dataset — บันทึกข้อมูลต่อเทิร์นแบบกะทัดรัดสำหรับ export
  if (!Array.isArray(state.replayLog)) state.replayLog = [];
  state.replayLog.push({
    turn: state.turn,
    phase: state.teamPhases.home,
    objective: state.teamObjectives.home,
    possessionStart: sim.possessionStart,
    possessionEnd: state.possessionTeam,
    start: sim.startSnapshot,
    end: snapshotPositions(state),
    ballStart: sim.ballStart,
    ballEnd: { x: +state.ball.x.toFixed(1), y: +state.ball.y.toFixed(1) },
    stats: { ...sim.stats.home },
    shots: state.lastTurnEvents.filter((e) => e.includes('Shot chance')).length,
    goal: sim.goalScored,
    scores: { ...analysis.scores },
  });
  if (state.replayLog.length > 200) state.replayLog.shift();

  state.turn++;
  state.sim = null;
  state.phase = isMatchOver(state) ? 'finished' : 'planning';
  state.ui.scoresDirty = true;

  // พักครึ่ง: หลังจบเทิร์นที่ HALF_TURNS (40) → ครึ่งหลัง, ฟื้น stamina บางส่วน, คู่แข่งเขี่ยบอล
  if (state.turn === HALF_TURNS + 1 && state.half === 1 && state.phase !== 'finished') {
    state.half = 2;
    for (const p of state.players) p.stamina = clamp(p.stamina + HALFTIME_STAMINA_BOOST, 0, 100);
    state.restart = makeRestart('kickoff', 'away', { x: PITCH.length / 2, y: 34 }, null, 'secondHalf');
    state.playState = 'halftime';
    recordEvent(state, 'Half Time — second half kick-off to Away');
    recordStructuredEvent(state, { type: 'HALF_TIME', team: 'away' });
    state.assistant.messages.unshift({
      severity: 'info',
      text: 'พักครึ่ง (45\') — นักเตะฟื้น stamina บางส่วน ครึ่งหลังคู่แข่งเป็นฝ่ายเขี่ยบอล กด Play เพื่อเริ่มครึ่งหลัง',
    });
  }

  if (state.phase === 'finished') {
    state.assistant.messages.unshift({
      text: `จบแมตช์ (Full Time)! สกอร์ ${state.score.home}-${state.score.away} — ครองบอลรวมฝั่งเรา ${possessionPercent(state)}%`,
      severity: 'info',
    });
  }
}

// P5: ตำแหน่ง "ที่ควรยืน" ของกองหลังตามวินัยแนวรับ (ghosting แบบ Le/Carr)
export function defensiveIdealFor(state, p) {
  if (!['CB', 'LB', 'RB', 'DM'].includes(p.role)) return null;
  const b = state.ball;
  const dir = attackDir(p.team);
  const team = state.teams[p.team];
  const ownGoalX = p.team === 'home' ? 0 : PITCH.length;
  const lineDepth = 12 + team.defensiveLine * 4;
  const ballPull = clamp((b.x - PITCH.length / 2) * dir, -20, 20);
  const lineX = ownGoalX + dir * clamp(lineDepth + ballPull * 0.45, 8, 48);
  const y = clamp(lerp(p.baseY, 34, 0.15) + (b.y - 34) * 0.18, 2, PITCH.width - 2);
  return { x: clamp(lineX, 2, PITCH.length - 2), y };
}

function addGhostReplay(state, advice) {
  const danger = state.lastTurnEvents.some(
    (e) => (e.includes('Shot chance') && e.includes('Their'))
      || e.startsWith('PENALTY to them')
      || (e.startsWith('GOAL') && e.includes(state.teams.away.teamName))
  );
  if (!danger) return;

  let worst = null;
  for (const p of teamPlayers(state, 'home')) {
    const ideal = defensiveIdealFor(state, p);
    if (!ideal) continue;
    const dev = dist(p.x, p.y, ideal.x, ideal.y);
    if (dev > 9 && (!worst || dev > worst.dev)) worst = { p, ideal, dev };
  }
  if (!worst) return;

  advice.ghosts.push({
    playerId: worst.p.id,
    x: worst.ideal.x,
    y: worst.ideal.y,
    label: 'แนวที่ควรยืน',
  });
  advice.messages.push({
    severity: 'warn',
    text: `Ghost replay: ตอนโดนเจาะ ${worst.p.role} (#${worst.p.number}) อยู่ห่างจากแนวที่ควรยืน ${Math.round(worst.dev)} เมตร — วง ghost คือตำแหน่งอ้างอิงตามวินัยแนวรับ`,
  });
  if (advice.messages.length > 4) advice.messages.length = 4;
}

function snapshotPositions(state) {
  return state.players.map((p) => ({ id: p.id, x: +p.x.toFixed(1), y: +p.y.toFixed(1) }));
}

function possessionPercent(state) {
  let h = 0, a = 0;
  for (const t of state.history) {
    if (t.possessionEnd === 'home') h++; else a++;
  }
  const total = h + a;
  return total ? Math.round((h / total) * 100) : 50;
}

function clampToRadius(p, tx, ty) {
  const r = movementRadius(p);
  const d = dist(p.x, p.y, tx, ty);
  if (d <= r) return { x: clamp(tx, 0.5, PITCH.length - 0.5), y: clamp(ty, 0.5, PITCH.width - 0.5) };
  return {
    x: clamp(p.x + ((tx - p.x) / d) * r, 0.5, PITCH.length - 0.5),
    y: clamp(p.y + ((ty - p.y) / d) * r, 0.5, PITCH.width - 0.5),
  };
}

// ---------- Team Phase / Objective ----------

export function evaluateTeamPhase(state, teamId) {
  const sim = state.sim;
  const hasBall = state.possessionTeam === teamId && !state.ball.isLoose;
  if (sim && sim.transition[teamId] > 0) {
    return hasBall ? 'TRANSITION_TO_ATTACK' : 'TRANSITION_TO_DEFENSE';
  }
  if (!hasBall) return 'DEFENDING';
  const dir = attackDir(teamId);
  const progress = dir === 1 ? state.ball.x : PITCH.length - state.ball.x; // ระยะจากประตูตัวเอง
  if (progress < 38) return 'BUILD_UP';
  if (progress > 72) return 'FINAL_THIRD';
  return 'ATTACKING';
}

export function evaluateTeamObjective(state, teamId) {
  const phase = state.teamPhases[teamId];
  const t = state.teams[teamId];
  const b = state.ball;

  // บอลหลุดเป็น loose ball = 50/50 ทั้งสองทีมต้องวิ่งแย่ง (ไม่ใช่ยืน midBlock เฉย ๆ)
  if (b.isLoose) return 'recoverBall';
  if (phase === 'DEFENDING') return t.pressingLevel >= 4 ? 'highPress' : 'midBlock';
  if (phase === 'TRANSITION_TO_DEFENSE') return 'recoverShape';
  if (phase === 'TRANSITION_TO_ATTACK') return 'counterAttack';
  if (phase === 'BUILD_UP') return 'buildUp';

  // มีบอลแดนกลาง/หน้า: ถ้าฝั่งบอลแออัดและปีกฝั่งไกลว่าง → switch
  const crowd = state.players.filter((p) => distP(p, b) < 13).length;
  const farWinger = teamPlayers(state, teamId).find(
    (p) => ['LW', 'RW'].includes(p.role) && Math.abs(p.y - b.y) > 26
  );
  if (crowd >= 6 && farWinger) return 'switchPlay';

  if (phase === 'FINAL_THIRD') {
    return b.y < 34 ? 'attackHalfSpaceLeft' : 'attackHalfSpaceRight';
  }
  if (b.y < 24) return 'progressLeft';
  if (b.y > 44) return 'progressRight';
  return 'progressThroughMiddle';
}

function updatePhases(state) {
  state.teamPhases.home = evaluateTeamPhase(state, 'home');
  state.teamPhases.away = evaluateTeamPhase(state, 'away');
}

function updateObjectives(state, _logEvent = false) {
  state.teamObjectives.home = evaluateTeamObjective(state, 'home');
  state.teamObjectives.away = evaluateTeamObjective(state, 'away');
  // หมายเหตุ: ไม่ log "Objective: ..." ลง event log อีกต่อไป — เป็นข้อมูล coaching
  // ที่แสดงบนแดชบอร์ด (teamPhase) อยู่แล้ว การ log ทุกเทิร์นทำให้ event log รก/ดูเหมือนวนซ้ำ
}

// ---------- AI คู่แข่งวางแผนก่อนเทิร์น ----------

function opponentPlan(state) {
  const away = teamPlayers(state, 'away');
  const ball = state.ball;
  const hasBall = state.possessionTeam === 'away';
  const t = state.teams.away;

  for (const p of away) {
    let tx = p.baseX;
    let ty = p.baseY;

    tx += (ball.x - PITCH.length / 2) * 0.22;
    ty += (ball.y - PITCH.width / 2) * (p.role === 'GK' ? 0.05 : 0.3);

    if (hasBall) {
      if (p.role !== 'GK') tx -= 4 + t.tempo * 1.2; // away บุกไปทาง x น้อย
      if (['LW', 'RW'].includes(p.role)) ty = lerp(ty, p.baseY, 0.5);
    } else {
      if (p.role !== 'GK') {
        tx += (5 - t.defensiveLine) * 2.2;
        ty = lerp(ty, PITCH.width / 2, 0.18);
      }
    }

    const c = clampToRadius(p, tx, ty); // คู่แข่งก็ถูกจำกัดด้วยร่างกายเช่นกัน
    p.targetX = c.x;
    p.targetY = c.y;
  }
}

// ---------- หนึ่ง tick ----------

function stepTick(state) {
  const sim = state.sim;

  // transition timer เมื่อบอลเปลี่ยนมือ
  if (state.possessionTeam && state.possessionTeam !== sim.lastPossession) {
    sim.transition.home = 2.5;
    sim.transition.away = 2.5;
    sim.lastPossession = state.possessionTeam;
  }
  sim.transition.home = Math.max(0, sim.transition.home - TICK_DT);
  sim.transition.away = Math.max(0, sim.transition.away - TICK_DT);

  updatePhases(state);
  if (sim.tick % 20 === 0) updateObjectives(state);
  if (sim.tick % 5 === 0) sim.congestion = buildCongestion(state);

  updateBall(state);
  if (sim.forceEnd) return; // P2.8: บอลตาย (goal/out/foul) → หยุดเทิร์นทันที

  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner) decideCarrier(state, owner);
  if (sim.forceEnd) return; // เช่น ยิงเข้าประตูระหว่างตัดสินใจ

  for (const p of state.players) movePlayer(state, p, owner);

  const o = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (o && !state.ball.inFlight) {
    const dir = attackDir(o.team);
    state.ball.x = clamp(o.x + dir * 0.8, 0.5, PITCH.length - 0.5);
    state.ball.y = o.y;
    // fix: เขี่ย/แย่งบอลจากผู้ถือบอลที่พักบอล → บอลกระเด้งออก (กันบอลค้างนิ่งใน midblock)
    if (resolveTackle(state, o)) return;
    // P2.8: ฟาวล์จากการเข้าปะทะผู้ถือบอล → free kick / penalty
    if (checkFoul(state, o)) return;
  }

  if (state.possessionTeam) sim.possessionTicks[state.possessionTeam]++;
}

// ---------- congestion grid ----------

export function zoneOf(x, y) {
  const col = clamp(Math.floor((x / PITCH.length) * CONGESTION_GRID.cols), 0, CONGESTION_GRID.cols - 1);
  const row = clamp(Math.floor((y / PITCH.width) * CONGESTION_GRID.rows), 0, CONGESTION_GRID.rows - 1);
  return row * CONGESTION_GRID.cols + col;
}

function buildCongestion(state) {
  const zones = Array.from({ length: CONGESTION_GRID.cols * CONGESTION_GRID.rows }, () => ({ home: 0, away: 0 }));
  for (const p of state.players) {
    if (p.role === 'GK') continue;
    zones[zoneOf(p.x, p.y)][p.team]++;
  }
  return zones;
}

function zoneCrowd(state, team, x, y) {
  const sim = state.sim;
  if (!sim?.congestion) return 0;
  return sim.congestion[zoneOf(x, y)][team];
}

// ---------- ลูกบอล ----------

function updateBall(state) {
  const b = state.ball;
  pushTrail(state, b);
  if (state.sim?.ballFx) {
    state.sim.ballFx.ttl -= 1;
    if (state.sim.ballFx.ttl <= 0) state.sim.ballFx = null;
  }

  if (b.inFlight) {
    const d = dist(b.x, b.y, b.targetX, b.targetY);
    const step = b.flightSpeed * TICK_DT;

    // บอลโด่ง (cross) ลอยข้ามหัว — ตัดกลางทางไม่ได้ ไปวัดกันตอนบอลตก
    const aerial = !!state.sim.pendingPass?.cross;
    // วาดความสูงของลูกโด่ง (cosmetic): พาราโบลาตามระยะที่เดินทางไป
    if (aerial) {
      const pp = state.sim.pendingPass;
      const sx = pp?.startX ?? b.x, sy = pp?.startY ?? b.y;
      const total = dist(sx, sy, b.targetX, b.targetY);
      const t = total > 0.5 ? clamp(1 - d / total, 0, 1) : 1;
      b.z = Math.sin(t * Math.PI) * clamp(total * 0.18, 2, 9);
    }
    for (const p of state.players) {
      if (aerial) break;
      if (p.team === b.lastTouchTeam) continue;
      if (distP(p, b) < 1.2) {
        // ชิงบอล: ตัดเรียบ (clean intercept) หรือแฉลบ (deflection) สำหรับบอลแรง
        if (Math.random() < 0.16 + p.positioning / 300) {
          labelPendingPass(state, 0);
          giveBall(state, p);
          recordEvent(state, `Interception by ${p.team === 'home' ? 'our' : 'their'} ${p.role} (#${p.number})`);
          noteTurnover(state, p.team);
          return;
        }
        // บอลพุ่งแรงผ่านจ่อตัว → แฉลบเป็น loose ball (ไม่ใช่ตัดได้สะอาด)
        // โอกาสต่ำต่อ tick เพื่อไม่ให้บอลเด้งมั่วเหมือน pinball
        if (b.flightSpeed > 19 && distP(p, b) < PLAYER_BLOCK_RADIUS && Math.random() < 0.1) {
          labelPendingPass(state, 0);
          deflectInFlightOff(state, p);
          return;
        }
      }
    }

    if (d <= step) {
      b.x = b.targetX;
      b.y = b.targetY;
      b.inFlight = false;
      b.z = 0;
      resolvePassArrival(state);
    } else {
      b.x += ((b.targetX - b.x) / d) * step;
      b.y += ((b.targetY - b.y) / d) * step;
    }
    return;
  }

  if (b.isLoose) {
    stepLooseBall(b);
    // P2.8: บอลข้ามเส้นประตู (goal) หรือออกสนาม (throw-in/goal kick/corner) → dead ball
    if (checkGoalAndOut(state)) return;
    resolveLooseRecovery(state);
  }
}

// ---------- P2.8: Goal / Ball-out detection ----------

// pure: จัดประเภทเหตุการณ์บอลตายจากตำแหน่ง + ผู้สัมผัสล่าสุด (ทดสอบได้ตรง ๆ)
// คืน { kind, team, side, spot } หรือ null ถ้าบอลยังอยู่ในสนาม
export function classifyDeadBall(ball) {
  const b = ball;
  const inGoalMouth = b.y > 34 - GOAL_HALF_WIDTH && b.y < 34 + GOAL_HALF_WIDTH && (b.z || 0) < CROSSBAR_HEIGHT;

  if (b.x >= PITCH.length && inGoalMouth) return { kind: 'goal', team: 'home' };
  if (b.x <= 0 && inGoalMouth) return { kind: 'goal', team: 'away' };

  // ออกหลังฝั่งขวา (ประตูฝั่ง away)
  if (b.x > PITCH.length) {
    const sideY = b.y < 34 ? 'top' : 'bottom';
    return b.lastTouchTeam === 'home'
      ? { kind: 'goalKick', team: 'away', side: 'right', spot: { x: PITCH.length - SIX_YARD_DEPTH, y: b.y < 34 ? 28 : 40 } }
      : { kind: 'corner', team: 'home', side: sideY, spot: { x: PITCH.length, y: b.y < 34 ? 0 : PITCH.width } };
  }
  // ออกหลังฝั่งซ้าย (ประตูฝั่ง home)
  if (b.x < 0) {
    const sideY = b.y < 34 ? 'top' : 'bottom';
    return b.lastTouchTeam === 'away'
      ? { kind: 'goalKick', team: 'home', side: 'left', spot: { x: SIX_YARD_DEPTH, y: b.y < 34 ? 28 : 40 } }
      : { kind: 'corner', team: 'away', side: sideY, spot: { x: 0, y: b.y < 34 ? 0 : PITCH.width } };
  }
  // ออกเส้นข้าง = throw-in ให้ทีมตรงข้ามคนที่สัมผัสล่าสุด
  if (b.y < 0 || b.y > PITCH.width) {
    return {
      kind: 'throwIn',
      team: b.lastTouchTeam === 'home' ? 'away' : 'home',
      side: b.y < 0 ? 'top' : 'bottom',
      spot: { x: clamp(b.x, 1, PITCH.length - 1), y: b.y < 0 ? 0 : PITCH.width },
    };
  }
  return null;
}

// คืน true ถ้าบอลกลายเป็น dead ball (เทิร์นจะถูกหยุด)
function checkGoalAndOut(state) {
  const res = classifyDeadBall(state.ball);
  if (!res) return false;
  if (res.kind === 'goal') { handleGoal(state, res.team); return true; }
  createRestartEvent(state, res.kind, res.team, res.spot, res.side);
  return true;
}

// จุด goal kick ของทีมที่เล่น (ในกรอบ 6 หลาของตัวเอง)
function backLineSpot(state, sideOut, _isCorner) {
  // sideOut = เส้นที่บอลออก; goal kick เล่นจากกรอบของทีมรับฝั่งนั้น
  const x = sideOut === 'right' ? PITCH.length - SIX_YARD_DEPTH : SIX_YARD_DEPTH;
  const y = state.ball.y < 34 ? 34 - 6 : 34 + 6;
  return { x, y: clamp(y, 10, PITCH.width - 10) };
}

function handleGoal(state, scoringTeam) {
  state.score[scoringTeam]++;
  if (state.matchStats?.[scoringTeam]) state.matchStats[scoringTeam].goals++;
  if (state.sim) state.sim.goalScored = true;
  const concede = scoringTeam === 'home' ? 'away' : 'home';
  recordEvent(state, `GOAL!!! ${scoringTeam === 'home' ? state.teams.home.teamName : state.teams.away.teamName} scores!`);
  recordStructuredEvent(state, { type: 'GOAL', team: scoringTeam, text: 'Goal' });
  stopForRestart(state, makeRestart('kickoff', concede, { x: PITCH.length / 2, y: 34 }, null, 'goal'), 'goalCelebration');
}

// สร้าง restart + log + หยุดเทิร์น (ใช้ตอนบอลออก)
function createRestartEvent(state, type, team, spot, side) {
  const labels = {
    goalKick: 'Goal kick', corner: 'Corner', throwIn: 'Throw-in', freeKick: 'Free kick',
  };
  const who = team === 'home' ? 'Home' : 'Away';
  const sideTxt = side ? ` on the ${side}` : '';
  recordEvent(state, `${labels[type] || type} to ${who}${sideTxt}`);
  recordStructuredEvent(state, { type: restartEventType(type), team, spot, side, text: `${labels[type]} to ${who}` });
  stopForRestart(state, makeRestart(type, team, spot, side, 'ballOut'), 'deadBall');
}

function restartEventType(type) {
  return { goalKick: 'BALL_OUT_GOAL_KICK', corner: 'BALL_OUT_CORNER', throwIn: 'BALL_OUT_THROW_IN', freeKick: 'FREE_KICK', penalty: 'PENALTY' }[type] || 'RESTART';
}

function makeRestart(type, team, spot, side, reason) {
  return {
    type, team,
    spot: { x: clamp(spot.x, 0, PITCH.length), y: clamp(spot.y, 0, PITCH.width) },
    side: side ?? null,
    reason: reason ?? null,
    takerId: null,
    createdAtClock: 0,
  };
}

// หยุด simulation ทันที เก็บ restart ไว้ให้เทิร์นถัดไป execute
function stopForRestart(state, restart, playState = 'deadBall') {
  state.restart = restart;
  state.playState = playState;
  if (state.sim) {
    state.sim.forceEnd = true;
    state.sim.endedByRestart = true;
  }
}

// ---------- P2.8: Restart execution (เริ่มเล่นใหม่ตามกติกา) ----------

export function executeRestart(state) {
  const r = state.restart;
  if (!r) return;
  switch (r.type) {
    case 'kickoff': restartAfterGoal(state, r.team); break;
    case 'goalKick': setupGoalKick(state, r); break;
    case 'corner': setupCorner(state, r); break;
    case 'throwIn': setupThrowIn(state, r); break;
    case 'freeKick': setupFreeKick(state, r); break;
    case 'penalty': resolvePenaltyRestart(state, r); break;
    default: break;
  }
  recordStructuredEvent(state, { type: 'SET_PIECE_TAKEN', team: r.team, restart: r.type });
  state.restart = null;
}

function nearestTeammateTo(state, team, spot, excludeGK = true) {
  let best = null, bd = Infinity;
  for (const p of teamPlayers(state, team)) {
    if (excludeGK && p.role === 'GK') continue;
    const d = dist(p.x, p.y, spot.x, spot.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best || teamPlayers(state, team)[0];
}

function setupGoalKick(state, r) {
  const gk = teamPlayers(state, r.team).find((p) => p.role === 'GK');
  const taker = gk || nearestTeammateTo(state, r.team, r.spot);
  taker.x = r.spot.x; taker.y = r.spot.y;
  placeBallAtRestartSpot(state.ball, r.spot.x, r.spot.y);
  giveBall(state, taker);
}

function setupThrowIn(state, r) {
  const taker = nearestTeammateTo(state, r.team, r.spot);
  taker.x = clamp(r.spot.x, 1, PITCH.length - 1);
  taker.y = clamp(r.spot.y, 0.5, PITCH.width - 0.5);
  placeBallAtRestartSpot(state.ball, taker.x, taker.y);
  giveBall(state, taker);
}

function setupFreeKick(state, r) {
  const taker = nearestTeammateTo(state, r.team, r.spot);
  taker.x = clamp(r.spot.x, 1, PITCH.length - 1);
  taker.y = clamp(r.spot.y, 1, PITCH.width - 1);
  placeBallAtRestartSpot(state.ball, taker.x, taker.y);
  giveBall(state, taker);
}

function setupCorner(state, r) {
  const dir = attackDir(r.team);
  const goalX = r.team === 'home' ? PITCH.length : 0;
  const taker = nearestTeammateTo(state, r.team, r.spot);
  // ดันตัวเป้าเข้า box (ST/CB ตัวสูง/AM/CM) — basic set piece shape
  const targets = teamPlayers(state, r.team)
    .filter((p) => p.role !== 'GK' && p.id !== taker.id && ['ST', 'CB', 'AM', 'CM'].includes(p.role))
    .slice(0, 4);
  const boxX = clamp(goalX - dir * 9, 6, PITCH.length - 6);
  targets.forEach((p, i) => {
    p.x = boxX;
    p.y = clamp(28 + i * 4, 18, 50);
    p.targetX = p.x; p.targetY = p.y;
    p.runType = null; p.runTarget = null;
  });
  taker.x = r.spot.x; taker.y = r.spot.y;
  taker.targetX = r.spot.x; taker.targetY = r.spot.y;
  placeBallAtRestartSpot(state.ball, r.spot.x, r.spot.y);
  giveBall(state, taker);
}

// penalty: auto-resolve ที่จังหวะเริ่มเล่น (MVP) — เข้า/เซฟ/rebound
function resolvePenaltyRestart(state, r) {
  const atk = r.team;
  const def = atk === 'home' ? 'away' : 'home';
  const shooter = teamPlayers(state, atk)
    .filter((p) => p.role !== 'GK')
    .sort((a, b) => b.shooting - a.shooting)[0];
  const gk = teamPlayers(state, def).find((p) => p.role === 'GK');
  const goal = goalAttackedBy(atk);
  recordEvent(state, `Penalty to ${atk === 'home' ? 'Home' : 'Away'}!`);

  bumpMatch(state, atk, 'shots');
  bumpMatch(state, atk, 'shotsOnTarget');
  const scoreChance = clamp(0.62 + (shooter.shooting - (gk?.positioning ?? 60)) / 300, 0.5, 0.85);
  if (Math.random() < scoreChance) {
    state.score[atk]++;
    if (state.matchStats?.[atk]) state.matchStats[atk].goals++;
    recordEvent(state, `Penalty scored by ${atk === 'home' ? 'our' : 'their'} ${shooter.role}!`);
    recordStructuredEvent(state, { type: 'GOAL', team: atk, text: 'Penalty goal' });
    restartAfterGoal(state, def); // เล่นต่อเป็น kickoff ของทีมเสียประตู
  } else {
    // เซฟ/ชนเสา → rebound loose หรือ GK ได้บอล
    placeBallAtRestartSpot(state.ball, goal.x - attackDir(atk) * 6, 34);
    if (gk && Math.random() < 0.5) {
      recordEvent(state, `Penalty saved by ${def === 'home' ? 'our' : 'their'} GK!`);
      giveBall(state, gk);
    } else {
      recordEvent(state, 'Penalty saved — rebound loose');
      makeLoose(state, -attackDir(atk) * rand(3, 7), rand(-4, 4), rand(0, 2), 'rebound');
      markSecondBall(state, 'rebound', atk);
    }
  }
}

// ---------- P2.8: Foul system ----------

function isInPenaltyArea(x, y, defendingTeam) {
  const inY = y > 34 - PENALTY_AREA_HALF_WIDTH && y < 34 + PENALTY_AREA_HALF_WIDTH;
  if (!inY) return false;
  return defendingTeam === 'home' ? x < PENALTY_AREA_DEPTH : x > PITCH.length - PENALTY_AREA_DEPTH;
}

// โอกาสฟาวล์ต่อ tick — มาจาก context ไม่ใช่สุ่มล้วน
export function evaluateFoulRisk(state, tackler, carrier, pressure) {
  const dir = attackDir(carrier.team);
  // อยู่ใกล้กรอบตัวเอง = panic ขึ้น
  const ownGoalX = tackler.team === 'home' ? 0 : PITCH.length;
  const nearOwnGoal = Math.abs(tackler.x - ownGoalX) < 25 ? 0.4 : 0;
  const fatigue = (1 - tackler.stamina / 100) * 0.5;
  const aggro = tackler.aggression / 100;
  const beaten = (carrier.x - tackler.x) * dir > 0.3 ? 0.4 : 0; // โดนเลี้ยงผ่าน/อยู่หลัง
  const skill = (tackler.tackling * 0.6 + tackler.positioning * 0.4) / 100;
  const discipline = tackler.discipline / 100;

  let risk = FOUL_BASE_RATE * 0.4
    + pressure * FOUL_PRESSURE_WEIGHT * 0.05
    + aggro * 0.02
    + fatigue * 0.015
    + beaten * 0.025
    + nearOwnGoal * 0.015
    - skill * 0.03
    - discipline * 0.025;
  return clamp(risk, 0, 0.05);
}

function foulSeverity(state, tackler, carrier) {
  const dir = attackDir(carrier.team);
  const beaten = (carrier.x - tackler.x) * dir > 0.3 ? 0.3 : 0; // ฟาวล์จากด้านหลัง/โดนผ่าน
  const dangerous = tackler.aggression / 100 * 0.3;
  const tacticalFoul = state.teamPhases[carrier.team] === 'TRANSITION_TO_ATTACK' ? 0.25 : 0; // หยุดเคาน์เตอร์
  return clamp(0.2 + beaten + dangerous + tacticalFoul + rand(0, 0.2) - tackler.discipline / 100 * 0.2, 0, 1);
}

// fix: แย่ง/เขี่ยบอลจากผู้ถือบอลที่ "พักบอล/บังบอล" (ไม่ได้พาบอลหนีเร็ว)
// กันบอลค้างนิ่งใน midblock — ทำให้บอลกระเด้งออกเป็น loose ball / เปลี่ยนมือ
function resolveTackle(state, carrier) {
  if (carrier.role === 'GK') return false;
  const sim = state.sim;
  if (sim.tick % 3 !== 0) return false; // ตรวจเป็นจังหวะ ไม่ใช่ทุก tick
  // ยกเว้นตอนกำลัง carry/dribble (มี contest ของตัวเองอยู่แล้ว)
  const move = sim.carrierMove.get(carrier.id);
  if (move && (move.mode === 'carry' || move.mode === 'dribble')) return false;

  let tk = null, best = TACKLE_RADIUS;
  for (const o of state.players) {
    if (o.team === carrier.team || o.role === 'GK') continue;
    const d = distP(o, carrier);
    if (d < best) { best = d; tk = o; }
  }
  if (!tk) return false;

  const control = (carrier.decision * 0.4 + carrier.passing * 0.3 + carrier.stamina * 0.3) / 100;
  const chance = clamp(
    TACKLE_BASE_CHANCE + (tk.tackling / 100) * 0.06 + (tk.aggression / 100) * 0.02 - control * 0.05,
    0.01, 0.16
  );
  if (Math.random() >= chance) return false;

  const dx = carrier.x - tk.x, dy = carrier.y - tk.y;
  const mag = Math.hypot(dx, dy) || 1;
  const who = tk.team === 'home' ? 'Our' : 'Their';
  if (Math.random() < 0.55) {
    // เขี่ยหลุด — บอลกระเด้งออกจากจุดปะทะ
    makeLoose(state,
      (dx / mag) * rand(4, 8) + rand(-2, 2),
      (dy / mag) * rand(4, 8) + rand(-2, 2),
      rand(0, 2), 'loose');
    markLastTouch(state.ball, tk);
    markSecondBall(state, 'loose', tk.team);
    setBallFx(state, 'Tackle!');
    recordEvent(state, `${who} ${tk.role} pokes the ball loose with a tackle`);
  } else {
    giveBall(state, tk);
    recordEvent(state, `${who} ${tk.role} wins the ball with a tackle`);
    noteTurnover(state, tk.team);
  }
  return true;
}

// ตรวจฟาวล์เมื่อ defender จ่อผู้ถือบอล — คืน true ถ้าเกิดฟาวล์ (เทิร์นถูกหยุด)
function checkFoul(state, carrier) {
  if (carrier.role === 'GK') return false;
  // ตรวจฟาวล์เป็นจังหวะ (ทุก ~1 วินาที) ไม่ใช่ทุก tick เพื่อไม่ให้ฟาวล์ถี่เกิน
  if (state.sim.tick % 10 !== 0) return false;
  let tackler = null, best = 1.5;
  for (const o of state.players) {
    if (o.team === carrier.team || o.role === 'GK') continue;
    const d = distP(o, carrier);
    if (d < best) { best = d; tackler = o; }
  }
  if (!tackler) return false;

  const pressure = computePressure(state, carrier);
  if (pressure < 0.7) return false; // ต้องมีการปะทะจริง ไม่ใช่ยืนเฉย
  if (Math.random() >= evaluateFoulRisk(state, tackler, carrier, pressure)) return false;

  // Advantage (simplified): ทีมบุกยังได้เปรียบใน final third พื้นที่โล่ง → ปล่อยเล่นต่อ
  const dir = attackDir(carrier.team);
  const progress = dir === 1 ? carrier.x : PITCH.length - carrier.x;
  if (progress > 72 && pressure < 1.2 && Math.random() < 0.5) {
    recordEvent(state, `Advantage played — ${carrier.team === 'home' ? 'we' : 'they'} keep going`);
    recordStructuredEvent(state, { type: 'ADVANTAGE', team: carrier.team });
    return false;
  }

  commitFoul(state, tackler, carrier);
  return true;
}

function commitFoul(state, tackler, carrier) {
  state.foulCount[tackler.team] = (state.foulCount[tackler.team] || 0) + 1;
  const who = tackler.team === 'home' ? 'our' : 'their';

  // card (MVP: yellow เท่านั้น ยังไม่ไล่ออก)
  const sev = foulSeverity(state, tackler, carrier);
  if (sev > YELLOW_CARD_THRESHOLD) {
    state.cards.yellow.push({ playerId: tackler.id, team: tackler.team, clock: Math.round(state.clock) });
    recordEvent(state, `Yellow card for ${who} ${tackler.role} (#${tackler.number})`);
    recordStructuredEvent(state, { type: 'YELLOW_CARD', team: tackler.team, playerId: tackler.id });
  }

  const inBox = isInPenaltyArea(carrier.x, carrier.y, tackler.team);
  if (inBox) {
    const dir = attackDir(carrier.team);
    const spot = { x: dir === 1 ? PITCH.length - PENALTY_SPOT_DISTANCE : PENALTY_SPOT_DISTANCE, y: 34 };
    recordEvent(state, `Foul in the box by ${who} ${tackler.role} — PENALTY!`);
    recordStructuredEvent(state, { type: 'FOUL', team: tackler.team, playerId: tackler.id });
    stopForRestart(state, makeRestart('penalty', carrier.team, spot, null, 'foul'), 'deadBall');
  } else {
    recordEvent(state, `Free kick — foul by ${who} ${tackler.role} (#${tackler.number})`);
    recordStructuredEvent(state, { type: 'FOUL', team: tackler.team, playerId: tackler.id });
    stopForRestart(state, makeRestart('freeKick', carrier.team, { x: carrier.x, y: carrier.y }, null, 'foul'), 'deadBall');
  }
}

// trail บอลสำหรับวาด (เก็บเฉพาะตอน sim, จำกัดความยาว)
function pushTrail(state, b) {
  if (!Array.isArray(b.trail)) b.trail = [];
  b.trail.push({ x: b.x, y: b.y, z: b.z || 0 });
  if (b.trail.length > 10) b.trail.shift();
}

// ป้าย FX ชั่วคราวบนสนาม (Deflect/Rebound/Parry/Loose ...)
function setBallFx(state, label) {
  if (!state.sim) return;
  state.sim.ballFx = { label, x: state.ball.x, y: state.ball.y, ttl: 16 };
}

// บอลในเที่ยวบินถูกแฉลบโดยผู้เล่น p → กลายเป็น loose ball ตามมุมสะท้อน
function deflectInFlightOff(state, p) {
  const b = state.ball;
  const d = dist(b.x, b.y, b.targetX, b.targetY) || 1;
  const vx = ((b.targetX - b.x) / d) * b.flightSpeed;
  const vy = ((b.targetY - b.y) / d) * b.flightSpeed;
  const r = reflectVelocity(vx, vy, b.x - p.x, b.y - p.y, DEFLECTION_NOISE);
  b.inFlight = false;
  makeLoose(state, r.x * 0.55, r.y * 0.55, rand(1.5, 4), 'deflected');
  b.lastTouchTeam = p.team;
  b.lastTouchPlayerId = p.id;
  b.spin = rand(-0.4, 0.4);
  markSecondBall(state, 'deflected', p.team);
  setBallFx(state, 'Deflect');
  recordEvent(state, `Ball deflected by ${p.team === 'home' ? 'our' : 'their'} ${p.role} (#${p.number})`);
  state.sim.pendingPass = null;
}

// ทำเครื่องหมายว่า loose ball นี้เป็นจังหวะ second-ball ที่ต้องแย่งกัน
function markSecondBall(state, mode, team) {
  if (!state.sim) return;
  state.sim.secondBall = { mode, team };
  state.sim.contestLogged = false;
}

// ---------- P2.7: Second ball / loose ball recovery ----------

// คุณภาพการสัมผัสบอลแรก (0..1) — บอลแรง/บอลเด้ง/โดนบีบ ทำให้จับยาก
// ลูกจ่ายง่ายในพื้นที่โล่งต้องรับได้เกือบแน่นอน → โทษเฉพาะบอลเร็ว/เด้ง/โดนบีบ
export function firstTouchQuality(p, ball, pressure = 0) {
  const speed = Math.hypot(ball.velocityX || 0, ball.velocityY || 0) || ball.flightSpeed || 0;
  const ballSpeedPenalty = clamp((speed - 18) / 45, 0, 0.28); // เริ่มลงโทษเมื่อบอลแรงกว่า pass ปกติ
  const pressurePenalty = clamp(pressure * 0.1, 0, 0.3);
  const bouncePenalty = clamp((ball.z || 0) / 4, 0, 0.2);
  const base = (firstTouchAttr(p) * (0.7 + 0.3 * p.stamina / 100)) / 100;
  return clamp(base - ballSpeedPenalty - pressurePenalty - bouncePenalty, 0, 1);
}

// คะแนนชิง second ball — ไม่ใช่แค่ใกล้สุดชนะ ต้องดูความเร็ว/ตำแหน่ง/โมเมนตัม/ความล้า
export function secondBallScore(state, p, ball) {
  const d = distP(p, ball);
  const distanceScore = clamp(1 - d / SECOND_BALL_RADIUS, 0, 1);
  const speedScore = (p.speed / 100) * 0.5 + (reactionAttr(p) / 100) * 0.5;
  const positioningScore = p.positioning / 100;
  const aggressionScore = p.aggression / 100;
  const fatiguePenalty = (1 - p.stamina / 100) * 0.35;

  // โมเมนตัม: กำลังหันหน้าเข้าหาบอลอยู่แล้วหรือไม่
  let momentum = 0;
  const mv = dist(p.x, p.y, p.targetX, p.targetY);
  if (mv > 0.5) {
    const toBallX = ball.x - p.x, toBallY = ball.y - p.y;
    const tb = Math.hypot(toBallX, toBallY) || 1;
    const dirX = (p.targetX - p.x) / mv, dirY = (p.targetY - p.y) / mv;
    momentum = clamp((dirX * toBallX + dirY * toBallY) / tb, -0.3, 1) * 0.4;
  }

  // pressure รอบตัว p (โดนประกบทำให้แย่งยาก)
  let pressurePenalty = 0;
  for (const o of state.players) {
    if (o.team === p.team) continue;
    const od = distP(o, p);
    if (od < 4) pressurePenalty += (1 - od / 4) * 0.15;
  }

  return distanceScore * 1.3 + speedScore * 0.35 + positioningScore * 0.3
    + aggressionScore * 0.15 + momentum - fatiguePenalty - pressurePenalty;
}

// บอล loose: ผู้เล่นที่เอื้อมถึง (อยู่ใกล้พอ + บอลไม่สูงเกิน) แย่งกัน คนชนะตามคะแนน
function resolveLooseRecovery(state) {
  const b = state.ball;
  const sim = state.sim;

  // log จังหวะ second-ball contest เมื่อมีคนจากทั้งสองทีมรุมเข้าจุดตกบอล
  if (sim && sim.secondBall && !sim.contestLogged) {
    const near = state.players.filter((p) => p.role !== 'GK' && distP(p, b) < 9);
    const teams = new Set(near.map((p) => p.team));
    if (near.length >= 3 && teams.size === 2) {
      sim.contestLogged = true;
      const box = b.x > PITCH.length - 22 || b.x < 22;
      recordEvent(state, box ? 'Second ball contest near the box' : 'Second ball contest in midfield');
      setBallFx(state, 'Loose Ball');
    }
  }

  // เอื้อมถึงเฉพาะบอลที่ไม่สูงเกินหัว
  if ((b.z || 0) > BALL_REACH_HEIGHT) return;

  const reach = PLAYER_TOUCH_RADIUS + b.radius;
  let contenders = state.players.filter((p) => distP(p, b) < reach);
  // safety net: บอลเกือบหยุดนิ่งแต่ไม่มีใครเอื้อมถึงพอดี (เช่นคร่อมกันอยู่)
  // → ให้คนใกล้สุดที่อยู่ในระยะ ~2.6m เก็บได้ กันบอลติดค้างตรงกลาง
  if (!contenders.length && Math.hypot(b.velocityX, b.velocityY) < 0.6) {
    let nearest = null, bd = 2.6;
    for (const p of state.players) {
      if (p.role === 'GK' && distP(p, b) > 1.71) continue;
      const d = distP(p, b);
      if (d < bd) { bd = d; nearest = p; }
    }
    if (nearest) contenders = [nearest];
  }
  if (!contenders.length) return;

  // เลือกผู้ชนะตามคะแนน second-ball (ใกล้สุดไม่ใช่ผู้ชนะเสมอ)
  let winner = contenders[0], bestScore = -Infinity;
  for (const p of contenders) {
    const s = secondBallScore(state, p, b) + (p.role === 'GK' ? 0.2 : 0);
    if (s > bestScore) { bestScore = s; winner = p; }
  }

  // บอลที่ยังพุ่งแรงอาจคุมไม่อยู่ในสัมผัสแรก (เว้นแต่จะอยู่จ่อมาก)
  const speed = Math.hypot(b.velocityX, b.velocityY);
  if (speed > 9 && distP(winner, b) > 0.9 && Math.random() > 0.5) return;

  const second = sim?.secondBall;
  giveBall(state, winner);
  sim?.justReceived.set(winner.id, sim.tick);

  if (second) {
    sim.secondBall = null;
    const who = winner.team === 'home' ? 'Our' : 'Their';
    if (second.mode === 'rebound' || second.mode === 'parried') {
      recordEvent(state, `${who} ${winner.role} reacts first to the loose ball`);
    } else {
      recordEvent(state, `${who} ${winner.role} wins the second ball`);
    }
    if (winner.team !== second.team) noteTurnover(state, winner.team);
  } else {
    recordEvent(state, `${winner.team === 'home' ? 'Our' : 'Their'} ${winner.role} recovered loose ball`);
  }
}

function resolvePassArrival(state) {
  const b = state.ball;

  // cross/early ball: ชิงลูกกลางอากาศ ไม่ใช่รับเรียบ
  if (state.sim.pendingPass?.cross) {
    resolveCrossArrival(state);
    return;
  }

  let nearest = null, best = Infinity;
  for (const p of state.players) {
    const d = distP(p, b);
    if (d < best) { best = d; nearest = p; }
  }
  if (nearest && best < 3.0) {
    const sameTeam = nearest.team === b.lastTouchTeam;
    labelPendingPass(state, sameTeam ? 1 : 0);
    if (sameTeam) {
      // P2.7: first touch — รับดี/กระฉอก/หลุดเป็น loose ตามคุณภาพการสัมผัส
      handleFirstTouch(state, nearest);
    } else {
      giveBall(state, nearest);
      state.sim?.justReceived.set(nearest.id, state.sim.tick);
      recordEvent(state, `Pass failed — won by their ${nearest.role}`);
      noteTurnover(state, nearest.team);
    }
  } else {
    labelPendingPass(state, 0);
    // บอลพลาดเป้า → loose ball ที่ยังไหลต่อ (ให้ทั้งสองทีมวิ่งแย่ง ไม่ใช่บอลตายนิ่ง)
    const pp = state.sim.pendingPass;
    const sx = pp?.startX ?? b.x, sy = pp?.startY ?? b.y;
    const dx = b.x - sx, dy = b.y - sy;
    const mag = Math.hypot(dx, dy) || 1;
    makeLoose(state, (dx / mag) * rand(3, 6), (dy / mag) * rand(3, 6), rand(0, 1.5), 'loose');
    markSecondBall(state, 'loose', b.lastTouchTeam);
    recordEvent(state, 'Pass failed — ball loose');
  }
  state.sim.pendingPass = null;
}

// P2.7: คุณภาพการรับบอลแรกสัมผัสของผู้รับฝ่ายเดียวกัน
function handleFirstTouch(state, receiver) {
  const b = state.ball;
  const pressure = computePressure(state, receiver);
  const q = firstTouchQuality(receiver, b, pressure);
  const role = receiver.role;

  if (q >= FIRST_TOUCH_CLEAN) {
    giveBall(state, receiver);
    state.sim.stats[receiver.team].passes++;
    updatePassMemory(state, receiver);
    state.sim.justReceived.set(receiver.id, state.sim.tick);
    recordEvent(state, `Pass completed → ${role} (#${receiver.number}, ${receiver.team === 'home' ? 'us' : 'them'})`);
  } else if (q >= FIRST_TOUCH_LOOSE) {
    // กระฉอก 1–3 เมตร: ผู้รับยังตามเก็บได้ แต่เสียจังหวะ
    state.sim.stats[receiver.team].passes++;
    updatePassMemory(state, receiver);
    const dir = attackDir(receiver.team);
    const ang = rand(-0.9, 0.9);
    const spill = rand(1.5, 3.5);
    b.x = clamp(receiver.x + dir * spill * Math.cos(ang), 0.5, PITCH.length - 0.5);
    b.y = clamp(receiver.y + spill * Math.sin(ang), 0.5, PITCH.width - 0.5);
    makeLoose(state, (b.x - receiver.x) * 1.3, (b.y - receiver.y) * 1.3, 0, 'loose');
    b.lastTouchTeam = receiver.team;
    b.lastTouchPlayerId = receiver.id;
    markSecondBall(state, 'loose', receiver.team);
    setBallFx(state, 'Heavy touch');
    recordEvent(state, `Heavy first touch by ${receiver.team === 'home' ? 'our' : 'their'} ${role} — ball loose`);
  } else {
    // จับบอลลั่น: บอลหลุดออกไกลขึ้น คู่แข่งใกล้สุดมีโอกาสแย่ง
    const ang = rand(0, Math.PI * 2);
    const spill = rand(3, 6);
    b.x = clamp(receiver.x + Math.cos(ang) * spill, 0.5, PITCH.length - 0.5);
    b.y = clamp(receiver.y + Math.sin(ang) * spill, 0.5, PITCH.width - 0.5);
    makeLoose(state, Math.cos(ang) * spill * 1.6, Math.sin(ang) * spill * 1.6, rand(0, 2), 'loose');
    b.lastTouchTeam = receiver.team;
    b.lastTouchPlayerId = receiver.id;
    markSecondBall(state, 'loose', receiver.team);
    setBallFx(state, 'Poor touch');
    recordEvent(state, `Poor first touch by ${receiver.team === 'home' ? 'our' : 'their'} ${role} — ball loose`);
  }
}

// เก็บตัวอย่างการจ่ายของทีมเราไว้ฝึก pass model (P5)
function labelPendingPass(state, label) {
  const pending = state.sim?.pendingPass;
  if (!pending?.features) return;
  const passer = getPlayer(state, pending.fromId);
  if (passer?.team === 'home') collectPassSample(state, pending.features, label);
}

function updatePassMemory(state, receiver) {
  const pending = state.sim.pendingPass;
  if (!pending) return;
  const mem = state.passMemory;
  const dir = attackDir(receiver.team);
  const progress = (state.ball.x - pending.startX) * dir;

  // ping-pong: จ่ายกลับคนที่เพิ่งจ่ายมาให้ทันที
  if (receiver.id === mem.lastPasserId && pending.fromId === mem.lastReceiverId && progress < 3) {
    recordEvent(state, 'Ping-pong passing — ball not progressing');
  }
  mem.recentPasses.push({
    fromId: pending.fromId,
    toId: receiver.id,
    turn: state.turn,
    progress: +progress.toFixed(1),
  });
  if (mem.recentPasses.length > PASS_MEMORY_SIZE) mem.recentPasses.shift();
  mem.lastPasserId = pending.fromId;
  mem.lastReceiverId = receiver.id;
}

function noteTurnover(state, gainingTeam) {
  const losing = gainingTeam === 'home' ? 'away' : 'home';
  const pushed = teamPlayers(state, losing).filter(
    (p) => attackDir(losing) === 1 ? p.x > 63 : p.x < 42
  ).length;
  if (pushed >= 4) recordEvent(state, `Counter risk: ${losing === 'home' ? 'we' : 'they'} lost ball with ${pushed} players high`);
}

// ---------- Ball Carrier Decision (P2) ----------

// ---------- P2.9: Set pieces (corner / free kick) ----------

// คนเตะตัดสินใจ: corner = เปิดเข้ากรอบลุ้นโหม่ง, free kick = ยิงถ้าได้ระยะ ไม่งั้นเปิด/จ่าย
function setPieceAction(state, taker) {
  const dir = attackDir(taker.team);
  const goal = goalAttackedBy(taker.team);
  const dGoal = distP(taker, goal);

  if (state.setPiece.type === 'freeKick') {
    const angle = goalOpenAngle(taker, taker.team);
    // ยิงตรงเมื่อได้ระยะและมุมพอยิงได้ (ระยะยิงฟรีคิกจริง ~28m)
    if (dGoal < 28 && angle > 0.1) {
      return { type: 'shoot', zone: dGoal < 20 ? 'good' : 'normal' };
    }
    // ไกล/มุมแคบ: ถ้าอยู่สูงพอเปิดเข้ากรอบ ไม่งั้นจ่ายขึ้นหน้า
    const cross = buildSetPieceCross(state, taker, 'freeKick');
    if (cross) return cross;
    const opts = passOptions(state, taker, 0);
    if (opts[0]) return { type: 'pass', option: opts[0] };
    return { type: 'hold' };
  }

  // corner: เปิดเข้ากรอบเสมอ
  const cross = buildSetPieceCross(state, taker, 'corner');
  if (cross) return cross;
  // เผื่อไม่มีตัวในกรอบ: โยนกลางกรอบไว้ก่อน
  return {
    type: 'cross', early: false, setPiece: 'corner',
    target: { x: clamp(goal.x - dir * 9, 6, PITCH.length - 6), y: 34 },
    mate: taker,
  };
}

// หาเป้าหมายในกรอบที่ดีที่สุด แล้วสร้าง action เปิดบอลโด่ง (ใช้ aerial duel เดิม)
function buildSetPieceCross(state, taker, type) {
  const dir = attackDir(taker.team);
  const goalX = dir === 1 ? PITCH.length : 0;
  const dangerSpot = { x: goalX - dir * 10, y: 34 }; // แถวจุดโทษ
  const opps = teamPlayers(state, taker.team === 'home' ? 'away' : 'home').filter((o) => o.role !== 'GK');
  const inBox = (p) => (dir === 1 ? p.x > PITCH.length - 18 : p.x < 18) && Math.abs(p.y - 34) < 18;
  const boxMates = teamPlayers(state, taker.team)
    .filter((m) => m.id !== taker.id && m.role !== 'GK' && inBox(m));
  if (!boxMates.length) return null;

  // เป้า = ตัวที่ marker ห่างสุด + อยู่โซนอันตราย + โหม่งดี (positioning/aggression)
  let best = null, bestScore = -Infinity;
  for (const m of boxMates) {
    let marker = Infinity;
    for (const o of opps) { const d = distP(o, m); if (d < marker) marker = d; }
    const danger = 1 - Math.min(distP(m, dangerSpot) / 16, 1);
    const aerial = (m.positioning + m.aggression) / 200;
    const score = marker * 0.5 + danger * 5 + aerial * 2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return {
    type: 'cross', early: false, setPiece: type,
    target: {
      x: clamp(best.x + dir * 1, 6, PITCH.length - 6),
      y: clamp(lerp(best.y, 34, 0.25), 22, 46),
    },
    mate: best,
  };
}

function logSetPiece(state, taker, type, action) {
  const us = taker.team === 'home' ? 'us' : 'them';
  if (type === 'corner') {
    recordEvent(state, `Corner whipped into the box (${us}, aiming at ${action.mate?.role ?? 'the area'})`);
  } else if (action.type === 'shoot') {
    recordEvent(state, `Direct free kick — shot on goal! (${us})`);
  } else if (action.type === 'cross') {
    recordEvent(state, `Free kick floated into the box (${us})`);
  } else {
    recordEvent(state, `Free kick played short (${us})`);
  }
}

function decideCarrier(state, carrier) {
  const sim = state.sim;

  // P2.9: ลูกตั้งเตะ — คนเตะต้องเปิด/ยิงเข้าเกม ไม่ใช่เลี้ยงเอง
  if (state.setPiece && carrier.id === state.setPiece.takerId) {
    const sp = state.setPiece;
    if (sim.tick < (sp.deliverTick ?? 4)) {
      // ตั้งท่าก่อนเตะ ให้เพื่อนในกรอบขยับเข้าที่ ตัวเตะยืนนิ่งคาบอล
      sim.carrierMove.set(carrier.id, { x: carrier.x, y: carrier.y, mode: 'hold' });
      return;
    }
    const action = setPieceAction(state, carrier);
    logSetPiece(state, carrier, sp.type, action);
    executeCarrierAction(state, carrier, action, 0);
    carrier.currentAction = action.type;
    sim.lastAction = { type: action.type, playerId: carrier.id };
    state.setPiece = null; // เตะแล้ว เล่นปกติต่อ (โหม่ง/เก็บตก/second ball)
    sim.cooldowns.set(carrier.id, 0.5);
    return;
  }

  const pressure = computePressure(state, carrier);

  // ถ้ากำลัง carry/dribble อยู่: ทำต่อจนถึงเป้า หรือโดนบีบหนักค่อยคิดใหม่
  const move = sim.carrierMove.get(carrier.id);
  if (move && move.mode !== 'hold') {
    const reached = dist(carrier.x, carrier.y, move.x, move.y) < 1.2;
    // anti-stuck: ถ้าพาบอลแต่แทบไม่ขยับ (โดน role-zone ดึงกลับ/ติดขอบ) หลายจังหวะ
    // ให้ล้ม carry แล้วตัดสินใจใหม่ (จ่าย/อื่นๆ) เพื่อไม่ให้บอลค้างอยู่กับที่
    const moved = dist(carrier.x, carrier.y, move._px ?? carrier.x, move._py ?? carrier.y);
    move._stuck = moved < 0.25 ? (move._stuck || 0) + 1 : 0;
    move._px = carrier.x; move._py = carrier.y;
    if (!reached && pressure < 1.6 && move._stuck < 6) return;
    const wasStuck = move._stuck >= 6;
    sim.carrierMove.delete(carrier.id);
    sim.cooldowns.set(carrier.id, 0); // ตัดสินใจทันที
    // พาบอลแล้วค้างอยู่กับที่ (โดนดึงกลับโซน/ติดขอบ) → บังคับรีไซเคิลบอลออกไป ไม่ให้บอลแช่
    if (wasStuck) { forceRecycle(state, carrier, pressure); return; }
  }

  const cd = sim.cooldowns.get(carrier.id) ?? rand(0.2, 0.6);
  const left = cd - TICK_DT;
  if (left > 0) {
    sim.cooldowns.set(carrier.id, left);
    return;
  }

  const action = evaluateBallCarrierAction(state, carrier, pressure);
  executeCarrierAction(state, carrier, action, pressure);
  carrier.currentAction = action.type;
  // นับ hold ติดกัน → เทิร์นถัดไปจะถูกลดน้ำหนัก ไม่ให้ยืนถือบอลค้างทั้งเทิร์น
  if (action.type === 'hold') sim.holdCount.set(carrier.id, (sim.holdCount.get(carrier.id) || 0) + 1);
  else sim.holdCount.delete(carrier.id);
  sim.lastAction = { type: action.type, playerId: carrier.id };
  sim.cooldowns.set(carrier.id, decisionDelay(carrier, pressure));
}

// บังคับเอาบอลออกจากเท้าเมื่อ carry ค้าง — จ่ายตัวที่ดีที่สุด ถ้าไม่มีก็เขี่ยไปข้างหน้า
function forceRecycle(state, carrier, pressure) {
  const opts = passOptions(state, carrier, pressure);
  if (opts.length) {
    executePass(state, carrier, opts[0], pressure);
    carrier.currentAction = 'pass';
    state.sim.lastAction = { type: 'pass', playerId: carrier.id };
  } else {
    const dir = attackDir(carrier.team);
    makeLoose(state, dir * rand(6, 12), rand(-5, 5), rand(0, 2), 'loose');
    markLastTouch(state.ball, carrier);
    markSecondBall(state, 'loose', carrier.team);
    carrier.currentAction = 'clear';
    state.sim.lastAction = { type: 'clear', playerId: carrier.id };
    recordEvent(state, `${carrier.team === 'home' ? 'Our' : 'Their'} ${carrier.role} knocks it forward to keep play moving`);
  }
  state.sim.cooldowns.set(carrier.id, decisionDelay(carrier, pressure));
}

export function evaluateBallCarrierAction(state, carrier, pressure) {
  const team = state.teams[carrier.team];
  const phase = state.teamPhases[carrier.team];
  const objective = state.teamObjectives[carrier.team];
  const dir = attackDir(carrier.team);
  const goal = goalAttackedBy(carrier.team);
  const dGoal = distP(carrier, goal);
  const inAttThird = dir === 1 ? carrier.x > 70 : carrier.x < 35;
  const acts = [];

  // fix: ครองบอลยืดเยื้อหลายเทิร์นโดยไม่คืบ → เร่งให้ "ลองของ" (carry/จ่ายหน้า) แทนการพักบอล
  // กันเกมติดวน DEFENDING/midBlock เพราะอีกฝ่ายเก็บบอลนิ่ง ๆ
  const streak = state.possessionStreak;
  const stale = (streak && streak.team === carrier.team) ? clamp(streak.turns - 2, 0, 5) : 0;

  // --- SHOOT (P2.6: finishing instinct + zone logic) ---
  const shot = evaluateShotAction(state, carrier, pressure);

  // --- PASS ---
  const opts = passOptions(state, carrier, pressure);

  // tap-in exception: เราอยู่โซนยิงแต่มีเพื่อนในกรอบที่ยิงง่ายกว่าชัดเจน → จ่ายดีกว่า
  let tapIn = null;
  if (inAttThird && shot) {
    for (const o of opts.slice(0, 4)) {
      const mateBox = dir === 1 ? o.mate.x > PITCH.length - 20 : o.mate.x < 20;
      if (!mateBox || Math.abs(o.mate.y - 34) > 14 || o.laneSafety < 0.5 || o.d > 18) continue;
      const mateXg = shotXgAt(state, o.mate, o.mate.x, o.mate.y, 0.5);
      if (mateXg > shot.xg + 0.12) {
        o.score += 0.28;
        o.tapIn = true;
        if (!tapIn || mateXg > tapIn.xg) tapIn = { option: o, xg: mateXg };
      }
    }
  }

  // cutback: อยู่ริมกรอบ/มุมยิงแคบ → หาตัวกลางกรอบหรือ zone 14 แทนการยิงมั่ว/ส่งคืนหลัง
  let cutbackChosenOverShot = false;
  if (inAttThird && shot && shot.angle < 0.18) {
    for (const o of opts.slice(0, 5)) {
      const central = Math.abs(o.mate.y - 34) < 11;
      const nearBox = dir === 1 ? o.mate.x > PITCH.length - 22 : o.mate.x < 22;
      if (central && nearBox && o.laneSafety > 0.35 && o.forward > -0.4) {
        o.score += 0.25;
        o.cutback = true;
        cutbackChosenOverShot = true;
      }
    }
    if (cutbackChosenOverShot) shot.score -= 0.25; // มุมแคบ อย่าฝืนยิง
  }

  if (shot) {
    if (tapIn) shot.score -= 0.15; // มีตัว tap-in โล่งกว่า
    acts.push(shot);
  }

  // sort options ใหม่หลังเพิ่ม bonus
  opts.sort((a, b) => b.score - a.score);
  if (opts[0]) {
    let s = opts[0].score + 0.1;
    if (objective === 'buildUp' || objective === 'holdPossession') s += 0.06;
    if (pressure > 1.2) s += 0.1; // โดนบีบ การจ่ายปลอดภัยน่าสนใจขึ้น
    // final third: ส่งคืนหลังโดยไม่มีเหตุผลเสียจังหวะจบสกอร์
    if (inAttThird && opts[0].forward < -0.1 && !opts[0].cutback && pressure < 1.2) s -= 0.12;
    acts.push({ type: 'pass', option: opts[0], score: s });
  }

  // --- SWITCH PLAY ---
  const sw = switchOption(state, carrier);
  if (sw) acts.push({ type: 'switch', option: sw, score: sw.switchScore });

  // --- CROSS / EARLY BALL (P2.7): เปิดบอลจากริมเส้นเข้ากรอบ ---
  const cross = evaluateCrossAction(state, carrier, pressure, shot);
  if (cross) acts.push(cross);

  // --- CARRY: พาบอลขึ้นหน้าเองเมื่อมีพื้นที่ ---
  const space = openSpaceAhead(state, carrier);
  if (pressure < 1.1 && space > CARRY_SPACE_THRESHOLD) {
    const ability = carryAbility(carrier);
    let s = 0.32 + clamp(space / 28, 0, 0.32) + ability * 0.22 - pressure * 0.2 + stale * 0.08;
    if (objective.startsWith('progress') || objective === 'counterAttack' || objective.startsWith('attackHalfSpace')) s += 0.12;
    if (objective === 'holdPossession') s -= 0.1;
    if (carrier.role === 'CB' && phase === 'BUILD_UP') s -= 0.08; // CB carry ได้แต่ระวัง
    if (carrier.role === 'GK') s = -1;
    const target = carryTarget(state, carrier, space);
    // P2.6: ใน final third ห้าม carry เพลินจนพลาดจังหวะยิง
    if (inAttThird) {
      s -= 0.06;
      const xgNow = shot?.xg ?? 0;
      const xgAfter = shotXgAt(state, carrier, target.x, target.y, pressure);
      if (xgAfter - xgNow < 0.02) s -= 0.12; // carry แล้วมุมยิงไม่ดีขึ้น = ไร้เหตุผล
    }
    if (shot?.zone === 'must') s -= 0.25;
    acts.push({ type: 'carry', score: s, target });
  }

  // --- DRIBBLE: เลี้ยงฝ่า 1v1 ---
  const closeOpps = state.players.filter((o) => o.team !== carrier.team && distP(o, carrier) < 6);
  if (closeOpps.length === 1 && pressure > 0.35 && pressure < DRIBBLE_PRESSURE_MAX
      && ['LW', 'RW', 'AM', 'ST', 'CM'].includes(carrier.role)) {
    const skill = (carrier.speed * 0.55 + carrier.decision * 0.45) / 100;
    acts.push({
      type: 'dribble',
      score: 0.24 + skill * 0.34 + (phase === 'FINAL_THIRD' ? 0.1 : 0) - pressure * 0.08,
      defender: closeOpps[0],
    });
  }

  // --- HOLD: พักบอลรอเพื่อนเติม ---
  const support = state.players.filter(
    (m) => m.team === carrier.team && m.id !== carrier.id && distP(m, carrier) < 14
  ).length;
  let holdScore = 0.2 + (support < 2 ? 0.12 : 0) - pressure * 0.16
    + (phase === 'TRANSITION_TO_ATTACK' && support < 2 ? 0.08 : 0);
  // P2.6: ใกล้ประตูไม่ใช่ที่พักบอล — โดนบีบในกรอบต้องยิงเร็วหรือจ่ายจังหวะเดียว
  if (inAttThird) holdScore -= 0.12;
  if (shot?.zone === 'must') holdScore -= 0.2;
  if (dGoal < 25 && pressure > 0.8) holdScore -= 0.15;
  holdScore -= stale * 0.12; // ครองนานเกินไป (ข้ามเทิร์น) อย่าพักบอลอีก
  // กันถือบอลค้างทั้งเทิร์น: ยิ่ง hold ติดกันยิ่งไม่น่าเลือก → บังคับให้รีไซเคิล/พาบอล
  holdScore -= (state.sim?.holdCount?.get(carrier.id) || 0) * 0.2;
  acts.push({ type: 'hold', score: holdScore });

  // --- CLEAR: เคลียร์เมื่อเสี่ยงหน้ากรอบตัวเอง ---
  const ownProgress = dir === 1 ? carrier.x : PITCH.length - carrier.x;
  if (ownProgress < 32 && pressure > 1.3 && (!opts[0] || opts[0].score < 0.32)) {
    acts.push({ type: 'clear', score: 0.65 + pressure * 0.12 });
  }

  acts.sort((a, b) => b.score - a.score);
  const best = acts[0];

  // P2.6: ตรวจ "ควรยิงแต่ไม่ยิง" — เลือก carry/hold/dribble ทั้งที่อยู่ must-shoot zone
  if (shot?.zone === 'must' && ['carry', 'hold', 'dribble'].includes(best.type) && !tapIn) {
    recordEvent(state, `Must-shoot chance ignored — ${carrier.team === 'home' ? 'our' : 'their'} ${carrier.role} chose ${best.type}`);
    if (state.sim) state.sim.stats[carrier.team].missedShots++;
  }
  return best;
}

// ---------- P2.6: Finishing decision ----------

// มุมเปิดของประตูจากตำแหน่งผู้ยิง (radians ระหว่างเสาสองข้าง)
function goalOpenAngle(p, team) {
  const gx = team === 'home' ? PITCH.length : 0;
  const a1 = Math.atan2(34 - 3.66 - p.y, gx - p.x);
  const a2 = Math.atan2(34 + 3.66 - p.y, gx - p.x);
  let diff = Math.abs(a2 - a1);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

// จำนวนผู้เล่นฝ่ายรับที่ขวางเส้นยิง (block risk)
function countBlockers(state, p, team) {
  const gx = team === 'home' ? PITCH.length : 0;
  let n = 0;
  for (const o of state.players) {
    if (o.team === team || o.role === 'GK') continue;
    if (pointSegDist(o.x, o.y, p.x, p.y, gx, 34) < 1.3) n++;
  }
  return n;
}

// xG เชิงตัดสินใจ ณ ตำแหน่งสมมติ (ใช้เทียบว่า carry แล้วมุมยิงดีขึ้นไหม)
function shotXgAt(state, carrier, x, y, pressure) {
  const fake = { x, y, team: carrier.team, shooting: carrier.shooting };
  const angle = goalOpenAngle(fake, carrier.team);
  const gx = carrier.team === 'home' ? PITCH.length : 0;
  const d = Math.hypot(gx - x, 34 - y);
  if (d > 32) return 0;
  return clamp(
    clamp(angle / 0.55, 0, 1) * (1 - d / 36) * (0.5 + carrier.shooting / 180) / (1 + pressure * 0.5),
    0, 0.9
  );
}

// ประเมิน action ยิง: คืน { type:'shoot', score, zone, xg, angle, dGoal } หรือ null
export function evaluateShotAction(state, carrier, pressure) {
  if (carrier.role === 'GK') return null;
  const goal = goalAttackedBy(carrier.team);
  const dGoal = distP(carrier, goal);
  if (dGoal > 30) return null; // ไกลเกิน ไม่พิจารณาเลย (ห้ามยิงมั่ว)

  const angle = goalOpenAngle(carrier, carrier.team);
  const blockers = countBlockers(state, carrier, carrier.team);
  const xg = shotXgAt(state, carrier, carrier.x, carrier.y, pressure);

  // first-time opportunity: เพิ่งได้บอลในจังหวะเดียว ยิงเลยได้เปรียบ
  const recvTick = state.sim?.justReceived.get(carrier.id);
  const firstTime = recvTick != null && state.sim.tick - recvTick <= 6;

  // โซนการยิง — ใกล้ประตูแล้ว pressure ไม่ใช่เหตุผลที่จะไม่ยิง (ยิงเร็วแทน)
  let zone = 'normal';
  if (dGoal < 16 && angle > 0.24 && blockers <= 2) zone = 'must';
  else if (dGoal < 22 && angle > 0.15) zone = 'good';
  else if (dGoal > 27 || angle < 0.09 || blockers >= 4) zone = 'bad';

  let score;
  switch (zone) {
    case 'must':
      // shot urgency: ในกรอบมุมเปิด ต้องชนะ pass/carry/hold เกือบทุกกรณี
      score = 0.95 + xg * 0.4 - blockers * 0.07 - clamp(pressure - 2, 0, 1) * 0.1;
      break;
    case 'good':
      score = 0.62 + xg * 0.6 - blockers * 0.06 - clamp(pressure - 1.8, 0, 1) * 0.08;
      break;
    case 'bad':
      score = 0.05;
      break;
    default:
      score = 0.42 + xg * 0.55 - blockers * 0.05 - clamp(pressure - 1.2, 0, 1) * 0.08;
  }
  if (firstTime && zone !== 'bad') score += 0.08;
  if (state.teamPhases[carrier.team] === 'FINAL_THIRD' && zone !== 'bad') score += 0.06;

  return { type: 'shoot', score, zone, xg, angle, dGoal, blockers };
}

// ---------- P2.7: Cross / Early ball ----------
// cross = เปิดจากริมเส้นโซนสุดท้ายเข้ากรอบ, early ball = โยนจากลึกกว่า
// ข้ามแนวรับให้ runner ก่อนเกมรับตั้งหลักทัน

export function evaluateCrossAction(state, carrier, pressure, shot) {
  if (carrier.role === 'GK') return null;
  const dir = attackDir(carrier.team);
  const wide = Math.abs(carrier.y - 34) > 14;
  if (!wide) return null;
  const progress = dir === 1 ? carrier.x : PITCH.length - carrier.x;
  if (progress < 58) return null; // ลึกเกินกว่าจะเปิด

  const early = progress < 80; // เปิดจากลึก = early ball
  const goalX = dir === 1 ? PITCH.length : 0;
  const mates = teamPlayers(state, carrier.team)
    .filter((m) => m.id !== carrier.id && m.role !== 'GK');
  const opps = teamPlayers(state, carrier.team === 'home' ? 'away' : 'home')
    .filter((o) => o.role !== 'GK');

  // ตัวรอในกรอบ (สำหรับ cross ปกติ)
  const inBoxZone = (p) => (dir === 1 ? p.x > PITCH.length - 22 : p.x < 22) && Math.abs(p.y - 34) < 16;
  const boxMates = mates.filter(inBoxZone);
  const boxDefs = opps.filter(inBoxZone);

  // runner สำหรับ early ball: กำลังวิ่งเข้า space และอยู่หน้ากว่าบอล
  const runner = mates.find(
    (m) => m.runType === 'runIntoSpace' && m.runTarget && (m.x - carrier.x) * dir > -2
  );

  let target = null;
  let aimMate = null;

  if (early) {
    if (!runner) return null;
    // โยนข้ามแนวรับ: จุดตกระหว่าง runTarget กับหน้าประตู
    const defs = opps.filter((o) => ['CB', 'LB', 'RB'].includes(o.role));
    const lineX = defs.length
      ? (dir === 1 ? Math.max(...defs.map((o) => o.x)) : Math.min(...defs.map((o) => o.x)))
      : goalX - dir * 20;
    target = {
      x: clamp(lineX + dir * 5, dir === 1 ? carrier.x + 8 : 6, dir === 1 ? PITCH.length - 6 : carrier.x - 8),
      y: clamp(runner.runTarget.y, 20, 48),
    };
    aimMate = runner;
  } else {
    if (!boxMates.length) return null;
    // เป้าที่ marker ห่างที่สุด
    let bestSpace = -1;
    for (const m of boxMates) {
      let marker = Infinity;
      for (const o of opps) {
        const d = distP(o, m);
        if (d < marker) marker = d;
      }
      if (marker > bestSpace) { bestSpace = marker; aimMate = m; }
    }
    // นำบอลเข้าโซนอันตรายหน้าประตูเล็กน้อย
    target = {
      x: clamp(aimMate.x + dir * 2, 6, PITCH.length - 6),
      y: clamp(lerp(aimMate.y, 34, 0.3), 22, 46),
    };
  }

  let markerDist = Infinity;
  for (const o of opps) {
    const d = distP(o, aimMate);
    if (d < markerDist) markerDist = d;
  }

  let score = 0.26
    + clamp(markerDist / 12, 0, 0.18)
    + Math.min(boxMates.length, 3) * 0.05
    - Math.max(0, boxDefs.length - boxMates.length) * 0.05
    + (carrier.passing / 100) * 0.15
    - pressure * 0.08;

  if (early) score += state.teamPhases[carrier.team] === 'TRANSITION_TO_ATTACK' ? 0.14 : 0.06;
  if (shot && shot.angle < 0.18) score += 0.08;            // มุมยิงแคบ → เปิดดีกว่าฝืนยิง
  if (state.teams[carrier.team].attackingWidth >= 4) score += 0.05; // ทีมเน้น wing play
  // กลางกรอบแน่นเกิน เปิดเข้าไปก็โดนเคลียร์
  if (boxDefs.length >= 5 && boxMates.length <= 1) score -= 0.12;

  return { type: 'cross', score: clamp(score, 0, 1.2), target, early, mate: aimMate };
}

function executeCross(state, carrier, action) {
  const sim = state.sim;
  sim.pendingPass = { fromId: carrier.id, startX: state.ball.x, startY: state.ball.y, features: null, cross: true };
  // บอลโด่ง: ความแม่นต่ำกว่าบอลเรียบ และ early ball ยิ่งเสี่ยง
  const errMag = (1 - carrier.passing / 140) * rand(1, 5) + (action.early ? 1 : 0);
  const ang = rand(0, Math.PI * 2);
  startPass(state, carrier,
    action.target.x + Math.cos(ang) * errMag,
    action.target.y + Math.sin(ang) * errMag);
  state.ball.ownerPlayerId = null;
  state.possessionTeam = carrier.team;
  sim.stats[carrier.team].crosses++;
  if (action.setPiece) return; // ลูกตั้งเตะ log แยกแล้วใน logSetPiece
  const side = carrier.y < 34 ? 'left' : 'right';
  recordEvent(state, action.early
    ? `Early ball in behind from the ${side} (${carrier.team === 'home' ? 'us' : 'them'}, looking for ${action.mate.role})`
    : `Cross into the box from the ${side} (${carrier.team === 'home' ? 'us' : 'them'}, aiming at ${action.mate.role})`);
}

// ชิงบอลโด่งในกรอบเมื่อ cross ตกถึงพื้นที่
function resolveCrossArrival(state) {
  const b = state.ball;
  const contenders = state.players.filter((p) => p.role !== 'GK' && distP(p, b) < 4.2);

  if (!contenders.length) {
    b.isLoose = true;
    recordEvent(state, 'Cross sails through — ball loose');
    state.sim.pendingPass = null;
    return;
  }

  let winner = null, bestW = -1;
  for (const c of contenders) {
    const atk = c.team === b.lastTouchTeam;
    const w = c.positioning / 100
      + c.aggression / 250
      + (atk ? 0.08 : 0.12) // ฝ่ายรับได้เปรียบลูกกลางอากาศเล็กน้อย
      + rand(0, 0.45)
      - distP(c, b) * 0.05;
    if (w > bestW) { bestW = w; winner = c; }
  }

  giveBall(state, winner);
  state.sim.justReceived.set(winner.id, state.sim.tick);
  if (winner.team === b.lastTouchTeam) {
    recordEvent(state, `${winner.team === 'home' ? 'Our' : 'Their'} ${winner.role} meets the cross in the box!`);
    state.sim.cooldowns.set(winner.id, 0.05); // จังหวะเดียว: ยิง/เฮดทันที
  } else {
    recordEvent(state, `Cross cleared — ${winner.team === 'home' ? 'our' : 'their'} ${winner.role} wins the aerial duel`);
    noteTurnover(state, winner.team);
  }
  state.sim.pendingPass = null;
}

function carryAbility(p) {
  const byRole = { CM: 0.9, AM: 1, LW: 1, RW: 1, ST: 0.8, LB: 0.85, RB: 0.85, DM: 0.75, CB: 0.5, GK: 0 };
  return ((p.speed + p.decision) / 200) * (byRole[p.role] ?? 0.7);
}

// ระยะพื้นที่ว่างใน cone ด้านหน้า (เมตร)
function openSpaceAhead(state, carrier) {
  const dir = attackDir(carrier.team);
  let nearest = 30;
  for (const o of state.players) {
    if (o.team === carrier.team || o.role === 'GK') continue;
    const dx = (o.x - carrier.x) * dir;
    const dy = Math.abs(o.y - carrier.y);
    if (dx > 0 && dy < dx * 0.9 + 3) { // อยู่ใน cone หน้า
      const d = distP(o, carrier);
      if (d < nearest) nearest = d;
    }
  }
  return nearest;
}

function carryTarget(state, carrier, space) {
  const dir = attackDir(carrier.team);
  const objective = state.teamObjectives[carrier.team];
  const run = Math.min(space - 2, 10);
  let ty = carrier.y;
  if (objective === 'progressLeft' || objective === 'attackHalfSpaceLeft') ty -= 4;
  if (objective === 'progressRight' || objective === 'attackHalfSpaceRight') ty += 4;
  // เลือกทิศที่เพิ่มมูลค่าตำแหน่ง (EPV) มากที่สุดจาก 3 ตัวเลือก: ตรง/เฉียงใน/เฉียงออก
  const cands = [ty, carrier.y + 5, carrier.y - 5].map((y) => ({
    x: clamp(carrier.x + dir * run, 1, PITCH.length - 1),
    y: clamp(y, 1, PITCH.width - 1),
  }));
  cands.sort((a, b) =>
    epvValue(b.x, b.y, carrier.team) - epvValue(a.x, a.y, carrier.team));
  return cands[0];
}

function switchOption(state, carrier) {
  const b = state.ball;
  const crowd = zoneCrowd(state, carrier.team === 'home' ? 'away' : 'home', carrier.x, carrier.y)
    + zoneCrowd(state, carrier.team, carrier.x, carrier.y);
  if (crowd < 4) return null; // ฝั่งนี้ยังไม่แน่นพอจะเปลี่ยนแกน

  const farMate = teamPlayers(state, carrier.team)
    .filter((m) => ['LW', 'RW', 'LB', 'RB'].includes(m.role) && Math.abs(m.y - b.y) > 26)
    .sort((a, c) => Math.abs(c.y - b.y) - Math.abs(a.y - b.y))[0];
  if (!farMate) return null;

  let markerDist = Infinity;
  for (const o of state.players) {
    if (o.team === carrier.team) continue;
    const d = distP(o, farMate);
    if (d < markerDist) markerDist = d;
  }
  if (markerDist < 6) return null;

  return {
    mate: farMate,
    switchScore: 0.34 + clamp(markerDist / 30, 0, 0.2) + (carrier.passing / 100) * 0.18
      + (state.teamObjectives[carrier.team] === 'switchPlay' ? 0.15 : 0),
  };
}

function executeCarrierAction(state, carrier, action, pressure) {
  const sim = state.sim;
  switch (action.type) {
    case 'pass':
      executePass(state, carrier, action.option, pressure);
      break;
    case 'switch': {
      const mate = action.option.mate;
      sim.pendingPass = { fromId: carrier.id, startX: state.ball.x };
      const errMag = (1 - carrier.passing / 120) * rand(1, 6);
      const ang = rand(0, Math.PI * 2);
      startPass(state, carrier, mate.x + Math.cos(ang) * errMag, mate.y + Math.sin(ang) * errMag);
      state.ball.ownerPlayerId = null;
      state.possessionTeam = carrier.team;
      recordEvent(state, `Switch play → ${mate.role} on the ${mate.y < 34 ? 'left' : 'right'} (${carrier.team === 'home' ? 'us' : 'them'})`);
      break;
    }
    case 'cross':
      executeCross(state, carrier, action);
      break;
    case 'carry':
      sim.carrierMove.set(carrier.id, { ...action.target, mode: 'carry' });
      sim.stats[carrier.team].carries++;
      if (carrier.team === 'home' && !sim.carryEventLogged) {
        sim.carryEventLogged = true;
        recordEvent(state, `Our ${carrier.role} (#${carrier.number}) carried ball forward into space`);
      }
      break;
    case 'dribble': {
      const def = action.defender;
      const dir = attackDir(carrier.team);
      sim.carrierMove.set(carrier.id, {
        x: clamp(def.x + dir * 5, 1, PITCH.length - 1),
        y: clamp(def.y + (carrier.y >= def.y ? 3 : -3), 1, PITCH.width - 1),
        mode: 'dribble',
        defenderId: def.id,
        resolved: false,
      });
      sim.stats[carrier.team].dribbles++;
      break;
    }
    case 'hold':
      sim.carrierMove.set(carrier.id, { x: carrier.x, y: carrier.y, mode: 'hold' });
      break;
    case 'shoot':
      attemptShot(state, carrier, distP(carrier, goalAttackedBy(carrier.team)), pressure, action.zone);
      break;
    case 'clear': {
      const dir = attackDir(carrier.team);
      const cx = carrier.x + dir * rand(18, 30);
      // เคลียร์กว้าง: บางลูกหลุดออกเส้นข้าง = throw-in (จงใจไม่ clamp ในสนาม)
      const cy = carrier.y + rand(-24, 24);
      // P2.7: เคลียร์ = บอลโด่งกระเด็น (มี z) ไม่ใช่ teleport เป็น loose
      makeLoose(state, (cx - carrier.x) * 0.7, (cy - carrier.y) * 0.7, rand(4, 7), 'loose');
      state.ball.lastTouchTeam = carrier.team;
      state.ball.lastTouchPlayerId = carrier.id;
      markSecondBall(state, 'loose', carrier.team);
      // ริคโคเชต: มีตัวคู่แข่งจ่อหน้า → บอลแฉลบไม่ขาด
      const blocker = state.players.find(
        (o) => o.team !== carrier.team && o.role !== 'GK'
          && distP(o, carrier) < 2.5 && (o.x - carrier.x) * dir > -0.5
      );
      if (blocker && Math.random() < 0.45) {
        const r = reflectVelocity(state.ball.velocityX, state.ball.velocityY,
          state.ball.x - blocker.x, state.ball.y - blocker.y, DEFLECTION_NOISE);
        makeLoose(state, r.x, r.y, rand(2, 5), 'deflected');
        state.ball.lastTouchTeam = blocker.team;
        state.ball.lastTouchPlayerId = blocker.id;
        markSecondBall(state, 'deflected', blocker.team);
        setBallFx(state, 'Ricochet');
        recordEvent(state, `Clearance ricocheted off ${blocker.team === 'home' ? 'our' : 'their'} ${blocker.role}`);
      } else {
        recordEvent(state, `${carrier.team === 'home' ? 'Our' : 'Their'} ${carrier.role} cleared under pressure`);
      }
      break;
    }
  }
}

function decisionDelay(p, pressure) {
  const base = 1.5 - (p.decision / 100) * 0.6;
  return Math.max(0.35, base / (1 + pressure * 0.7));
}

function computePressure(state, p) {
  let total = 0;
  for (const o of state.players) {
    if (o.team === p.team) continue;
    const d = distP(o, p);
    if (d < 7) total += Math.max(0, 1 - d / 7);
  }
  if (total > 0.6 && state.sim) {
    state.sim.pressEvents++;
    if (state.sim.pressEvents === 6) {
      recordEvent(state, `Heavy pressure on ${p.team === 'home' ? 'our' : 'their'} ball carrier`);
    }
  }
  return total;
}

// ---------- Passing options (P2: progression + memory + congestion + runner) ----------

export function passOptions(state, owner, pressure = 0) {
  const dir = attackDir(owner.team);
  const opps = state.players.filter((o) => o.team !== owner.team);
  const team = state.teams[owner.team];
  const objective = state.teamObjectives?.[owner.team] ?? 'progressThroughMiddle';
  const mem = state.passMemory;
  const options = [];

  for (const mate of state.players) {
    if (mate.team !== owner.team || mate.id === owner.id) continue;
    const d = distP(owner, mate);
    if (d < 4 || d > 40) continue;
    if (d > 26 && owner.vision < 60) continue;

    // ถ้าผู้รับกำลังวิ่งเข้า space ให้เล็งไปหน้า run (through pass)
    // แต่นำหน้าไม่เกิน 6 เมตร ไม่งั้นบอลไปถึงก่อนคนวิ่ง
    const runner = mate.runType === 'runIntoSpace' && mate.runTarget;
    let aimX = mate.x, aimY = mate.y;
    if (runner) {
      const rdx = mate.runTarget.x - mate.x;
      const rdy = mate.runTarget.y - mate.y;
      const rd = Math.hypot(rdx, rdy) || 1;
      const k = Math.min(1, 6 / rd);
      aimX = mate.x + rdx * k;
      aimY = mate.y + rdy * k;
    }

    let laneMin = Infinity;
    for (const o of opps) {
      const ld = pointSegDist(o.x, o.y, owner.x, owner.y, aimX, aimY);
      if (ld < laneMin) laneMin = ld;
    }
    const laneSafety = clamp((laneMin - 0.8) / 5, 0, 1);

    let recvSpace = Infinity;
    for (const o of opps) {
      const od = distP(o, mate);
      if (od < recvSpace) recvSpace = od;
    }
    const space = clamp(recvSpace / 9, 0, 1);

    const forward = clamp(((aimX - owner.x) * dir) / 28, -1, 1);

    const ideal = team.passingStyle === 'short' ? 12 : team.passingStyle === 'direct' ? 24 : 17;
    const distFit = clamp(1 - Math.abs(d - ideal) / 26, 0, 1);

    // EPV: การจ่ายที่ดีคือจ่ายไปยังตำแหน่งที่ "มีมูลค่า" มากขึ้น ไม่ใช่แค่ไปข้างหน้า
    const valueGain = epvGain(owner.x, owner.y, aimX, aimY, owner.team);

    // feature vector สำหรับเก็บ sample / โมเดลที่ฝึกจากเกมจริง (ทุกตัว ~0..1)
    const features = [
      laneSafety,
      space,
      (forward + 1) / 2,
      distFit,
      clamp(valueGain * 2 + 0.5, 0, 1),
      clamp(d / 40, 0, 1),
      clamp(pressure / 3, 0, 1),
    ];

    let score =
      laneSafety * 0.4 +
      space * 0.2 +
      forward * 0.12 * (1 + (team.riskLevel - 3) * 0.12) +
      distFit * 0.14 +
      clamp(valueGain * 1.4, -0.12, 0.28);

    // ถ้าผู้เล่นฝึกโมเดลจาก dataset แล้ว ใช้ความเห็นโมเดลถ่วงเพิ่ม
    if (state.passModel) {
      score += (predictPass(state.passModel, features) - 0.5) * 0.25;
    }

    // objective fit: จ่ายไปฝั่ง/พื้นที่ที่ทีมต้องการ
    if (objective === 'progressLeft' && mate.y < owner.y - 3) score += 0.08;
    if (objective === 'progressRight' && mate.y > owner.y + 3) score += 0.08;
    if (objective === 'progressThroughMiddle' && Math.abs(mate.y - 34) < 14 && forward > 0.2) score += 0.08;
    if (objective === 'attackHalfSpaceLeft' && mate.y > 14 && mate.y < 28 && forward > 0) score += 0.1;
    if (objective === 'attackHalfSpaceRight' && mate.y > 40 && mate.y < 54 && forward > 0) score += 0.1;
    if (objective === 'counterAttack' && forward > 0.4) score += 0.12;

    // through pass ให้ runner ที่ lane เปิด
    if (runner && forward > 0.2 && laneSafety > 0.5) score += 0.13;

    // โทษโซนปลายทางแออัด
    if (zoneCrowd(state, owner.team, aimX, aimY) >= CONGESTION_LIMIT) score -= 0.12;

    // pass memory: กัน ping-pong และส่งถอยไร้เหตุผล
    if (mem && mate.id === mem.lastPasserId && owner.id === mem.lastReceiverId) score -= 0.2;
    if (forward < -0.2 && objective !== 'buildUp' && objective !== 'holdPossession' && pressure < 1.2) score -= 0.08;

    options.push({ mate, score, d, laneSafety, forward, aimX, aimY, runner: !!runner, features });
  }

  options.sort((a, b) => b.score - a.score);
  return options;
}

function executePass(state, owner, option, pressure) {
  const errMag =
    (1 - owner.passing / 130) * (option.d / 22) * (1 + pressure * 0.6) * rand(0, 4.5);
  const ang = rand(0, Math.PI * 2);
  const lead = attackDir(owner.team) * clamp(option.d * 0.08, 0, 2.5);
  state.sim.pendingPass = { fromId: owner.id, startX: state.ball.x, features: option.features ?? null };
  startPass(state, owner,
    option.aimX + lead + Math.cos(ang) * errMag,
    option.aimY + Math.sin(ang) * errMag);
  state.ball.ownerPlayerId = null;
  state.possessionTeam = owner.team;
  if (option.cutback) {
    state.sim.stats[owner.team].cutbacks++;
    recordEvent(state, `Cutback chance created — ${owner.team === 'home' ? 'our' : 'their'} ${owner.role} pulls it back for ${option.mate.role}`);
    recordEvent(state, 'Bad angle: chose cutback instead of shot');
  } else if (option.tapIn) {
    recordEvent(state, `${owner.team === 'home' ? 'Our' : 'Their'} ${owner.role} squares it for an easier finish (${option.mate.role})`);
  } else if (option.runner) {
    recordEvent(state, `Through pass for ${option.mate.role} running into space (${owner.team === 'home' ? 'us' : 'them'})`);
  } else if (option.forward > 0.5 && option.laneSafety > 0.6) {
    recordEvent(state, `${owner.team === 'home' ? 'Our' : 'Their'} ${owner.role} found forward passing lane`);
  }
}

// ---------- P2.9: Finishing Engine ----------
// 6 ชั้น: context → xG → target → block → GK reach → outcome
// แกนกันสกอร์ล้น: โอกาสเข้าผูกกับ xG (คุณภาพโอกาส) ส่วน GK/block/placement กำหนด "รูปแบบผล"

function bumpMatch(state, team, key, n = 1) {
  const m = state.matchStats?.[team];
  if (m) m[key] = (m[key] || 0) + n;
}

// 1) Shot context
export function evaluateShotContext(state, shooter, pressure = 0, gk = null) {
  const goal = goalAttackedBy(shooter.team);
  const dGoal = distP(shooter, goal);
  const angle = goalOpenAngle(shooter, shooter.team);
  const blockers = countBlockers(state, shooter, shooter.team);
  const central = clamp(1 - Math.abs(shooter.y - 34) / 22, 0, 1);
  const keeper = gk || teamPlayers(state, shooter.team === 'home' ? 'away' : 'home').find((p) => p.role === 'GK');
  const keeperOffLine = keeper ? clamp(Math.abs(keeper.x - goal.x) - 1, 0, 10) : 0;
  // 1v1: ใกล้ประตู ไม่มีกองหลังขวาง
  const isOneOnOne = dGoal < 18 && blockers === 0 && central > 0.55;
  return {
    dGoal, angle, pressure, blockers, central,
    isTightAngle: angle < 0.18,
    isOneOnOne,
    keeperOutOfPosition: clamp(keeperOffLine / 8, 0, 1),
    zone: dGoal > 24 ? 'long' : dGoal > 17 ? 'edge' : angle < 0.18 ? 'tight' : dGoal < 12 && central > 0.5 ? 'big' : 'box',
  };
}

// 2) xG — สอบเทียบกับช่วงจริง (long 0.02-0.06, box 0.12-0.30, big 0.30-0.55, tight 0.04-0.16)
export function calculateXG(ctx, shooter) {
  const distanceScore = clamp(1 - ctx.dGoal / 28, 0, 1);
  const angleScore = clamp(ctx.angle / 0.7, 0, 1);
  const shooterQuality = shooter.shooting / 100;
  let xg = distanceScore * 0.28
    + angleScore * 0.22
    + ctx.central * 0.09
    + shooterQuality * 0.11
    + ctx.keeperOutOfPosition * 0.07
    + (ctx.isOneOnOne ? 0.08 : 0)
    - clamp(ctx.pressure * 0.05, 0, 0.18)
    - clamp(ctx.blockers * 0.045, 0, 0.18);
  if (ctx.dGoal > 24) xg = Math.min(xg, LONG_SHOT_MAX_XG);
  if (ctx.isTightAngle) xg = Math.min(xg, 0.16);
  return clamp(xg, SHOT_XG_MIN, SHOT_XG_MAX);
}

// 3) Shot target selection — เลือกโซนกรอบประตู + ความแม่น (กันยิงกลางประตูตลอด)
export function chooseShotTarget(ctx, shooter) {
  const aim = clamp(
    0.5 + shooter.shooting / 250
    - ctx.pressure * SHOT_PRESSURE_ERROR
    - (ctx.isTightAngle ? 0.12 : 0)
    - clamp((ctx.dGoal - 12) / 55, 0, 0.22)
    - SHOT_TARGET_ERROR_BASE * 0.5,
    0.2, 0.85
  );
  const cornered = clamp(aim * rand(0.5, 1.15), 0, 1); // วางมุมได้ดีแค่ไหน
  let zone;
  if (cornered > 0.62) zone = rand(0, 1) < 0.5 ? 'low corner' : 'top corner';
  else if (cornered > 0.36) zone = rand(0, 1) < 0.6 ? 'low corner' : 'near post';
  else zone = 'central';
  return { aim, cornered, zone };
}

// 4) Block check — กองหลังในเส้นยิง
function checkShotBlock(state, owner, goal) {
  let best = null;
  for (const o of state.players) {
    if (o.team === owner.team || o.role === 'GK') continue;
    if ((o.x - owner.x) * (goal.x - owner.x) <= 0) continue;
    const ld = pointSegDist(o.x, o.y, owner.x, owner.y, goal.x, 34);
    if (ld < 2.2 && (!best || ld < best.laneDist)) best = { def: o, laneDist: ld };
  }
  if (!best) return null;
  best.blockChance = clamp(
    0.4
    + (best.def.tackling / 100) * 0.2
    + (1 - best.laneDist / 2.2) * 0.3
    - (owner.shooting / 100) * 0.15,
    0.1, 0.85
  );
  return best;
}

// 5) GK save flavor (เมื่อรู้แล้วว่าไม่ใช่ goal และอยู่ในกรอบ) → held/parried/rebound
function resolveSaveFlavor(gk, owner, target) {
  if (!gk) return 'rebound';
  const holdChance = clamp(
    (gk.positioning / 100) * 0.45
    + (1 - target.cornered) * 0.4
    - (owner.shooting / 100) * 0.2,
    0.2, 0.75
  );
  if (Math.random() < holdChance) return 'held';
  // ยิงเข้ามุม → ปัดออกข้าง (corner) ; ยิงกลาง → กระฉอกหน้าเขต (rebound)
  return target.cornered > 0.45 ? 'parried' : 'rebound';
}

function attemptShot(state, owner, dGoal, pressure, zone = 'normal') {
  const sim = state.sim;
  const dir = attackDir(owner.team);
  const goal = goalAttackedBy(owner.team);
  const ours = owner.team === 'home';
  const who = ours ? 'Our' : 'Their';
  const defTeam = ours ? 'away' : 'home';
  const gk = teamPlayers(state, defTeam).find((p) => p.role === 'GK');

  // 1) context + 2) xG
  const ctx = evaluateShotContext(state, owner, pressure, gk);
  const xg = calculateXG(ctx, owner);
  markShotLastTouch(state.ball, owner);
  sim.stats[owner.team].shots++;
  sim.stats[owner.team].xg += xg;
  bumpMatch(state, owner.team, 'shots');
  bumpMatch(state, owner.team, 'xg', xg);
  const isBig = xg >= BIG_CHANCE_XG;
  if (isBig) bumpMatch(state, owner.team, 'bigChances');
  recordEvent(state, `Shot chance! ${who} ${owner.role} from ${Math.round(dGoal)}m (xG ${xg.toFixed(2)})${isBig ? ' [BIG CHANCE]' : ''}`);
  recordStructuredEvent(state, { type: 'SHOT', team: owner.team, xg: +xg.toFixed(2), zone: ctx.zone });

  const cornerSpot = { x: goal.x, y: owner.y < 34 ? 0 : PITCH.width };
  const cornerSide = owner.y < 34 ? 'top' : 'bottom';
  const bylineSide = dir === 1 ? 'right' : 'left';
  const target = chooseShotTarget(ctx, owner);

  // === GOAL ผูกกับ xG (คุมสกอร์ด้วยคุณภาพโอกาส ไม่ใช่โกลโกง) ===
  if (Math.random() < xg) {
    sim.stats[owner.team].shotsOnTarget++;
    bumpMatch(state, owner.team, 'shotsOnTarget');
    setBallFx(state, 'GOAL');
    recordEvent(state, `Shot — ${target.zone} — GOAL! (${who} ${owner.role})`);
    handleGoal(state, owner.team); // นับ matchStats.goals ภายใน
    return;
  }

  // === ไม่เข้า: ตัดสินว่าเพราะอะไร (block / post / save / wide) ===

  // 4) block
  const block = checkShotBlock(state, owner, goal);
  if (block && Math.random() < block.blockChance) {
    const defWho = block.def.team === 'home' ? 'our' : 'their';
    sim.stats[block.def.team].blocks++;
    bumpMatch(state, block.def.team, 'blocks');
    setBallFx(state, 'Blocked');
    if (Math.random() < 0.45) {
      recordEvent(state, `Shot blocked by ${defWho} ${block.def.role} — out for a corner`);
      createRestartEvent(state, 'corner', owner.team, cornerSpot, cornerSide);
    } else {
      const sp = clamp(18 + owner.shooting * 0.13, 18, 31);
      const r = reflectVelocity(dir * sp, 0, block.def.x - owner.x, block.def.y - owner.y, DEFLECTION_NOISE);
      createRebound(state, block.def.x, block.def.y, r.x * 0.5, r.y * 0.5, rand(1.5, 4));
      markLastTouch(state.ball, block.def);
      markSecondBall(state, 'rebound', block.def.team);
      recordEvent(state, `Shot blocked by ${defWho} ${block.def.role} — rebound loose`);
    }
    return;
  }

  // 2b) post/bar — ลูกคุณภาพดีที่พลาดขอบกรอบนิดเดียว
  const postChance = clamp(POST_CHANCE_MAX * (xg / 0.4), 0.01, POST_CHANCE_MAX);
  if (Math.random() < postChance) {
    const sp = clamp(18 + owner.shooting * 0.13, 18, 31);
    const px = clamp(goal.x - dir * 1.2, 1, PITCH.length - 1);
    const py = 34 + (owner.y < 34 ? -1 : 1) * 3.4;
    bumpMatch(state, owner.team, 'posts');
    sim.stats[owner.team].posts++;
    createRebound(state, px, py, -dir * sp * POST_REBOUND_POWER, rand(-4, 4), rand(1, 3));
    state.ball.spin = rand(-0.4, 0.4);
    markSecondBall(state, 'rebound', owner.team);
    setBallFx(state, 'Post!');
    recordEvent(state, 'Shot hits the post — rebound!');
    return;
  }

  // 5) on target (saved) vs off target (wide) — ความแม่นจาก target.aim
  if (!gk || Math.random() >= target.aim) {
    recordEvent(state, isBig ? `Big chance missed — ${who} ${owner.role} shoots wide` : `${who} ${owner.role} shoots wide`);
    createRestartEvent(state, 'goalKick', defTeam, backLineSpot(state, bylineSide, false), bylineSide);
    return;
  }

  // เข้ากรอบแต่ GK เซฟ — แยก held/parried(corner)/rebound(in box)
  sim.stats[owner.team].shotsOnTarget++;
  bumpMatch(state, owner.team, 'shotsOnTarget');
  bumpMatch(state, gk.team, 'saves');
  sim.stats[gk.team].saves++;
  const flavor = resolveSaveFlavor(gk, owner, target);
  setBallFx(state, 'Save');
  if (flavor === 'held') {
    recordEvent(state, `Shot ${target.zone} — saved, ${gk.team === 'home' ? 'our' : 'their'} keeper holds it`);
    giveBall(state, gk);
  } else if (flavor === 'parried') {
    recordEvent(state, `Great save! ${gk.team === 'home' ? 'Our' : 'Their'} GK tips the ${target.zone} effort over — corner`);
    createRestartEvent(state, 'corner', owner.team, cornerSpot, cornerSide);
  } else {
    const px = clamp(gk.x + dir * 1.5, 1, PITCH.length - 1);
    createRebound(state, px, gk.y, -dir * GK_PARRY_POWER * 0.6, rand(-4, 4), rand(1.5, 3.5));
    markLastTouch(state.ball, gk);
    markSecondBall(state, 'parried', gk.team);
    recordEvent(state, `${gk.team === 'home' ? 'Our' : 'Their'} GK can't hold it — rebound in the box!`);
  }
}

function restartAfterGoal(state, kickoffTeam) {
  for (const p of state.players) {
    p.x = p.baseX; p.y = p.baseY;
    p.targetX = p.baseX; p.targetY = p.baseY;
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
  }
  kickoff(state, kickoffTeam);
}

// ---------- การเคลื่อนที่ (steering + separation) ----------

function movePlayer(state, p, owner) {
  const desired = (owner && owner.id === p.id)
    ? carrierDesired(state, p)
    : offBallDesired(state, p, owner);

  // ดึงกลับ role zone ถ้าหลุดไกลและไม่มีคำสั่งจากโค้ช
  let dx = desired.x;
  let dy = desired.y;
  if (!p.commandLocked && p.role !== 'GK') {
    const maxZone = 16 + (movementRadius(p) / 45) * 26;
    const dHome = dist(dx, dy, p.baseX, p.baseY);
    if (dHome > maxZone) {
      const t = maxZone / dHome;
      dx = p.baseX + (dx - p.baseX) * t;
      dy = p.baseY + (dy - p.baseY) * t;
    }
  }

  // หลบโซนแออัด (เฉพาะคนไม่ได้ press/ถือบอล)
  if (!desired.pressing && (!owner || owner.id !== p.id)
      && zoneCrowd(state, p.team, dx, dy) >= CONGESTION_LIMIT + 1) {
    dy += dy > 34 ? -6 : 6;
  }

  // separation: ผลักออกจากเพื่อนที่ใกล้เกิน — ยกเว้นคนนำที่กำลังพุ่งเก็บ loose ball
  // (ไม่งั้น separation จะดันให้ห่างบอลจนเก็บไม่ได้ บอลติดค้างตรงกลาง)
  if (!desired.chaseLead) {
    const sep = separationVector(state, p, owner);
    dx += sep.x;
    dy += sep.y;
  }

  dx = clamp(dx, 0.3, PITCH.length - 0.3);
  dy = clamp(dy, 0.3, PITCH.width - 0.3);

  const d = dist(p.x, p.y, dx, dy);
  if (d < 0.4) {
    p.stamina = clamp(p.stamina + 0.012, 0, 100);
    return;
  }

  const sp = maxSpeed(p) * desired.urgency;
  const step = Math.min(sp * TICK_DT, d);
  p.x = clamp(p.x + ((dx - p.x) / d) * step, 0.3, PITCH.length - 0.3);
  p.y = clamp(p.y + ((dy - p.y) / d) * step, 0.3, PITCH.width - 0.3);

  const sprint = p.runType === 'runIntoSpace' || p.runType === 'overlap' ? 1.25 : 1;
  const drain = step * 0.05 * (desired.pressing ? 1.7 : sprint);
  p.stamina = clamp(p.stamina - drain, 0, 100);
  if (p.stamina < 25 && !p._staminaWarned) {
    p._staminaWarned = true;
    recordEvent(state, `Stamina warning: ${p.team === 'home' ? 'our' : 'their'} ${p.role} (#${p.number}) exhausted`);
  }

  // dribble contest เมื่อถึงตัวกองหลัง
  resolveDribbleContest(state, p);
}

function resolveDribbleContest(state, p) {
  const sim = state.sim;
  const move = sim.carrierMove.get(p.id);
  if (!move || move.mode !== 'dribble' || move.resolved) return;
  const def = getPlayer(state, move.defenderId);
  if (!def || distP(p, def) > 1.6) return;

  move.resolved = true;
  const skill = (p.speed * 0.55 + p.decision * 0.45) / 100;
  const defense = (def.tackling * 0.7 + def.positioning * 0.3) / 100;
  if (Math.random() < 0.35 + skill * 0.45 - defense * 0.25) {
    recordEvent(state, `${p.team === 'home' ? 'Our' : 'Their'} ${p.role} beat his marker on the dribble`);
  } else {
    // โดนเสียบในกรอบเขตโทษคู่แข่ง → มีโอกาสเป็นจุดโทษ (P5)
    const boxX = attackDir(p.team) === 1 ? p.x > PITCH.length - 16.5 : p.x < 16.5;
    const inBox = boxX && p.y > 34 - 20.15 && p.y < 34 + 20.15;
    if (inBox && Math.random() < 0.3 && awardPenalty(state, p.team, p.id)) {
      sim.carrierMove.delete(p.id);
      return;
    }
    makeLoose(state, (def.x - p.x) * 2, (def.y - p.y) * 2);
    state.ball.lastTouchTeam = p.team;
    sim.carrierMove.delete(p.id);
    recordEvent(state, `Dribble failed — ${p.team === 'home' ? 'our' : 'their'} ${p.role} dispossessed`);
  }
}

function separationVector(state, p, owner) {
  if (p.role === 'GK') return { x: 0, y: 0 };
  // ยกเว้น: กำลังรุม press ผู้ถือบอลฝ่ายตรงข้าม
  if (owner && owner.team !== p.team && distP(p, owner) < 8) return { x: 0, y: 0 };

  let sx = 0, sy = 0;
  for (const m of state.players) {
    if (m.team !== p.team || m.id === p.id || m.role === 'GK') continue;
    const d = distP(p, m);
    if (d < MIN_PLAYER_SPACING && d > 0.01) {
      const push = (1 - d / MIN_PLAYER_SPACING) * SEPARATION_FORCE * 6;
      sx += ((p.x - m.x) / d) * push;
      sy += ((p.y - m.y) / d) * push;
    }
  }
  return { x: clamp(sx, -5, 5), y: clamp(sy, -5, 5) };
}

function carrierDesired(state, p) {
  const move = state.sim.carrierMove.get(p.id);
  if (move && move.mode !== 'hold') {
    return { x: move.x, y: move.y, urgency: move.mode === 'dribble' ? 1 : 0.85, pressing: false };
  }
  if (move && move.mode === 'hold') {
    // shield: ขยับหนีคู่แข่งใกล้สุดเล็กน้อย
    let nearest = null, best = Infinity;
    for (const o of state.players) {
      if (o.team === p.team) continue;
      const d = distP(o, p);
      if (d < best) { best = d; nearest = o; }
    }
    if (nearest && best < 3) {
      return {
        x: clamp(p.x + (p.x - nearest.x) * 0.6, 1, PITCH.length - 1),
        y: clamp(p.y + (p.y - nearest.y) * 0.6, 1, PITCH.width - 1),
        urgency: 0.5, pressing: false,
      };
    }
    return { x: p.x, y: p.y, urgency: 0, pressing: false };
  }
  return { x: p.x, y: p.y, urgency: 0, pressing: false };
}

// ---------- Off-ball movement (P2) ----------

function offBallDesired(state, p, owner) {
  const b = state.ball;
  const phase = state.teamPhases[p.team];

  // GK
  if (p.role === 'GK') {
    const gx = p.team === 'home' ? 4 : PITCH.length - 4;
    const gy = clamp(34 + (b.y - 34) * 0.3, 26, 42);
    return { x: gx, y: gy, urgency: 0.7, pressing: false };
  }

  // บอลว่าง: 2 คนใกล้สุดของแต่ละทีมวิ่งเก็บ
  if (b.isLoose) {
    const mates = teamPlayers(state, p.team)
      .filter((m) => m.role !== 'GK')
      .sort((a, c) => distP(a, b) - distP(c, b));
    const idx = mates.indexOf(p);
    // คนใกล้สุดพุ่งเข้าบอลตรง ๆ และ "ไม่ติด separation" จะได้เก็บบอลได้จริง
    // (กัน bug บอลติดตรงกลางเพราะเพื่อนสองคนถูกดันให้ห่างกันคร่อมบอล)
    if (idx === 0) return { x: b.x, y: b.y, urgency: 1, pressing: true, chaseLead: true };
    // คนที่สองวิ่งประกบเฉียงเล็กน้อย (support) ไม่ชนคนแรก
    if (idx === 1) {
      const off = p.y < b.y ? -2.5 : 2.5;
      return { x: b.x, y: clamp(b.y + off, 0.5, PITCH.width - 0.5), urgency: 1, pressing: true };
    }
  }

  // บอลกำลังลอยมาหาทีมเรา: ผู้รับที่ใกล้จุดตกที่สุดวิ่งเข้าไปรับ
  if (b.inFlight && b.lastTouchTeam === p.team) {
    const mates = teamPlayers(state, p.team)
      .filter((m) => m.role !== 'GK')
      .sort((a, c) =>
        dist(a.x, a.y, b.targetX, b.targetY) - dist(c.x, c.y, b.targetX, b.targetY));
    if (mates[0] === p) return { x: b.targetX, y: b.targetY, urgency: 1, pressing: false };
  }

  const attacking = ['BUILD_UP', 'ATTACKING', 'FINAL_THIRD', 'TRANSITION_TO_ATTACK'].includes(phase);
  return attacking
    ? attackingOffBall(state, p, owner, phase)
    : defendingOffBall(state, p, owner, phase);
}

function attackingOffBall(state, p, owner, phase) {
  const b = state.ball;
  const dir = attackDir(p.team);
  const team = state.teams[p.team];
  const objective = state.teamObjectives[p.team];

  // เป้าหมายตาม role + phase
  const rt = roleAttackTarget(state, p, phase, objective);
  let ax = rt.x;
  let ay = rt.y;
  let urgency = rt.urgency ?? 0.8;

  // คำสั่งโค้ชสำคัญกว่า auto-behavior
  if (p.commandLocked) {
    ax = lerp(rt.x, p.targetX, 0.75);
    ay = lerp(rt.y, p.targetY, 0.75);
  } else {
    ax = lerp(p.targetX, rt.x, 0.75);
    ay = lerp(p.targetY, rt.y, 0.75);
  }

  // support: 2 คนใกล้บอลที่สุด (ไม่นับ runner) เข้าทำมุมรับบอล
  if (owner && owner.team === p.team && p.runType !== 'runIntoSpace') {
    const mates = teamPlayers(state, p.team)
      .filter((m) => m.id !== owner.id && m.role !== 'GK' && m.runType !== 'runIntoSpace')
      .sort((a, c) => distP(a, owner) - distP(c, owner));
    const idx = mates.indexOf(p);
    if (idx >= 0 && idx < 2 && distP(p, owner) > 13) {
      ax = owner.x + dir * (idx === 0 ? 7 : -6);
      ay = owner.y + (idx === 0 ? -10 : 10);
      urgency = 0.9;
      p.runType = 'support';
      p.runTarget = null;
    }
  }

  if (phase === 'TRANSITION_TO_ATTACK' && ['ST', 'LW', 'RW', 'AM'].includes(p.role)) {
    urgency = 1; // counter: ตัวรุก sprint
  }

  return {
    x: clamp(ax, 0.5, PITCH.length - 0.5),
    y: clamp(ay, 0.5, PITCH.width - 0.5),
    urgency,
    pressing: false,
  };
}

// เป้าหมายธรรมชาติของแต่ละ role ตอนทีมมีบอล
function roleAttackTarget(state, p, phase, objective) {
  const b = state.ball;
  const dir = attackDir(p.team);
  const team = state.teams[p.team];
  const ownGoalX = p.team === 'home' ? 0 : PITCH.length;
  const sideSign = p.baseY < 34 ? -1 : 1; // ซ้าย/ขวาของตัวเอง
  const sim = state.sim;

  const fromOwn = (m) => clamp(ownGoalX + dir * m, 2, PITCH.length - 2);

  switch (p.role) {
    case 'CB': {
      if (phase === 'BUILD_UP') return { x: fromOwn(14), y: 34 + sideSign * 13 };
      const push = phase === 'FINAL_THIRD' ? 38 + team.riskLevel * 2 : 30;
      return { x: fromOwn(push), y: 34 + sideSign * 10 };
    }
    case 'LB':
    case 'RB': {
      const wideY = p.role === 'LB' ? 7 : 61;
      if (phase === 'BUILD_UP') return { x: fromOwn(22), y: wideY };
      // overlap เมื่อ risk สูงและบอลอยู่ฝั่งตัวเอง
      const ballOnSide = (p.role === 'LB' && b.y < 30) || (p.role === 'RB' && b.y > 38);
      if (ballOnSide && team.riskLevel >= 4 && phase !== 'TRANSITION_TO_ATTACK') {
        if (sim && p.runType !== 'overlap') sim.stats[p.team].runs++;
        p.runType = 'overlap';
        p.runTarget = { x: clamp(b.x + dir * 9, 2, PITCH.length - 2), y: wideY };
        return { x: p.runTarget.x, y: wideY, urgency: 0.95 };
      }
      p.runType = null;
      return { x: clamp(b.x - dir * 7, fromOwn(16), fromOwn(60)), y: wideY };
    }
    case 'DM': {
      // อยู่หลังบอลเสมอ ปิด counter lane
      const behind = clamp(b.x - dir * 10, fromOwn(18), fromOwn(58));
      return { x: behind, y: 34 + (b.y - 34) * 0.3 };
    }
    case 'CM': {
      if (phase === 'FINAL_THIRD') {
        return { x: clamp(b.x - dir * 6, fromOwn(40), fromOwn(78)), y: 34 + sideSign * 11 };
      }
      let y = 34 + sideSign * 11;
      if (objective === 'progressLeft') y -= 5;
      if (objective === 'progressRight') y += 5;
      return { x: clamp(b.x + dir * 2, fromOwn(26), fromOwn(70)), y };
    }
    case 'AM': {
      if (phase === 'FINAL_THIRD') {
        // zone 14 หน้ากรอบเขตโทษ
        return { x: fromOwn(PITCH.length - 17), y: 34, urgency: 0.9 };
      }
      let y = 34;
      if (objective === 'attackHalfSpaceLeft') y = 23;
      if (objective === 'attackHalfSpaceRight') y = 45;
      return { x: clamp(b.x + dir * 9, fromOwn(40), fromOwn(82)), y };
    }
    case 'LW':
    case 'RW': {
      const isLeft = p.role === 'LW';
      let wideY = isLeft ? 6 : 62;
      // หุบเข้า half-space ตาม objective ฝั่งตัวเอง
      if ((isLeft && objective === 'attackHalfSpaceLeft') || (!isLeft && objective === 'attackHalfSpaceRight')) {
        wideY = isLeft ? 21 : 47;
      }
      const widthAdj = (team.attackingWidth - 3) * 2.5;
      wideY = isLeft ? clamp(wideY - widthAdj, 3, 30) : clamp(wideY + widthAdj, 38, 65);

      if (phase === 'FINAL_THIRD') {
        // ฝั่งไกลบอลวิ่งเสาไกล
        const farSide = (isLeft && b.y > 38) || (!isLeft && b.y < 30);
        if (farSide) {
          if (sim && p.runType !== 'runIntoSpace') sim.stats[p.team].runs++;
          p.runType = 'runIntoSpace';
          p.runTarget = { x: fromOwn(PITCH.length - 8), y: isLeft ? 27 : 41 };
          return { ...p.runTarget, urgency: 0.95 };
        }
      }
      // วิ่งหลังแบ็กเมื่อมีช่องและกำลังบุก
      if (phase === 'ATTACKING' || phase === 'TRANSITION_TO_ATTACK') {
        const oppFB = teamPlayers(state, p.team === 'home' ? 'away' : 'home')
          .find((o) => ['LB', 'RB'].includes(o.role) && Math.abs(o.y - wideY) < 14);
        if (oppFB && (oppFB.x - b.x) * dir > 6) {
          if (sim && p.runType !== 'runIntoSpace') sim.stats[p.team].runs++;
          p.runType = 'runIntoSpace';
          p.runTarget = { x: clamp(oppFB.x + dir * 7, 4, PITCH.length - 4), y: wideY };
          return { ...p.runTarget, urgency: 1 };
        }
      }
      p.runType = null;
      return { x: clamp(b.x + dir * 8, fromOwn(34), fromOwn(88)), y: wideY };
    }
    case 'ST': {
      const oppDefs = teamPlayers(state, p.team === 'home' ? 'away' : 'home')
        .filter((o) => ['CB', 'LB', 'RB'].includes(o.role));
      let lineX = fromOwn(70);
      let gapY = 34;
      if (oppDefs.length) {
        lineX = dir === 1
          ? Math.min(...oppDefs.map((o) => o.x))
          : Math.max(...oppDefs.map((o) => o.x));
        const cbs = oppDefs.filter((o) => o.role === 'CB').sort((a, c) => a.y - c.y);
        if (cbs.length >= 2) gapY = (cbs[0].y + cbs[1].y) / 2;
      }
      if (objective === 'progressLeft' || objective === 'attackHalfSpaceLeft') gapY -= 5;
      if (objective === 'progressRight' || objective === 'attackHalfSpaceRight') gapY += 5;
      if (sim && p.runType !== 'runIntoSpace') sim.stats[p.team].runs++;
      p.runType = 'runIntoSpace';
      p.runTarget = {
        x: clamp(lineX + dir * 2, 8, PITCH.length - 6),
        y: clamp(gapY, 12, 56),
      };
      return { x: clamp(lineX - dir * 1.5, 8, PITCH.length - 8), y: p.runTarget.y, urgency: 0.95 };
    }
    default:
      return { x: p.targetX, y: p.targetY };
  }
}

function defendingOffBall(state, p, owner, phase) {
  const b = state.ball;
  const dir = attackDir(p.team);
  const team = state.teams[p.team];
  const oppOwner = owner && owner.team !== p.team ? owner : null;

  p.runType = null;
  p.runTarget = null;

  // pressing: counter-press แรงขึ้นช่วง transition
  if (oppOwner) {
    const counterPress = phase === 'TRANSITION_TO_DEFENSE';
    const pressers = teamPlayers(state, p.team)
      .filter((m) => m.role !== 'GK')
      .sort((a, c) => distP(a, oppOwner) - distP(c, oppOwner));
    let nPress = team.pressingLevel >= 4 ? 3 : team.pressingLevel >= 2 ? 2 : 1;
    let pressRadius = 10 + team.pressingLevel * 4;
    if (counterPress) { nPress += 1; pressRadius += 5; }
    // fix: คู่แข่งครองบอลยืดเยื้อหลายเทิร์น (stall) → เร่ง pressing แย่งคืน กัน "ติด midBlock วนไม่จบ"
    const streak = state.possessionStreak;
    let stale = 0;
    if (streak && streak.team === oppOwner.team && streak.turns >= 3) {
      stale = Math.min(streak.turns - 2, 5); // 1..5
      nPress += stale >= 1 ? 1 : 0;
      nPress += stale >= 3 ? 1 : 0;
      pressRadius += stale * 5;
    }
    const idx = pressers.indexOf(p);
    // ครองนานมาก: ตัวที่ใกล้บอลสุดออกจาก block ไปไล่เลย แม้บอลจะอยู่ลึกในแดนคู่แข่ง
    const forceChase = stale >= 3 && idx === 0;
    if (idx >= 0 && idx < nPress && (forceChase || distP(p, oppOwner) < pressRadius) && p.stamina > 12) {
      return { x: oppOwner.x, y: oppOwner.y, urgency: 1, pressing: true };
    }
  }

  let ax = p.targetX + (b.x - PITCH.length / 2) * 0.1;
  let ay = p.targetY + (b.y - 34) * 0.18;
  let urgency = phase === 'TRANSITION_TO_DEFENSE' ? 0.95 : 0.8;

  if (['CB', 'LB', 'RB', 'DM'].includes(p.role)) {
    const ownGoalX = p.team === 'home' ? 0 : PITCH.length;
    const lineDepth = 12 + team.defensiveLine * 4;
    const ballPull = clamp((b.x - PITCH.length / 2) * dir, -20, 20);
    const lineX = ownGoalX + dir * clamp(lineDepth + ballPull * 0.45, 8, 48);
    if ((ax - lineX) * dir > 0) ax = lineX;
    ay = lerp(ay, 34, 0.12);
    const danger = nearestOpponentInZone(state, p, 9);
    if (danger && ['CB', 'LB', 'RB'].includes(p.role)) {
      ax = lerp(ax, danger.x, 0.5);
      ay = lerp(ay, danger.y, 0.6);
      urgency = 0.95;
    }
  } else if (p.role === 'ST') {
    // ST ปิด passing lane กลับหลังของคู่แข่ง
    if (oppOwner) {
      const oppGK = teamPlayers(state, p.team === 'home' ? 'away' : 'home').find((o) => o.role === 'GK');
      if (oppGK) {
        ax = (oppOwner.x + oppGK.x) / 2;
        ay = (oppOwner.y + oppGK.y) / 2;
        urgency = 0.7;
      }
    }
  } else if (['LW', 'RW'].includes(p.role)) {
    // ปีกถอยช่วย fullback ฝั่งตัวเองเมื่อบอลอยู่ฝั่งนั้น
    const myFB = teamPlayers(state, p.team).find(
      (m) => ['LB', 'RB'].includes(m.role) && Math.abs(m.baseY - p.baseY) < 20
    );
    const ballOnSide = Math.abs(b.y - p.baseY) < 22;
    if (myFB && ballOnSide) {
      ax = myFB.x + dir * 8;
      ay = (myFB.y + b.y) / 2;
      urgency = 0.9;
    } else {
      ax = lerp(ax, p.targetX + dir * -4, 0.4);
      ay = lerp(ay, 34 + (p.targetY - 34) * 0.75, 0.3);
    }
  } else {
    // CM/AM บีบกลางสนาม
    ax = lerp(ax, p.targetX + dir * -4, 0.4);
    ay = lerp(ay, 34 + (p.targetY - 34) * 0.7, 0.3);
  }

  return {
    x: clamp(ax, 0.5, PITCH.length - 0.5),
    y: clamp(ay, 0.5, PITCH.width - 0.5),
    urgency,
    pressing: false,
  };
}

function nearestOpponentInZone(state, p, radius) {
  let nearest = null, best = radius;
  for (const o of state.players) {
    if (o.team === p.team || o.role === 'GK') continue;
    const d = distP(o, p);
    if (d < best) { best = d; nearest = o; }
  }
  return nearest;
}
