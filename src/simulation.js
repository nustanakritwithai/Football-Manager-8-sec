// simulation 8 วินาที — หัวใจของเกม
// แต่ละเทิร์น = 80 tick (10 tick/วินาที) จากนั้น commit ผลลัพธ์เข้า state จริง

import {
  PITCH, TICKS_PER_TURN, TICK_DT, TURN_SECONDS,
  PATH_SAMPLE_EVERY, MAX_HISTORY, MATCH_TURNS,
} from './config.js';
import { clamp, dist, distP, lerp, pointSegDist, rand } from './utils.js';
import { maxSpeed } from './player.js';
import { giveBall, startPass, makeLoose } from './ball.js';
import { attackDir, goalAttackedBy, teamPlayers, getPlayer } from './team.js';
import { recordEvent, kickoff, isMatchOver } from './state.js';
import { analyze } from './tacticalAnalyzer.js';
import { generateAdvice } from './aiAssistant.js';

// ---------- เริ่ม / จบ เทิร์น ----------

export function startSimulation(state) {
  if (state.phase !== 'planning') return false;

  // ล็อกแผน: targetX/Y ปัจจุบันคือ anchor ของเทิร์นนี้
  for (const p of state.players) {
    p.pathHistory = [{ x: p.x, y: p.y }];
    p.isSelected = p.id === state.ui.selectedId;
  }

  opponentPlan(state); // AI คู่แข่งวางแผนของตัวเอง (rule-based)

  state.prevScores = state.tacticalScores ? { ...state.tacticalScores } : null;
  state.lastTurnEvents = [];
  state.sim = {
    tick: 0,
    cooldowns: new Map(),   // playerId -> วินาทีก่อนตัดสินใจครั้งถัดไป
    dribbleTarget: new Map(),
    possessionTicks: { home: 0, away: 0 },
    startSnapshot: snapshotPositions(state),
    ballStart: { x: state.ball.x, y: state.ball.y },
    possessionStart: state.possessionTeam,
    pressEvents: 0,
    passAttempts: { home: 0, away: 0 },
    passCompleted: { home: 0, away: 0 },
    goalScored: false,
  };
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

  if (sim.tick >= TICKS_PER_TURN) {
    finishSimulation(state);
    return true;
  }
  return false;
}

