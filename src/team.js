// สร้างทีม home/away และ helper เกี่ยวกับทีม

import { PITCH } from './config.js';
import { FORMATIONS } from './formations.js';
import { createPlayer } from './player.js';
import { choice } from './utils.js';

const HOME_NAMES = [
  'Korn', 'Anan', 'Phet', 'Krit', 'Somchai',
  'Decha', 'Win', 'Tana', 'Beam', 'Chai', 'Arthit',
];
const AWAY_NAMES = [
  'Marek', 'Janko', 'Rudi', 'Stefan', 'Luka',
  'Pavel', 'Dario', 'Milan', 'Tomas', 'Goran', 'Ivan',
];

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
  };
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
