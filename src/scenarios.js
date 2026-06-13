// P3: Scenario presets — โหมดซ้อมเตะมุม (ตามรอย TacticAI ที่เริ่มจาก corner)

import { PITCH } from './config.js';
import { teamPlayers } from './team.js';
import { giveBall } from './ball.js';

// จัดสถานการณ์เตะมุมฝั่งเรา (มุมบนขวา, บุกไปทาง x มาก)
export function setupCornerScenario(state) {
  if (state.phase === 'simulating') return false;

  const home = teamPlayers(state, 'home');
  const away = teamPlayers(state, 'away');

  // ทีมเรา: คนเตะ + ตัวโจมตีในกรอบ + ตัวคุม second ball + กองหลังกันสวน
  const used = new Set();
  const place = (p, x, y) => {
    if (!p) return;
    used.add(p.id);
    p.x = x; p.y = y;
    p.targetX = x; p.targetY = y;
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
    p.pathHistory = [];
  };

  // คนเตะมุม: เลือก passing สูงสุดจาก RW/AM/CM
  const takers = home
    .filter((p) => ['RW', 'AM', 'CM', 'LW'].includes(p.role))
    .sort((a, b) => b.passing - a.passing);
  const taker = takers[0] || home.find((p) => p.role !== 'GK');
  place(taker, PITCH.length - 2, 2.2);

  const gk = home.find((p) => p.role === 'GK');
  place(gk, 4, 34);

  // ตัวโจมตีในกรอบ
  const attackers = home.filter((p) => !used.has(p.id) && ['ST', 'AM', 'LW', 'RW', 'CM'].includes(p.role));
  const boxSpots = [
    [PITCH.length - 9, 30],   // หน้าจุดโทษ
    [PITCH.length - 6, 36],   // เสาไกล
    [PITCH.length - 11, 38],  // กลางกรอบ
    [PITCH.length - 13, 27],  // มุมเขตโทษ
  ];
  attackers.slice(0, 4).forEach((p, i) => place(p, boxSpots[i][0], boxSpots[i][1]));

  // second ball + กันสวน
  const rest = home.filter((p) => !used.has(p.id));
  const restSpots = [
    [PITCH.length - 22, 32], // หน้ากรอบรอ second ball
    [PITCH.length - 30, 16], // คุมริมซ้าย
    [62, 28],                // CB กันสวน
    [62, 40],
    [70, 50],
  ];
  rest.forEach((p, i) => {
    const s = restSpots[Math.min(i, restSpots.length - 1)];
    place(p, s[0], s[1]);
  });

  // คู่แข่ง: ถอยลงป้องกันกรอบ + เสา + ตัวรอสวน
  const aGK = away.find((p) => p.role === 'GK');
  const aRest = away.filter((p) => p.role !== 'GK');
  const defSpots = [
    [PITCH.length - 1.5, 30.5], // เสาแรก
    [PITCH.length - 1.5, 37.5], // เสาสอง
    [PITCH.length - 8, 31],
    [PITCH.length - 7, 36],
    [PITCH.length - 10, 34],
    [PITCH.length - 12, 39],
    [PITCH.length - 12, 28],
    [PITCH.length - 17, 33],    // ขอบกรอบ
    [PITCH.length - 20, 25],
    [55, 34],                   // ตัวรอสวนกลับ
  ];
  if (aGK) {
    aGK.x = PITCH.length - 2.5; aGK.y = 34;
    aGK.targetX = aGK.x; aGK.targetY = aGK.y;
    aGK.pathHistory = [];
  }
  aRest.forEach((p, i) => {
    const s = defSpots[Math.min(i, defSpots.length - 1)];
    p.x = s[0]; p.y = s[1];
    p.targetX = s[0]; p.targetY = s[1];
    p.intendedTarget = null;
    p.runType = null;
    p.runTarget = null;
    p.pathHistory = [];
  });

  // บอลอยู่กับคนเตะมุม
  state.ball.x = taker.x;
  state.ball.y = taker.y;
  giveBall(state, taker);
  // P2.9: ตั้งเป็นลูกเตะมุม — คนเตะจะเปิดเข้ากรอบลุ้นโหม่ง ไม่เลี้ยงเอง
  state.setPiece = { type: 'corner', takerId: taker.id, deliverTick: 5 };
  state.pendingPenalty = null;

  state.assistant = {
    messages: [{
      severity: 'info',
      text: 'จัดสถานการณ์เตะมุมแล้ว — ลากตัวโจมตีในกรอบเพื่อหาช่องว่าง (ghost AI ช่วยได้) แล้วกด Play คนเตะจะเปิดเข้ากรอบให้ลุ้นโหม่ง',
    }],
    ghosts: [],
  };
  state.ui.scoresDirty = true;
  return true;
}