function finishSimulation(state) {
  const sim = state.sim;

  // Resolution: ตำแหน่งสุดท้ายกลายเป็นสถานะจริง — anchor เทิร์นถัดไปคือจุดที่ยืนอยู่จริง
  for (const p of state.players) {
    p.targetX = p.x;
    p.targetY = p.y;
  }

  state.clock += TURN_SECONDS;

  // Analysis
  const analysis = analyze(state);
  state.tacticalScores = analysis.scores;
  const advice = generateAdvice(state, analysis, state.lastTurnEvents, state.prevScores);
  state.assistant = advice;

  // Turn history
  state.history.push({
    turnNumber: state.turn,
    startClock: state.clock - TURN_SECONDS,
    endClock: state.clock,
    startingPositions: sim.startSnapshot,
    endingPositions: snapshotPositions(state),
    ballStart: sim.ballStart,
    ballEnd: { x: state.ball.x, y: state.ball.y },
    possessionStart: sim.possessionStart,
    possessionEnd: state.possessionTeam,
    tacticalScoresBefore: state.prevScores,
    tacticalScoresAfter: { ...analysis.scores },
    events: [...state.lastTurnEvents],
    assistantMessages: advice.messages.map((m) => m.text),
  });
  if (state.history.length > MAX_HISTORY) state.history.shift();

  state.turn++;
  state.sim = null;
  state.phase = isMatchOver(state) ? 'finished' : 'planning';
  state.ui.scoresDirty = true;

  if (state.phase === 'finished') {
    state.assistant.messages.unshift({
      text: `จบแมตช์! สกอร์ ${state.score.home}-${state.score.away} (${MATCH_TURNS} เทิร์น) — ครองบอลรวมฝั่งเรา ${possessionPercent(state)}%`,
      severity: 'info',
    });
  }
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

// ---------- AI คู่แข่งวางแผนก่อนเทิร์น ----------

function opponentPlan(state) {
  const away = teamPlayers(state, 'away');
  const ball = state.ball;
  const hasBall = state.possessionTeam === 'away';
  const t = state.teams.away;

  for (const p of away) {
    let tx = p.baseX;
    let ty = p.baseY;

    // ขยับตามตำแหน่งบอล (block shift)
    tx += (ball.x - PITCH.length / 2) * 0.22;
    ty += (ball.y - PITCH.width / 2) * (p.role === 'GK' ? 0.05 : 0.3);

    if (hasBall) {
      // มีบอล: ดันขึ้น (away บุกไปทาง x น้อย)
      if (p.role !== 'GK') tx -= 4 + t.tempo * 1.2;
      if (['LW', 'RW'].includes(p.role)) ty = lerp(ty, p.baseY, 0.5); // คงความกว้าง
    } else {
      // ไม่มีบอล: ถอย compact ตาม defensive line
      if (p.role !== 'GK') {
        tx += (5 - t.defensiveLine) * 2.2;
        ty = lerp(ty, PITCH.width / 2, 0.18); // หุบแคบ
      }
    }

    p.targetX = clamp(tx, 1, PITCH.length - 1);
    p.targetY = clamp(ty, 1, PITCH.width - 1);
  }
}

// ---------- หนึ่ง tick ----------

function stepTick(state) {
  updateBall(state);

  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner) decideAction(state, owner);

  for (const p of state.players) movePlayer(state, p, owner);

  // บอลตามเจ้าของ
  const o = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (o && !state.ball.inFlight) {
    const dir = attackDir(o.team);
    state.ball.x = clamp(o.x + dir * 0.8, 0.5, PITCH.length - 0.5);
    state.ball.y = o.y;
  }

  if (state.possessionTeam) state.sim.possessionTicks[state.possessionTeam]++;
}

// ---------- ลูกบอล ----------

function updateBall(state) {
  const b = state.ball;

  if (b.inFlight) {
    const d = dist(b.x, b.y, b.targetX, b.targetY);
    const step = b.flightSpeed * TICK_DT;

    // เช็ก interception ระหว่างทาง
    for (const p of state.players) {
      if (p.team === b.lastTouchTeam) continue;
      if (distP(p, b) < 1.2 && Math.random() < 0.25 + p.positioning / 250) {
        giveBall(state, p);
        recordEvent(state, `Interception by ${p.team === 'home' ? 'our' : 'their'} ${p.role} (#${p.number})`);
        state.sim && noteTurnover(state, p.team);
        return;
      }
    }

    if (d <= step) {
      b.x = b.targetX;
      b.y = b.targetY;
      b.inFlight = false;
      resolvePassArrival(state);
    } else {
      b.x += ((b.targetX - b.x) / d) * step;
      b.y += ((b.targetY - b.y) / d) * step;
    }
    return;
  }

  if (b.isLoose) {
    // บอลว่าง: ไหลด้วยแรงเสียดทาน + คนใกล้สุดเก็บ
    b.x = clamp(b.x + b.velocityX * TICK_DT, 0.5, PITCH.length - 0.5);
    b.y = clamp(b.y + b.velocityY * TICK_DT, 0.5, PITCH.width - 0.5);
    b.velocityX *= 0.92;
    b.velocityY *= 0.92;

    let nearest = null, best = Infinity;
    for (const p of state.players) {
      const d = distP(p, b);
      if (d < best) { best = d; nearest = p; }
    }
    if (nearest && best < 1.1) {
      giveBall(state, nearest);
      recordEvent(state, `${nearest.team === 'home' ? 'Our' : 'Their'} ${nearest.role} recovered loose ball`);
    }
  }
}

function resolvePassArrival(state) {
  const b = state.ball;
  let nearest = null, best = Infinity;
  for (const p of state.players) {
    const d = distP(p, b);
    if (d < best) { best = d; nearest = p; }
  }
  if (nearest && best < 2.6) {
    const sameTeam = nearest.team === b.lastTouchTeam;
    giveBall(state, nearest);
    if (sameTeam) {
      state.sim.passCompleted[nearest.team]++;
      recordEvent(state, `Pass completed → ${nearest.role} (#${nearest.number}, ${nearest.team === 'home' ? 'us' : 'them'})`);
    } else {
      recordEvent(state, `Pass failed — won by their ${nearest.role}`);
      noteTurnover(state, nearest.team);
    }
  } else {
    b.isLoose = true;
    recordEvent(state, 'Pass failed — ball loose');
  }
}

