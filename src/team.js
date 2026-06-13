// สร้างทีม home/away และ helper เกี่ยวกับทีม

import { PITCH } from './config.js';
import { FORMATIONS } from './formations.js';
import { createPlayer } from './player.js';
import { choice } from './utils.js';

const HOME_NAMES = [
  'Korn', 'Anan', 'Phet', 'Krit', 'Somchai',
  'Decha', 'Win', 'Tana', 'Beam', 'Chai', 'Arthit',
  'Nattawut', 'Sittha', 'Pong', 'Got', 'Tee', 'Ake', 'Boss',
];
const AWAY_NAMES = [
  'Marek', 'Janko', 'Rudi', 'Stefan', 'Luka',
  'Pavel', 'Dario', 'Milan', 'Tomas', 'Goran', 'Ivan',
  'Petr', 'Nikola', 'Vlado', 'Andrej', 'Filip', 'Josip', 'Marko',
];

// บทบาทตัวสำรองบนม้านั่ง (7 คน): ครอบคลุมทุกแผง
const BENCH_ROLES = ['GK', 'CB', 'LB', 'DM', 'CM', 'RW', 'ST'];

// ตำแหน่ง normalized ประจำ role (ใช้ตั้ง base ให้ตัวสำรองเผื่อถูกเปลี่ยนลง)
const ROLE_HOME_NORM = {
  GK: { x: 0.05, y: 0.50 }, CB: { x: 0.16, y: 0.50 }, LB: { x: 0.18, y: 0.16 },
  RB: { x: 0.18, y: 0.84 }, DM: { x: 0.27, y: 0.50 }, CM: { x: 0.34, y: 0.50 },
  AM: { x: 0.42, y: 0.50 }, LW: { x: 0.44, y: 0.16 }, RW: { x: 0.44, y: 0.84 },
  ST: { x: 0.47, y: 0.50 },
};

// สไตล์ของทีมคู่แข่ง (rule-based)
export const AWAY_STYLES = {
  'Low Block':      { pressingLevel: 2, defensiveLine: 1, attackingWidth: 2, passingStyle: 'direct', tempo: 2, riskLevel: 2 },
  'High Press':     { pressingLevel: 5, defensiveLine: 4, attackingWidth: 3, passingStyle: 'short',  tempo: 4, riskLevel: 3 },
  'Counter Attack': { pressingLevel: 2, defensiveLine: 2, attackingWidth: 3, passingStyle: 'direct', tempo: 5, riskLevel: 4 },
  'Possession':     { pressingLevel: 3, defensiveLine: 4, attackingWidth: 3, passingStyle: 'short',  tempo: 2, riskLevel: 2 },
  'Wing Play':      { pressingLevel: 3, defensiveLine: 3, attackingWidth: 5, passingStyle: 'mixed',  tempo: 3, riskLevel: 3 },
};

export function attackDir(team) {
  return team === 'home' ? 1 : -1; // home บุกไปทาง x มาก, away บุกไปทาง x น้อย
}

export function goalAttackedBy(team) {
  // ตำแหน่งประตูที่ทีมนี้ต้องบุกเข้าไป
  return { x: team === 'home' ? PITCH.length : 0, y: PITCH.width / 2 };
}

export function goalDefendedBy(team) {
  return { x: team === 'home' ? 0 : PITCH.length, y: PITCH.width / 2 };
}

// แปลงตำแหน่ง normalized ของ formation เป็นเมตรจริงตามฝั่งทีม
export function formationToField(slot, team) {
  const x = team === 'home' ? slot.x * PITCH.length : PITCH.length - slot.x * PITCH.length;
  const y = slot.y * PITCH.width;
  return { x, y };
}

