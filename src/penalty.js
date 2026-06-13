// P5: Penalty mini-game แบบ game theory (จาก Game Plan paper)
// จุดโทษ = เกม mixed strategy ระหว่างคนยิงกับผู้รักษาประตู

import { choice, rand } from './utils.js';
import { kickoff, recordEvent } from './state.js';
import { giveBall } from './ball.js';
import { teamPlayers } from './team.js';

export const PENALTY_DIRS = ['left', 'center', 'right'];
const DIR_TH = { left: 'ซ้าย', center: 'กลาง', right: 'ขวา' };

// ตั้งจุดโทษรอผู้เล่นเลือก (เรียกจาก simulation เมื่อโดนเสียบในกรอบ)
export function awardPenalty(state, team, takerId) {
  if (state.pendingPenalty) return false;
  state.pendingPenalty = { team, takerId };
  recordEvent(state, `PENALTY to ${team === 'home' ? 'us' : 'them'}!`);
  if (state.sim) state.sim.forceEnd = true; // จบเทิร์นทันที รอตัดสินจุดโทษ
  return true;
}

// AI เลือกมุมแบบ mixed strategy (ริมสองข้างถูกเลือกบ่อยกว่า)
export function aiPenaltyChoice() {
  const r = Math.random();
  return r < 0.4 ? 'left' : r < 0.6 ? 'center' : 'right';
}

// ตัดสินจุดโทษ: userDir คือมุมที่ผู้เล่นเลือก
// ถ้าทีมเราได้จุดโทษ → userDir = มุมยิง, GK คู่แข่งเป็น AI
// ถ้าคู่แข่งได้จุดโทษ → userDir = ทางพุ่งของ GK เรา, คนยิงเป็น AI
export function resolvePenalty(state, userDir) {
  const pen = state.pendingPenalty;
  if (!pen || !PENALTY_DIRS.includes(userDir)) return null;

  const weShoot = pen.team === 'home';
  const shotDir = weShoot ? userDir : aiPenaltyChoice();
  const diveDir = weShoot ? aiPenaltyChoice() : userDir;

  let outcome;
  if (shotDir === diveDir) {
    // เดาทางถูก: เซฟ 60% (กลาง 70%), ที่เหลือยังหลุดเป็นประตู/ออก
    const save = shotDir === 'center' ? 0.7 : 0.6;
    const r = Math.random();
    outcome = r < save ? 'saved' : r < save + 0.34 ? 'goal' : 'missed';
  } else {
    // เดาทางผิด: ประตู 85%
    outcome = Math.random() < 0.85 ? 'goal' : 'missed';
  }

  const shootTeam = pen.team;
  const defendTeam = shootTeam === 'home' ? 'away' : 'home';
  recordEvent(state, `Penalty ${outcome.toUpperCase()} — shot ${shotDir}, keeper dove ${diveDir}`);

  // จัดสนามใหม่หลังจุดโทษ
  for (const p of state.players) {
    p.x = p.baseX; p.y = p.baseY;
    p.targetX = p.baseX; p.targetY = p.baseY;
    p.intendedTarget = null;
    p.commandLocked = false;
    p.runType = null;
    p.runTarget = null;
    p.pathHistory = [];
  }

  if (outcome === 'goal') {
    state.score[shootTeam]++;
    kickoff(state, defendTeam);
  } else {
    const gk = teamPlayers(state, defendTeam).find((p) => p.role === 'GK');
    if (gk) giveBall(state, gk);
    else kickoff(state, defendTeam);
  }

  state.pendingPenalty = null;
  state.ui.scoresDirty = true;

  return {
    outcome,
    shotDir,
    diveDir,
    text: weShoot
      ? `จุดโทษของเรา: ยิง${DIR_TH[shotDir]} GK พุ่ง${DIR_TH[diveDir]} → ${outcome === 'goal' ? 'ประตู! ⚽' : outcome === 'saved' ? 'โดนเซฟ' : 'หลุดกรอบ'}`
      : `จุดโทษคู่แข่ง: เขายิง${DIR_TH[shotDir]} คุณพุ่ง${DIR_TH[diveDir]} → ${outcome === 'goal' ? 'เสียประตู' : outcome === 'saved' ? 'เซฟได้! 🧤' : 'เขายิงหลุดกรอบ'}`,
  };
}
