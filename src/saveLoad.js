// save/load ผ่าน localStorage + export/import JSON พร้อม validation

import { SAVE_VERSION, STORAGE_KEY, PITCH } from './config.js';
import { isValidFormation } from './formations.js';
import { isNum } from './utils.js';

export function serialize(state) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    turn: state.turn,
    clock: state.clock,
    phase: state.phase === 'simulating' ? 'planning' : state.phase,
    score: { ...state.score },
    possessionTeam: state.possessionTeam,
    teams: {
      home: { ...state.teams.home },
      away: { ...state.teams.away },
    },
    players: state.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, role: p.role, number: p.number,
      x: p.x, y: p.y, targetX: p.targetX, targetY: p.targetY,
      baseX: p.baseX, baseY: p.baseY,
      speed: p.speed, stamina: p.stamina, passing: p.passing,
      pressing: p.pressing, tackling: p.tackling, vision: p.vision,
      positioning: p.positioning, shooting: p.shooting,
      discipline: p.discipline, aggression: p.aggression, decision: p.decision,
    })),
    ball: { ...state.ball },
    tacticalScores: state.tacticalScores ? { ...state.tacticalScores } : null,
    history: state.history.slice(-10),
  };
}

// คืน { ok: true } หรือ { ok: false, error }
export function validateSave(data) {
  if (!data || typeof data !== 'object') return bad('ข้อมูลไม่ใช่ object');
  if (!Array.isArray(data.players)) return bad('ไม่พบ players หรือไม่ใช่ array');
  if (data.players.length !== 22) return bad(`players ต้องมี 22 คน (พบ ${data.players.length})`);
  for (const p of data.players) {
    if (!isNum(p.x) || !isNum(p.y)) return bad(`ตำแหน่ง x/y ของ ${p.id ?? '?'} ไม่ใช่ตัวเลข`);
    if (p.x < 0 || p.x > PITCH.length || p.y < 0 || p.y > PITCH.width) {
      return bad(`ตำแหน่งของ ${p.id ?? '?'} อยู่นอกสนาม`);
    }
    if (p.team !== 'home' && p.team !== 'away') return bad('team ของนักเตะไม่ถูกต้อง');
  }
  if (!data.teams?.home?.formation || !isValidFormation(data.teams.home.formation)) {
    return bad('formation ของทีม home ไม่ถูกต้อง');
  }
  if (!data.ball || !isNum(data.ball.x) || !isNum(data.ball.y)) return bad('ข้อมูลลูกบอลเสีย');
  if (!isNum(data.turn) || data.turn < 1) return bad('turn ไม่ถูกต้อง');
  if (!isNum(data.clock) || data.clock < 0) return bad('clock ไม่ถูกต้อง');
  return { ok: true };
}

function bad(error) {
  return { ok: false, error };
}

// รวมข้อมูล save กลับเข้า state ที่มีอยู่ (สร้างจาก createInitialState มาก่อน)
export function applySave(state, data) {
  state.turn = data.turn;
  state.clock = data.clock;
  state.phase = data.phase === 'finished' ? 'finished' : 'planning';
  state.score = { home: data.score?.home ?? 0, away: data.score?.away ?? 0 };
  state.possessionTeam = data.possessionTeam === 'away' ? 'away' : 'home';
  Object.assign(state.teams.home, data.teams.home);
  Object.assign(state.teams.away, data.teams.away);

  // จับคู่นักเตะตาม id
  for (const saved of data.players) {
    const p = state.players.find((q) => q.id === saved.id);
    if (!p) continue;
    Object.assign(p, saved);
    p.pathHistory = [];
    p.isSelected = false;
    p._staminaWarned = false;
  }

  Object.assign(state.ball, data.ball);
  state.tacticalScores = data.tacticalScores || null;
  state.history = Array.isArray(data.history) ? data.history.slice(-10) : [];
  state.lastTurnEvents = [];
  state.assistant = { messages: [{ text: 'โหลดแผนเรียบร้อย', severity: 'info' }], ghosts: [] };
  state.sim = null;
  state.ui.selectedId = null;
  state.ui.dragId = null;
  state.ui.scoresDirty = true;
}

export function saveToLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(state)));
    return { ok: true };
  } catch (e) {
    return bad(`บันทึกไม่สำเร็จ: ${e.message}`);
  }
}

export function loadFromLocal(state) {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return bad(`อ่าน localStorage ไม่ได้: ${e.message}`);
  }
  if (!raw) return bad('ยังไม่มีข้อมูลที่บันทึกไว้');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad('ข้อมูลที่บันทึกไว้เสีย (JSON ไม่ถูกต้อง)');
  }
  const v = validateSave(data);
  if (!v.ok) return v;
  applySave(state, data);
  return { ok: true };
}

export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(serialize(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tactic-lab-turn${state.turn}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(state, file, callback) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      callback(bad('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'));
      return;
    }
    const v = validateSave(data);
    if (!v.ok) { callback(v); return; }
    applySave(state, data);
    callback({ ok: true });
  };
  reader.onerror = () => callback(bad('อ่านไฟล์ไม่สำเร็จ'));
  reader.readAsText(file);
}