function noteTurnover(state, gainingTeam) {
  // ถ้าเสียบอลตอนดันสูง → counter risk
  const losing = gainingTeam === 'home' ? 'away' : 'home';
  const pushed = teamPlayers(state, losing).filter(
    (p) => attackDir(losing) === 1 ? p.x > 63 : p.x < 42
  ).length;
  if (pushed >= 4) recordEvent(state, `Counter risk: ${losing === 'home' ? 'we' : 'they'} lost ball with ${pushed} players high`);
}

// ---------- การตัดสินใจของผู้ถือบอล ----------

function decideAction(state, owner) {
  const sim = state.sim;
  const cd = sim.cooldowns.get(owner.id) ?? rand(0.2, 0.6);
  const left = cd - TICK_DT;
  if (left > 0) {
    sim.cooldowns.set(owner.id, left);
    return;
  }

  const team = state.teams[owner.team];
  const pressure = computePressure(state, owner);
  const goal = goalAttackedBy(owner.team);
  const dGoal = distP(owner, goal);
  const dir = attackDir(owner.team);

  // 1) ยิงถ้าอยู่ในระยะและมุมพอได้
  const shootRange = 17 + owner.shooting / 12;
  if (dGoal < shootRange && Math.abs(owner.y - 34) < 18 && Math.random() < 0.55 + owner.decision / 300) {
    attemptShot(state, owner, dGoal, pressure);
    sim.cooldowns.set(owner.id, decisionDelay(owner, pressure));
    return;
  }

  // 2) หาตัวเลือกการจ่าย
  const options = passOptions(state, owner, pressure);
  const best = options[0] || null;
  const styleBias = team.passingStyle === 'short' ? 0.06 : team.passingStyle === 'direct' ? -0.04 : 0;
  let threshold = 0.46 + styleBias - pressure * 0.13 - (team.riskLevel - 3) * 0.025;

  if (best && best.score > threshold) {
    executePass(state, owner, best, pressure);
  } else if (pressure > 1.3 && (!best || best.score < 0.25)) {
    // โดนรุมและไม่มีทางออก: เคลียร์บอล
    const cx = owner.x + dir * rand(18, 30);
    const cy = clamp(owner.y + rand(-14, 14), 2, PITCH.width - 2);
    makeLoose(state, ((cx - owner.x)) * 0.9, ((cy - owner.y)) * 0.9);
    state.ball.lastTouchTeam = owner.team;
    recordEvent(state, `${owner.team === 'home' ? 'Our' : 'Their'} ${owner.role} cleared under pressure`);
  } else {
    // เลี้ยงบอล: ไปข้างหน้า หนี pressure
    setDribbleTarget(state, owner, pressure);
  }
  sim.cooldowns.set(owner.id, decisionDelay(owner, pressure));
}

function decisionDelay(p, pressure) {
  const base = 1.5 - (p.decision / 100) * 0.6; // 0.9 - 1.5s
  return Math.max(0.35, base / (1 + pressure * 0.7));
}

// pressure 0..~3 จากคู่แข่งรอบตัว
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

