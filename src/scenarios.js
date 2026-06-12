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

  state.assistant = {
    messages: [{
      severity: 'info',
      text: 'จัดสถานการณ์เตะมุมแล้ว — ลากตัวโจมตีในกรอบเพื่อหาช่องว่าง (ghost AI ช่วยได้) แล้วกด Play เพื่อดูลูกเตะมุมใน 8 วินาที',
    }],
    ghosts: [],
  };
  state.ui.scoresDirty = true;
  return true;
}
