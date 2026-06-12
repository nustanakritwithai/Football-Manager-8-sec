// player object และการวาดนักเตะ

import { COLORS, MARGIN, SCALE, MAX_MOVEMENT_RADIUS, ROLE_FREEDOM, SIM_SECONDS } from './config.js';
import { clamp, rand } from './utils.js';

// ค่า attribute พื้นฐานตาม role (0-100)
const ROLE_BASE = {
  GK: { speed: 52, passing: 55, pressing: 30, tackling: 45, vision: 55, positioning: 80, shooting: 20, discipline: 80, aggression: 35, decision: 70 },
  CB: { speed: 60, passing: 60, pressing: 55, tackling: 80, vision: 55, positioning: 78, shooting: 30, discipline: 80, aggression: 65, decision: 68 },
  LB: { speed: 74, passing: 64, pressing: 62, tackling: 70, vision: 60, positioning: 68, shooting: 38, discipline: 68, aggression: 60, decision: 64 },
  RB: { speed: 74, passing: 64, pressing: 62, tackling: 70, vision: 60, positioning: 68, shooting: 38, discipline: 68, aggression: 60, decision: 64 },
  DM: { speed: 64, passing: 72, pressing: 70, tackling: 76, vision: 70, positioning: 76, shooting: 45, discipline: 78, aggression: 62, decision: 74 },
  CM: { speed: 68, passing: 76, pressing: 66, tackling: 62, vision: 74, positioning: 70, shooting: 56, discipline: 70, aggression: 55, decision: 72 },
  AM: { speed: 70, passing: 78, pressing: 55, tackling: 45, vision: 80, positioning: 66, shooting: 70, discipline: 60, aggression: 45, decision: 74 },
  LW: { speed: 82, passing: 68, pressing: 55, tackling: 40, vision: 68, positioning: 62, shooting: 68, discipline: 55, aggression: 50, decision: 66 },
  RW: { speed: 82, passing: 68, pressing: 55, tackling: 40, vision: 68, positioning: 62, shooting: 68, discipline: 55, aggression: 50, decision: 66 },
  ST: { speed: 78, passing: 62, pressing: 58, tackling: 35, vision: 64, positioning: 74, shooting: 80, discipline: 55, aggression: 60, decision: 70 },
};

export const ROLE_LIST = Object.keys(ROLE_BASE);

export function createPlayer({ id, name, team, role, number, x, y }) {
  const base = ROLE_BASE[role] || ROLE_BASE.CM;
  const vary = (v) => clamp(Math.round(v + rand(-6, 6)), 20, 95);
  return {
    id,
    name,
    team,        // 'home' | 'away'
    role,
    number,
    x, y,                 // ตำแหน่งจริงปัจจุบัน (เมตร)
    targetX: x, targetY: y, // ตำแหน่งที่ผู้เล่น/แผนสั่งไว้ (anchor)
    baseX: x, baseY: y,     // ตำแหน่งตาม formation
    speed: vary(base.speed),
    stamina: 100,
    passing: vary(base.passing),
    pressing: vary(base.pressing),
    tackling: vary(base.tackling),
    vision: vary(base.vision),
    positioning: vary(base.positioning),
    shooting: vary(base.shooting),
    discipline: vary(base.discipline),
    aggression: vary(base.aggression),
    decision: vary(base.decision),
    isSelected: false,
    pathHistory: [],
    // P2: คำสั่งโค้ช — ลาก = ตั้งเจตนา ไม่ใช่ย้ายตำแหน่ง
    intendedTarget: null,            // { x, y } | null
    commandType: defaultCommand(role),
    commandLocked: false,            // มีคำสั่งจากผู้เล่นในเทิร์นนี้
    lastCommandTurn: 0,
    currentAction: null,             // action ล่าสุดตอนถือบอล
    runType: null,                   // 'runIntoSpace' | 'overlap' | 'support' | ...
    runTarget: null,                 // { x, y }
  };
}

export function defaultCommand(role) {
  return ['GK', 'CB', 'DM'].includes(role) ? 'hold' : 'move';
}

export function staminaFactor(p) {
  return 0.55 + 0.45 * (p.stamina / 100);
}

export function roleFreedom(p) {
  return ROLE_FREEDOM[p.role] ?? 0.75;
}

// ระยะวิ่งสูงสุดที่เป็นไปได้ใน 8 วินาที (เมตร)
export function movementRadius(p) {
  const base = 4.2 + (p.speed / 100) * 3.4;
  return Math.min(base * SIM_SECONDS * staminaFactor(p) * roleFreedom(p), MAX_MOVEMENT_RADIUS);
}

// ตำแหน่งบ้านของ role (ใช้ดึงกลับ shape) = formation base
export function roleHome(p) {
  return { x: p.baseX, y: p.baseY };
}

// ความเร็วจริง (เมตร/วินาที) คิดจาก attribute และ stamina
export function maxSpeed(p) {
  const base = 4.2 + (p.speed / 100) * 3.4; // 4.2 - 7.6 m/s
  const staminaFactor = 0.55 + 0.45 * (p.stamina / 100);
  return base * staminaFactor;
}

export function toPx(x) { return MARGIN + x * SCALE; }
export function toPy(y) { return MARGIN + y * SCALE; }

export function drawPlayer(ctx, p, state) {
  const px = toPx(p.x), py = toPy(p.y);
  const r = 9;
  const isHome = p.team === 'home';

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = isHome ? COLORS.home : COLORS.away;
  ctx.fill();
  ctx.lineWidth = p.isSelected ? 3 : 1.5;
  ctx.strokeStyle = p.isSelected ? '#ffffff' : (isHome ? COLORS.homeDark : COLORS.awayDark);
  ctx.stroke();

  // วงแหวนเตือน stamina ต่ำ
  if (p.stamina < 40) {
    ctx.beginPath();
    ctx.arc(px, py, r + 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = p.stamina < 25 ? 'rgba(255,70,40,0.9)' : 'rgba(255,180,40,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // หมายเลขเสื้อ
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.number), px, py + 0.5);

  // role ใต้ตัวนักเตะ (เฉพาะทีมเรา หรือถูก hover)
  if (isHome || state?.ui?.hoverId === p.id) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '8px sans-serif';
    ctx.fillText(p.role, px, py + r + 7);
  }
}

export function drawPlayerPath(ctx, p) {
  if (!p.pathHistory || p.pathHistory.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(toPx(p.pathHistory[0].x), toPy(p.pathHistory[0].y));
  for (let i = 1; i < p.pathHistory.length; i++) {
    ctx.lineTo(toPx(p.pathHistory[i].x), toPy(p.pathHistory[i].y));
  }
  ctx.strokeStyle = p.team === 'home' ? COLORS.pathHome : COLORS.pathAway;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