// สร้างและให้คะแนนตัวเลือกการจ่ายบอล
export function passOptions(state, owner, pressure = 0) {
  const dir = attackDir(owner.team);
  const opps = state.players.filter((o) => o.team !== owner.team);
  const team = state.teams[owner.team];
  const options = [];

  for (const mate of state.players) {
    if (mate.team !== owner.team || mate.id === owner.id) continue;
    const d = distP(owner, mate);
    if (d < 4 || d > 40) continue;
    if (d > 26 && owner.vision < 60) continue; // vision ต่ำมองไม่เห็นบอลยาว

    // ความปลอดภัยของ lane: คู่แข่งที่ใกล้เส้นส่งที่สุด
    let laneMin = Infinity;
    for (const o of opps) {
      const ld = pointSegDist(o.x, o.y, owner.x, owner.y, mate.x, mate.y);
      if (ld < laneMin) laneMin = ld;
    }
    const laneSafety = clamp((laneMin - 0.8) / 5, 0, 1);

    // พื้นที่รอบผู้รับ
    let recvSpace = Infinity;
    for (const o of opps) {
      const od = distP(o, mate);
      if (od < recvSpace) recvSpace = od;
    }
    const space = clamp(recvSpace / 9, 0, 1);

    // ความคืบหน้าไปข้างหน้า
    const forward = clamp(((mate.x - owner.x) * dir) / 28, -1, 1);

    // ระยะส่งตามสไตล์
    const ideal = team.passingStyle === 'short' ? 12 : team.passingStyle === 'direct' ? 24 : 17;
    const distFit = clamp(1 - Math.abs(d - ideal) / 26, 0, 1);

    const score =
      laneSafety * 0.42 +
      space * 0.22 +
      forward * 0.2 * (1 + (team.riskLevel - 3) * 0.12) +
      distFit * 0.16;

    options.push({ mate, score, d, laneSafety, forward });
  }

  options.sort((a, b) => b.score - a.score);
  return options;
}

function executePass(state, owner, option, pressure) {
  const mate = option.mate;
  // ความคลาดเคลื่อน: passing ต่ำ + pressure สูง + ระยะไกล = พลาดง่าย
  const errMag =
    (1 - owner.passing / 130) * (option.d / 22) * (1 + pressure * 0.6) * rand(0, 4.5);
  const ang = rand(0, Math.PI * 2);
  // นำบอลไปหน้าผู้รับเล็กน้อย
  const lead = attackDir(owner.team) * clamp(option.d * 0.08, 0, 2.5);
  startPass(state, owner,
    mate.x + lead + Math.cos(ang) * errMag,
    mate.y + Math.sin(ang) * errMag);
  state.ball.ownerPlayerId = null;
  state.possessionTeam = owner.team;
  state.sim.passAttempts[owner.team]++;
  if (option.forward > 0.5 && option.laneSafety > 0.6) {
    recordEvent(state, `${owner.team === 'home' ? 'Our' : 'Their'} ${owner.role} found forward passing lane`);
  }
}

function attemptShot(state, owner, dGoal, pressure) {
  const goal = goalAttackedBy(owner.team);
  const angleFactor = clamp(1 - Math.abs(owner.y - 34) / 22, 0.15, 1);
  const prob = clamp(
    0.5 * (1 - dGoal / 32) * (owner.shooting / 85) * angleFactor / (1 + pressure * 0.8),
    0.02, 0.45
  );
  recordEvent(state, `Shot chance! ${owner.team === 'home' ? 'Our' : 'Their'} ${owner.role} shoots from ${Math.round(dGoal)}m`);

  if (Math.random() < prob) {
    state.score[owner.team]++;
    state.sim.goalScored = true;
    recordEvent(state, `GOAL!!! ${owner.team === 'home' ? state.teams.home.teamName : state.teams.away.teamName} scores!`);
    restartAfterGoal(state, owner.team === 'home' ? 'away' : 'home');
  } else {
    // เซฟ/หลุดกรอบ → บอลไปอยู่กับ GK ฝ่ายรับ
    const defTeam = owner.team === 'home' ? 'away' : 'home';
    const gk = teamPlayers(state, defTeam).find((p) => p.role === 'GK');
    recordEvent(state, Math.random() < 0.5 ? 'Shot saved by keeper' : 'Shot missed the target');
    if (gk) giveBall(state, gk);
    else makeLoose(state, -attackDir(owner.team) * 6, rand(-3, 3));
  }
}

function restartAfterGoal(state, kickoffTeam) {
  // จัดทุกคนกลับ formation base (การเริ่มเขี่ยใหม่จริงของฟุตบอล)
  for (const p of state.players) {
    p.x = p.baseX; p.y = p.baseY;
    p.targetX = p.baseX; p.targetY = p.baseY;
  }
  kickoff(state, kickoffTeam);
}

