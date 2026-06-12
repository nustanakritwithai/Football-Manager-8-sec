// คำนวณ tactical scores (0-100) และตรวจจุดอ่อน — มุมมองทีมเรา (home)

import { PITCH } from './config.js';
import { average, clamp, distP } from './utils.js';
import { teamPlayers, getPlayer } from './team.js';
import { passOptions } from './simulation.js';

const MID_X_MIN = 35, MID_X_MAX = 70;

export function analyze(state) {
  const home = teamPlayers(state, 'home');
  const away = teamPlayers(state, 'away');
  const outfield = home.filter((p) => p.role !== 'GK');
  const flags = {};

  const scores = {
    defensiveStability: defensiveStability(state, home, away, flags),
    attackThreat: attackThreat(state, home, away, flags),
    midfieldControl: midfieldControl(state, home, away, flags),
    counterRisk: counterRisk(state, home, away, flags),
    compactness: compactness(outfield, flags),
    pressingEfficiency: pressingEfficiency(state, home, away, flags),
    passingOptions: passingOptionsScore(state, home, flags),
    fatigueLoad: fatigueLoad(state, home, flags),
  };

  return { scores, flags };
}

function defensiveStability(state, home, away, flags) {
  let score = 75;

  const cbs = home.filter((p) => p.role === 'CB');
  const dms = home.filter((p) => p.role === 'DM');
  const backs = home.filter((p) => ['CB', 'LB', 'RB'].includes(p.role));

  // ช่องว่างระหว่าง CB คู่
  if (cbs.length >= 2) {
    const gap = Math.abs(cbs[0].y - cbs[1].y);
    flags.cbGap = gap;
    if (gap > 14) score -= (gap - 14) * 1.6;
    if (gap < 4) score -= 6; // ชิดเกินเปิดริม
  }

  // DM ห่างจากแนวรับ → เปิดพื้นที่หน้าเขตโทษ
  if (dms.length && cbs.length) {
    const cbX = average(cbs.map((c) => c.x));
    const dmDist = Math.min(...dms.map((d) => Math.abs(d.x - cbX)));
    flags.dmFarFromBack = dmDist > 18;
    if (dmDist > 18) score -= (dmDist - 18) * 1.2;
  }

  // คู่แข่งใน final third ของเรา (x < 35)
  const oppInOurThird = away.filter((p) => p.x < 35 && p.role !== 'GK').length;
  score -= oppInOurThird * 5;

  // ผู้ถือบอลคู่แข่งใกล้ประตูเรา
  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner && owner.team === 'away') {
    const dGoal = distP(owner, { x: 0, y: 34 });
    if (dGoal < 35) score -= (35 - dGoal) * 0.9;
  }

  // พื้นที่หลัง fullback: มีปีกคู่แข่งอยู่ลึกกว่า FB เราหรือไม่
  for (const fb of home.filter((p) => ['LB', 'RB'].includes(p.role))) {
    const exposed = away.some(
      (o) => o.x < fb.x - 4 && Math.abs(o.y - fb.y) < 12 && o.role !== 'GK'
    );
    if (exposed) {
      score -= 8;
      flags[fb.role === 'RB' ? 'rbExposed' : 'lbExposed'] = true;
    }
  }

  if (backs.length < 3) score -= 15;
  return clamp(Math.round(score), 0, 100);
}

function attackThreat(state, home, away, flags) {
  let score = 20;

  // ผู้เล่นเราใน final third คู่แข่ง (x > 70)
  const inFinalThird = home.filter((p) => p.x > 70).length;
  score += inFinalThird * 7;

  // ถ้าเราครองบอล: ระยะใกล้ประตู + passing lane ไปหน้า + support
  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner && owner.team === 'home') {
    const dGoal = distP(owner, { x: PITCH.length, y: 34 });
    score += clamp((1 - dGoal / 70) * 30, 0, 30);
    const opts = passOptions(state, owner);
    const forwardLanes = opts.filter((o) => o.forward > 0.3 && o.laneSafety > 0.5).length;
    score += forwardLanes * 6;
    const support = home.filter((p) => p.id !== owner.id && distP(p, owner) < 14).length;
    score += support * 3;
  }

  // ST แยกเดี่ยวจากแดนกลาง
  const st = home.find((p) => p.role === 'ST');
  if (st) {
    const mids = home.filter((p) => ['CM', 'AM', 'DM'].includes(p.role));
    const nearest = mids.length ? Math.min(...mids.map((m) => distP(m, st))) : 99;
    flags.stIsolated = nearest > 26;
    if (flags.stIsolated) score -= 10;
  }

  return clamp(Math.round(score), 0, 100);
}