export function createTeam(teamId, teamName, color, formationName, opts = {}) {
  const slots = FORMATIONS[formationName];
  const names = teamId === 'home' ? HOME_NAMES : AWAY_NAMES;
  const players = slots.map((slot, i) => {
    const pos = formationToField(slot, teamId);
    return createPlayer({
      id: `${teamId}-${i}`,
      name: names[i % names.length],
      team: teamId,
      role: slot.role,
      number: i + 1,
      x: pos.x,
      y: pos.y,
    });
  });

  // ตัวสำรอง 7 คน (id: home-b0.. / away-b0..) — อยู่นอก state.players จึงไม่ถูกจำลอง
  const bench = BENCH_ROLES.map((role, i) => {
    const norm = ROLE_HOME_NORM[role] || ROLE_HOME_NORM.CM;
    const pos = formationToField(norm, teamId);
    return createPlayer({
      id: `${teamId}-b${i}`,
      name: names[(slots.length + i) % names.length],
      team: teamId,
      role,
      number: slots.length + i + 1,
      x: pos.x,
      y: pos.y,
    });
  });

  const styleName = opts.styleName ?? null;
  const instr = styleName ? AWAY_STYLES[styleName] : {
    pressingLevel: 3, defensiveLine: 3, attackingWidth: 3,
    passingStyle: 'mixed', tempo: 3, riskLevel: 3,
  };

  return {
    team: {
      teamId,
      teamName,
      color,
      formation: formationName,
      players: players.map((p) => p.id),
      strategy: styleName || 'Balanced',
      mentality: 'balanced',
      pressingLevel: instr.pressingLevel,
      defensiveLine: instr.defensiveLine,
      attackingWidth: instr.attackingWidth,
      passingStyle: instr.passingStyle,
      tempo: instr.tempo,
      riskLevel: instr.riskLevel,
    },
    players,
    bench,
  };
}

// เปลี่ยนตัว: outId (ตัวจริงในสนาม) ↔ inId (ตัวสำรองบนม้านั่ง)
// คืน { ok, error } — ตัวที่ลงรับ base/ตำแหน่ง/เบอร์สล็อตของตัวที่ออก, stamina สด
export function substitute(state, teamId, outId, inId) {
  if (state.phase === 'simulating') return { ok: false, error: 'เปลี่ยนตัวระหว่างจำลองไม่ได้' };
  const used = state.subsUsed?.[teamId] ?? 0;
  if (used >= (state.subsMax ?? 5)) return { ok: false, error: 'ใช้สิทธิ์เปลี่ยนตัวครบแล้ว' };

  const bench = state.benches?.[teamId] ?? [];
  const outIdx = state.players.findIndex((p) => p.id === outId && p.team === teamId);
  const inIdx = bench.findIndex((p) => p.id === inId);
  if (outIdx < 0 || inIdx < 0) return { ok: false, error: 'ไม่พบนักเตะที่เลือก' };

  const outP = state.players[outIdx];
  const inP = bench[inIdx];

  // ตัวที่ลงรับตำแหน่งหลัก + ตำแหน่งจริง + role slot ของตัวที่ออก
  inP.baseX = outP.baseX; inP.baseY = outP.baseY;
  inP.x = outP.x; inP.y = outP.y;
  inP.targetX = outP.x; inP.targetY = outP.y;
  inP.role = outP.role;
  inP.intendedTarget = null;
  inP.commandLocked = false;
  inP.runType = null; inP.runTarget = null;
  inP.pathHistory = [];
  inP.isSelected = false;
  inP.stamina = Math.min(100, inP.stamina); // ตัวสำรองสด (เต็มอยู่แล้ว)

  // สลับเข้า-ออก
  state.players[outIdx] = inP;
  bench[inIdx] = outP;
  outP.isSelected = false;
  outP.intendedTarget = null;
  outP.commandLocked = false;

  // ถ้าตัวที่ออกถือบอลอยู่ ส่งบอลให้ตัวที่ลง
  if (state.ball.ownerPlayerId === outP.id) {
    state.ball.ownerPlayerId = inP.id;
    state.ball.lastTouchPlayerId = inP.id;
  }
  if (state.ui?.selectedId === outP.id) state.ui.selectedId = inP.id;

  state.subsUsed[teamId] = used + 1;
  state.teams[teamId].players = state.players.filter((p) => p.team === teamId).map((p) => p.id);
  state.ui.scoresDirty = true;
  return { ok: true, outP, inP, remaining: (state.subsMax ?? 5) - state.subsUsed[teamId] };
}

export function randomAwayStyle() {
  return choice(Object.keys(AWAY_STYLES));
}

export function teamPlayers(state, teamId) {
  return state.players.filter((p) => p.team === teamId);
}

export function getPlayer(state, id) {
  return state.players.find((p) => p.id === id) || null;
}