function setDribbleTarget(state, owner, pressure) {
  const dir = attackDir(owner.team);
  let tx = owner.x + dir * rand(4, 8);
  let ty = owner.y;
  // หนีจากคู่แข่งที่ใกล้สุด
  let nearest = null, best = Infinity;
  for (const o of state.players) {
    if (o.team === owner.team) continue;
    const d = distP(o, owner);
    if (d < best) { best = d; nearest = o; }
  }
  if (nearest && best < 6) {
    ty += owner.y >= nearest.y ? rand(3, 7) : -rand(3, 7);
    if (pressure > 1.5) tx = owner.x + dir * rand(1, 3); // โดนรุม เลี้ยงสั้น
  }
  state.sim.dribbleTarget.set(owner.id, {
    x: clamp(tx, 1, PITCH.length - 1),
    y: clamp(ty, 1, PITCH.width - 1),
  });
}

// ---------- การเคลื่อนที่ ----------

function movePlayer(state, p, owner) {
  const desired = desiredPosition(state, p, owner);
  const d = dist(p.x, p.y, desired.x, desired.y);

  if (d < 0.4) {
    // ยืนพัก ฟื้น stamina เล็กน้อย
    p.stamina = clamp(p.stamina + 0.012, 0, 100);
    return;
  }

  const sp = maxSpeed(p) * desired.urgency;
  const step = Math.min(sp * TICK_DT, d);
  p.x = clamp(p.x + ((desired.x - p.x) / d) * step, 0.3, PITCH.length - 0.3);
  p.y = clamp(p.y + ((desired.y - p.y) / d) * step, 0.3, PITCH.width - 0.3);

  // stamina ลดตามระยะวิ่ง pressing กินแรงกว่า
  const drain = step * 0.05 * (desired.pressing ? 1.7 : 1);
  p.stamina = clamp(p.stamina - drain, 0, 100);
  if (p.stamina < 25 && !p._staminaWarned) {
    p._staminaWarned = true;
    recordEvent(state, `Stamina warning: ${p.team === 'home' ? 'our' : 'their'} ${p.role} (#${p.number}) exhausted`);
  }
}