// P2.9: จัดสถานการณ์ฟรีคิกฝั่งเรา (ระยะยิงตรง ~22m เยื้องขวาเล็กน้อย)
export function setupFreeKickScenario(state, spot) {
  if (state.phase === 'simulating') return false;

  const home = teamPlayers(state, 'home');
  const away = teamPlayers(state, 'away');
  const fk = spot || { x: PITCH.length - 22, y: 30 };

  const used = new Set();
  const place = (p, x, y) => {
    if (!p) return;
    used.add(p.id);
    p.x = x; p.y = y;
    p.targetX = x; p.targetY = y;
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
    p.pathHistory = [];
  };

  // คนเตะ: เลือก shooting สูงสุด
  const taker = home
    .filter((p) => p.role !== 'GK')
    .sort((a, b) => b.shooting - a.shooting)[0];
  place(taker, fk.x, fk.y);

  place(home.find((p) => p.role === 'GK'), 6, 34);

  // ตัวรอเก็บตก/โหม่งในและรอบกรอบ
  const attackers = home.filter((p) => !used.has(p.id) && ['ST', 'AM', 'CM', 'LW', 'RW', 'CB'].includes(p.role));
  const spots = [
    [PITCH.length - 11, 30], [PITCH.length - 9, 38], [PITCH.length - 14, 34],
    [PITCH.length - 18, 24], [PITCH.length - 17, 44], [PITCH.length - 24, 34],
  ];
  attackers.forEach((p, i) => place(p, spots[Math.min(i, spots.length - 1)][0], spots[Math.min(i, spots.length - 1)][1]));
  // ที่เหลือกันสวน
  home.filter((p) => !used.has(p.id)).forEach((p, i) => place(p, 55 - i * 4, 26 + i * 8));

  // คู่แข่ง: ตั้งกำแพง ~9.15m หน้าบอลในแนวสู่ประตู + GK เฝ้าเสา + แนวรับ
  const aGK = away.find((p) => p.role === 'GK');
  if (aGK) { aGK.x = PITCH.length - 2.5; aGK.y = 33; aGK.targetX = aGK.x; aGK.targetY = aGK.y; aGK.pathHistory = []; }
  const goalDir = { x: PITCH.length - fk.x, y: 34 - fk.y };
  const glen = Math.hypot(goalDir.x, goalDir.y) || 1;
  const wallX = fk.x + (goalDir.x / glen) * 9.15;
  const wallY = fk.y + (goalDir.y / glen) * 9.15;
  const aRest = away.filter((p) => p.role !== 'GK');
  aRest.forEach((p, i) => {
    let x, y;
    if (i < 4) { x = wallX; y = wallY + (i - 1.5) * 1.0; } // กำแพง 4 คน
    else { x = PITCH.length - 10 - (i - 4) * 2; y = 26 + (i - 4) * 4; } // แนวรับในกรอบ
    p.x = x; p.y = y; p.targetX = x; p.targetY = y;
    p.intendedTarget = null; p.runType = null; p.runTarget = null; p.pathHistory = [];
  });

  state.ball.x = taker.x;
  state.ball.y = taker.y;
  giveBall(state, taker);
  state.setPiece = { type: 'freeKick', takerId: taker.id, deliverTick: 5 };
  state.pendingPenalty = null;

  state.assistant = {
    messages: [{
      severity: 'info',
      text: 'จัดฟรีคิกระยะยิงแล้ว — คนเตะจะ "ยิงตรง" เพราะได้ระยะ (ลากออกไปไกล/มุมแคบจะเปลี่ยนเป็นเปิดเข้ากรอบแทน) กด Play เพื่อดูผล',
    }],
    ghosts: [],
  };
  state.ui.scoresDirty = true;
  return true;
}