function midfieldControl(state, home, away, flags) {
  const inMid = (p) => p.x > MID_X_MIN && p.x < MID_X_MAX && p.role !== 'GK';
  const h = home.filter(inMid).length;
  const a = away.filter(inMid).length;
  let score = 50 + (h - a) * 9;

  // ระยะห่างระหว่างกองกลางของเรา
  const mids = home.filter((p) => ['DM', 'CM', 'AM'].includes(p.role));
  if (mids.length >= 2) {
    let total = 0, n = 0;
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) { total += distP(mids[i], mids[j]); n++; }
    }
    const avg = total / n;
    flags.cmSpread = avg > 22;
    if (avg > 22) score -= (avg - 22) * 1.4;
    if (avg < 6) score -= 8; // กระจุกเกิน
  }

  // เราครองบอลในแดนกลางอยู่บวกเล็กน้อย
  if (state.possessionTeam === 'home' && state.ball.x > MID_X_MIN && state.ball.x < MID_X_MAX) {
    score += 6;
  }
  return clamp(Math.round(score), 0, 100);
}

function counterRisk(state, home, away, flags) {
  let risk = 15;

  // คนดันสูง
  const pushedHigh = home.filter((p) => p.x > 60 && p.role !== 'GK').length;
  risk += pushedHigh * 5;

  // fullback ดันสูง
  for (const fb of home.filter((p) => ['LB', 'RB'].includes(p.role))) {
    if (fb.x > 52) {
      risk += 13;
      flags[fb.role === 'RB' ? 'rbHigh' : 'lbHigh'] = fb;
    }
  }

  // ระยะห่างแนวรับกับแดนกลาง
  const backs = home.filter((p) => ['CB', 'LB', 'RB'].includes(p.role));
  const mids = home.filter((p) => ['DM', 'CM'].includes(p.role));
  if (backs.length && mids.length) {
    const gap = average(mids.map((m) => m.x)) - average(backs.map((b) => b.x));
    if (gap > 24) risk += (gap - 24) * 1.2;
  }

  // defensive line สูง + คู่แข่งมีตัววิ่งเร็วรออยู่
  risk += (state.teams.home.defensiveLine - 3) * 4;
  const fastOpp = away.filter((p) => p.speed > 75 && ['ST', 'LW', 'RW'].includes(p.role) && p.x < 60).length;
  risk += fastOpp * 4;

  return clamp(Math.round(risk), 0, 100);
}

function compactness(outfield, flags) {
  if (!outfield.length) return 50;
  const xs = outfield.map((p) => p.x);
  const ys = outfield.map((p) => p.y);
  const lenX = Math.max(...xs) - Math.min(...xs);
  const lenY = Math.max(...ys) - Math.min(...ys);

  let score = 100;
  if (lenX > 38) score -= (lenX - 38) * 1.8; // ทีมยืดยาวเกิน
  if (lenY > 46) score -= (lenY - 46) * 1.6;
  if (lenX < 16) score -= 10; // อัดแน่นผิดปกติ

  // ระยะเฉลี่ยถึงเพื่อนใกล้สุด
  let totalNearest = 0;
  for (const p of outfield) {
    let best = Infinity;
    for (const q of outfield) {
      if (q.id === p.id) continue;
      const d = distP(p, q);
      if (d < best) best = d;
    }
    totalNearest += best;
  }
  const avgNearest = totalNearest / outfield.length;
  if (avgNearest > 12) score -= (avgNearest - 12) * 2.5;

  flags.stretched = lenX > 42;
  return clamp(Math.round(score), 0, 100);
}

function pressingEfficiency(state, home, away, flags) {
  const t = state.teams.home;
  let score = 30 + t.pressingLevel * 8;

  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner && owner.team === 'away') {
    const sorted = home
      .filter((p) => p.role !== 'GK')
      .sort((a, b) => distP(a, owner) - distP(b, owner));
    const nearest = sorted[0] ? distP(sorted[0], owner) : 99;
    score += clamp((12 - nearest) * 2.5, -10, 25);
    const helpers = sorted.filter((p) => distP(p, owner) < 10).length;
    score += helpers * 5;
    const pressersStamina = average(sorted.slice(0, 3).map((p) => p.stamina));
    score -= clamp((70 - pressersStamina) * 0.4, 0, 20);
  }

  return clamp(Math.round(score), 0, 100);
}

function passingOptionsScore(state, home, flags) {
  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (owner && owner.team === 'home') {
    const opts = passOptions(state, owner);
    const safe = opts.filter((o) => o.score > 0.45).length;
    flags.fewOptions = safe < 2;
    return clamp(Math.round(20 + safe * 16 + (owner.vision / 100) * 10), 0, 100);
  }
  // ไม่มีบอล: ประเมินโครงสร้างระยะห่างระหว่างเพื่อน (เป็น proxy)
  let connected = 0, n = 0;
  const out = home.filter((p) => p.role !== 'GK');
  for (const p of out) {
    const mates = out.filter((q) => q.id !== p.id && distP(p, q) > 6 && distP(p, q) < 22).length;
    connected += Math.min(mates, 4);
    n++;
  }
  return clamp(Math.round((connected / (n * 4)) * 100), 0, 100);
}

function fatigueLoad(state, home, flags) {
  const avgStamina = average(home.map((p) => p.stamina));
  const t = state.teams.home;
  const load = (100 - avgStamina) * 1.6 + t.pressingLevel * 4 + t.tempo * 3;
  flags.tiredPlayers = home.filter((p) => p.stamina < 40);
  return clamp(Math.round(load), 0, 100);
}