function desiredPosition(state, p, owner) {
  const b = state.ball;
  const dir = attackDir(p.team);
  const team = state.teams[p.team];
  const hasBall = state.possessionTeam === p.team && !b.isLoose;

  // ผู้ถือบอล: เลี้ยงไปตาม dribble target
  if (owner && owner.id === p.id) {
    const t = state.sim.dribbleTarget.get(p.id);
    if (t) return { x: t.x, y: t.y, urgency: 0.85, pressing: false };
    return { x: p.x, y: p.y, urgency: 0, pressing: false };
  }

  // GK: คุมพื้นที่หน้าประตู ขยับตามบอลเล็กน้อย
  if (p.role === 'GK') {
    const gx = p.team === 'home' ? 4 : PITCH.length - 4;
    const gy = clamp(34 + (b.y - 34) * 0.3, 26, 42);
    return { x: gx, y: gy, urgency: 0.7, pressing: false };
  }

  // บอลว่าง: 2 คนที่ใกล้สุดของแต่ละทีมวิ่งเก็บ
  if (b.isLoose) {
    const mates = teamPlayers(state, p.team)
      .filter((m) => m.role !== 'GK')
      .sort((a, c) => distP(a, b) - distP(c, b));
    if (mates.indexOf(p) < 2) return { x: b.x, y: b.y, urgency: 1, pressing: true };
  }

  // anchor = ตำแหน่งที่โค้ชวางไว้ + ขยับตามบอล
  let ax = p.targetX + (b.x - PITCH.length / 2) * 0.1;
  let ay = p.targetY + (b.y - 34) * 0.18;
  let urgency = 0.8;
  let pressing = false;

  if (hasBall) {
    // ----- ทีมครองบอล: เปิดเกม -----
    const push = (2 + team.tempo) * 0.9;
    if (!['CB', 'GK'].includes(p.role)) ax += dir * push;

    // winger ถ่างตาม width
    if (['LW', 'RW'].includes(p.role)) {
      const wide = (team.attackingWidth - 3) * 3.2;
      ay = p.targetY < 34 ? clamp(ay - 4 - wide, 3, 34) : clamp(ay + 4 + wide, 34, PITCH.width - 3);
    }

    // ST วิ่งหาช่องหลังแนวรับ
    if (p.role === 'ST') {
      const oppDefs = teamPlayers(state, p.team === 'home' ? 'away' : 'home')
        .filter((o) => ['CB', 'LB', 'RB'].includes(o.role));
      if (oppDefs.length) {
        const lineX = dir === 1
          ? Math.min(...oppDefs.map((o) => o.x))
          : Math.max(...oppDefs.map((o) => o.x));
        ax = clamp(lineX - dir * 1.5, 8, PITCH.length - 8);
        const cbs = oppDefs.filter((o) => o.role === 'CB').sort((a, c) => a.y - c.y);
        if (cbs.length >= 2) ay = (cbs[0].y + cbs[1].y) / 2 + rand(-2, 2);
      }
      urgency = 0.95;
    }

    // ตัวใกล้บอล 2 คนเข้า support ผู้ถือบอล
    if (owner) {
      const mates = teamPlayers(state, p.team)
        .filter((m) => m.id !== owner.id && m.role !== 'GK')
        .sort((a, c) => distP(a, owner) - distP(c, owner));
      const idx = mates.indexOf(p);
      if (idx >= 0 && idx < 2 && distP(p, owner) > 14) {
        ax = owner.x + dir * 6 * (idx === 0 ? 1 : -0.5);
        ay = owner.y + (idx === 0 ? -9 : 9);
        urgency = 0.9;
      }
    }
  } else {
    // ----- ทีมไม่มีบอล: เกมรับ -----
    const oppOwner = owner && owner.team !== p.team ? owner : null;

    // pressing: คนใกล้บอลที่สุด N คน (ตาม pressingLevel) เข้ากดดัน
    if (oppOwner) {
      const pressers = teamPlayers(state, p.team)
        .filter((m) => m.role !== 'GK')
        .sort((a, c) => distP(a, oppOwner) - distP(c, oppOwner));
      const nPress = team.pressingLevel >= 4 ? 3 : team.pressingLevel >= 2 ? 2 : 1;
      const pressRadius = 10 + team.pressingLevel * 4;
      const idx = pressers.indexOf(p);
      if (idx >= 0 && idx < nPress && distP(p, oppOwner) < pressRadius && p.stamina > 18) {
        return { x: oppOwner.x, y: oppOwner.y, urgency: 1, pressing: true };
      }
    }

    // แนวรับรักษาเส้น defensive line + หุบเข้าใน
    if (['CB', 'LB', 'RB', 'DM'].includes(p.role)) {
      const ownGoalX = p.team === 'home' ? 0 : PITCH.length;
      const lineDepth = 12 + team.defensiveLine * 4; // ระยะจากประตูตัวเอง
      const ballPull = clamp((b.x - PITCH.length / 2) * dir, -20, 20);
      const lineX = ownGoalX + dir * clamp(lineDepth + ballPull * 0.45, 8, 48);
      // อย่าให้ยืนสูงกว่า line
      if ((ax - lineX) * dir > 0) ax = lineX;
      ay = lerp(ay, 34, 0.12); // compact
      // ประกบคู่แข่งที่หลุดเข้าโซน
      const danger = nearestOpponentInZone(state, p, 9);
      if (danger && ['CB', 'LB', 'RB'].includes(p.role)) {
        ax = lerp(ax, danger.x, 0.5);
        ay = lerp(ay, danger.y, 0.6);
        urgency = 0.95;
      }
    } else {
      // กลาง/หน้า ถอยลงมาช่วยเป็น block
      ax = lerp(ax, p.targetX + dir * -4, 0.4);
      ay = lerp(ay, 34 + (p.targetY - 34) * 0.7, 0.3);
    }
  }

  return {
    x: clamp(ax, 0.5, PITCH.length - 0.5),
    y: clamp(ay, 0.5, PITCH.width - 0.5),
    urgency,
    pressing,
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
