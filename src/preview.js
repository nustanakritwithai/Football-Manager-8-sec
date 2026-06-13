// P3: Preview Next 8 Seconds — "เห็นอนาคตก่อนกด Play" แบบ TacticAI
// รัน simulation บนสำเนาของ state (ไม่แตะของจริง) แล้วคืน ghost paths

import { deepClone } from './utils.js';
import { startSimulation, simTick } from './simulation.js';

// คืน { paths, ballPath, summary } หรือ null ถ้า preview ไม่ได้
export function runPreview(state) {
  if (state.phase !== 'planning' || state.pendingPenalty) return null;

  let copy;
  try {
    copy = deepClone(state);
  } catch {
    return null;
  }
  copy.sim = null;
  copy.phase = 'planning';
  copy.ui.preview = null;

  if (!startSimulation(copy)) return null;

  const ballPath = [{ x: copy.ball.x, y: copy.ball.y }];
  let guard = 0;
  let done = false;
  while (!done && guard < 200) {
    done = simTick(copy);
    guard++;
    if (guard % 4 === 0) ballPath.push({ x: copy.ball.x, y: copy.ball.y });
  }
  if (!done) return null;

  const last = copy.history.at(-1);
  const events = last?.events ?? [];

  return {
    paths: copy.players.map((p) => ({
      id: p.id,
      team: p.team,
      number: p.number,
      points: p.pathHistory,
      end: { x: p.x, y: p.y },
    })),
    ballPath,
    summary: {
      possessionEnd: last?.possessionEnd ?? copy.possessionTeam,
      ourShots: events.filter((e) => e.includes('Shot chance') && e.includes('Our')).length,
      theirShots: events.filter((e) => e.includes('Shot chance') && e.includes('Their')).length,
      goal: events.some((e) => e.startsWith('GOAL')),
    },
  };
}
