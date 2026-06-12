// P3: Guided defensive refinement — ปุ่ม "Adjust?" แบบ TacticAI
// hill-climbing: ทดลองขยับนักเตะรับทีละคนภายใน movement radius
// เพื่อลดโอกาสยิงของคู่แข่ง + counter risk แล้วเสนอเป็น ghost (โค้ชตัดสินใจเอง)

import { PITCH } from './config.js';
import { clamp, distP, rand } from './utils.js';
import { movementRadius } from './player.js';
import { teamPlayers, getPlayer } from './team.js';
import { analyze, shotProbability } from './tacticalAnalyzer.js';

const CANDIDATE_PLAYERS = 5;  // นักเตะที่ลองขยับ (ใกล้จุดอันตรายที่สุด)
const SAMPLES_PER_PLAYER = 14;
const MAX_SUGGESTIONS = 3;

// objective: ยิ่งต่ำยิ่งดี (มุมมองเกมรับของเรา)
function defensiveObjective(state) {
  const a = analyze(state);
  return (
    shotProbability(state, 'away') * 100 * 0.5 +
    a.scores.counterRisk * 0.3 +
    (100 - a.scores.defensiveStability) * 0.2
  );
}

export function suggestDefensiveAdjustments(state) {
  if (state.phase !== 'planning') return null;

  // จุดอันตราย: ตำแหน่งบอล (ถ้าคู่แข่งถือ) หรือ centroid ตัวรุกคู่แข่ง
  const away = teamPlayers(state, 'away');
  const threats = away.filter((p) => ['ST', 'LW', 'RW', 'AM'].includes(p.role));
  const threat = state.possessionTeam === 'away'
    ? { x: state.ball.x, y: state.ball.y }
    : {
        x: threats.reduce((s, p) => s + p.x, 0) / Math.max(threats.length, 1),
        y: threats.reduce((s, p) => s + p.y, 0) / Math.max(threats.length, 1),
      };

  const candidates = teamPlayers(state, 'home')
    .filter((p) => p.role !== 'GK' && state.ball.ownerPlayerId !== p.id)
    .sort((a, b) => distP(a, threat) - distP(b, threat))
    .slice(0, CANDIDATE_PLAYERS);

  const before = defensiveObjective(state);
  let current = before;
  const suggestions = [];
  const moved = new Map(); // id -> {x,y} เดิม (ขยับจริงชั่วคราวระหว่างค้นหา)

  // greedy: หา 1 การขยับที่ดีที่สุดต่อรอบ สูงสุด 3 รอบ
  for (let round = 0; round < MAX_SUGGESTIONS; round++) {
    let best = null;
    for (const p of candidates) {
      if (moved.has(p.id)) continue;
      const r = movementRadius(p) * 0.7;
      const ox = p.x, oy = p.y;
      for (let s = 0; s < SAMPLES_PER_PLAYER; s++) {
        const ang = rand(0, Math.PI * 2);
        const dd = rand(2, r);
        p.x = clamp(ox + Math.cos(ang) * dd, 1, PITCH.length - 1);
        p.y = clamp(oy + Math.sin(ang) * dd, 1, PITCH.width - 1);
        const score = defensiveObjective(state);
        if (score < current - 0.6 && (!best || score < best.score)) {
          best = { player: p, x: p.x, y: p.y, score };
        }
      }
      p.x = ox;
      p.y = oy;
    }
    if (!best) break;
    moved.set(best.player.id, { x: best.player.x, y: best.player.y });
    // ขยับจริงชั่วคราว เพื่อให้รอบถัดไปค้นหาต่อยอดจากการขยับนี้
    best.player.x = best.x;
    best.player.y = best.y;
    current = best.score;
    suggestions.push(best);
  }

  // คืนตำแหน่งจริงทั้งหมด
  for (const [id, orig] of moved) {
    const p = getPlayer(state, id);
    p.x = orig.x;
    p.y = orig.y;
  }

  if (!suggestions.length) return { ghosts: [], before, after: before, message: null };

  const after = current;
  return {
    before,
    after,
    ghosts: suggestions.map((s) => ({
      playerId: s.player.id,
      x: s.x,
      y: s.y,
      label: `ขยับ ${s.player.role}`,
    })),
    message: {
      severity: 'info',
      text: `Adjust: ขยับ ${suggestions.map((s) => `${s.player.role} #${s.player.number}`).join(', ')} ` +
        `ช่วยลดความเสี่ยงเกมรับจาก ${before.toFixed(0)} เหลือ ${after.toFixed(0)} ` +
        `(โอกาสยิงคู่แข่ง ${(shotProbability(state, 'away') * 100).toFixed(0)}%) — กด "ใช้คำแนะนำ AI" เพื่อสั่งวิ่งตามนี้`,
    },
  };
}

// แปลง ghost ของ assistant เป็นคำสั่งวิ่งจริง (clamp ตาม movement radius)
export function applyGhostsAsCommands(state) {
  let applied = 0;
  for (const g of state.assistant.ghosts || []) {
    const p = getPlayer(state, g.playerId);
    if (!p || p.team !== 'home') continue;
    const r = movementRadius(p);
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    const k = d > r ? r / d : 1;
    p.intendedTarget = {
      x: clamp(p.x + (g.x - p.x) * k, 0.5, PITCH.length - 0.5),
      y: clamp(p.y + (g.y - p.y) * k, 0.5, PITCH.width - 0.5),
    };
    p.commandType = 'move';
    p.commandLocked = true;
    applied++;
  }
  return applied;
}
