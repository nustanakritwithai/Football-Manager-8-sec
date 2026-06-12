// AI Assistant แบบ rule-based: อ่าน scores + flags + events แล้วให้คำแนะนำสั้น actionable
// คืน { messages: [{text, severity}], ghosts: [{playerId, x, y, label}] }

import { clamp } from './utils.js';
import { teamPlayers } from './team.js';

export function generateAdvice(state, analysis, events, prevScores) {
  const { scores, flags } = analysis;
  const home = teamPlayers(state, 'home');
  const candidates = []; // { priority, text, severity, ghost? }

  // --- ปัญหา counter risk จาก fullback ดันสูง ---
  if (flags.rbHigh && scores.counterRisk > 55) {
    const rb = flags.rbHigh;
    candidates.push({
      priority: 90,
      severity: 'warn',
      text: `RB (#${rb.number}) ดันสูงเกินไป เปิดพื้นที่หลังแนวรับฝั่งขวา ถ้าคู่แข่งเปลี่ยนบอลเร็วคุณโดนสวนได้ ลองถอย RB ลงราว 8 เมตร`,
      ghost: { playerId: rb.id, x: clamp(rb.x - 8, 2, 100), y: rb.y, label: 'ถอย RB' },
    });
  }
  if (flags.lbHigh && scores.counterRisk > 55) {
    const lb = flags.lbHigh;
    candidates.push({
      priority: 88,
      severity: 'warn',
      text: `LB (#${lb.number}) ดันสูงเกินไป มีช่องว่างหลังแนวรับฝั่งซ้าย counter risk สูง ลองถอย LB ลงหรือให้ LW ลงมาช่วย cover`,
      ghost: { playerId: lb.id, x: clamp(lb.x - 8, 2, 100), y: lb.y, label: 'ถอย LB' },
    });
  }

  // --- แนวรับโดนเจาะ / ไม่มั่นคง ---
  if (scores.defensiveStability < 45) {
    if (flags.cbGap && flags.cbGap > 14) {
      const cbs = home.filter((p) => p.role === 'CB');
      candidates.push({
        priority: 85,
        severity: 'danger',
        text: `CB คู่กลางห่างกัน ${Math.round(flags.cbGap)} เมตร เปิดช่องกลางให้กองหน้าคู่แข่งวิ่งทะลุ ขยับ CB เข้าหากัน`,
        ghost: cbs[0] ? { playerId: cbs[0].id, x: cbs[0].x, y: (cbs[0].y + 34) / 2, label: 'หุบ CB' } : null,
      });
    } else if (flags.dmFarFromBack) {
      const dm = home.find((p) => p.role === 'DM');
      candidates.push({
        priority: 82,
        severity: 'danger',
        text: `DM อยู่ไกลจากแผงหลังเกินไป พื้นที่หน้าเขตโทษโล่ง ลองถอย DM ลงมาปิด half-space`,
        ghost: dm ? { playerId: dm.id, x: clamp(dm.x - 7, 2, 100), y: dm.y, label: 'ถอย DM' } : null,
      });
    } else {
      candidates.push({
        priority: 78,
        severity: 'danger',
        text: `เกมรับไม่มั่นคง (${scores.defensiveStability}/100) คู่แข่งเข้าใกล้กรอบเขตโทษได้ง่าย ลองลด defensive line หรือดึงกองกลางลงมาช่วย`,
      });
    }
  }
  if (flags.rbExposed && !flags.rbHigh) {
    candidates.push({
      priority: 75, severity: 'warn',
      text: 'มีตัวคู่แข่งซ้อนหลัง RB ของคุณ ระวังบอลทแยงเข้าโซนนั้น ให้ DM หรือ RW ช่วยถอยลงมา cover',
    });
  }
  if (flags.lbExposed && !flags.lbHigh) {
    candidates.push({
      priority: 74, severity: 'warn',
      text: 'มีตัวคู่แข่งซ้อนหลัง LB ของคุณ ถ้าโดนสวนฝั่งซ้ายจะอันตราย ขยับ LW ลงช่วยหรือเลื่อน CB ซ้ายออกไปเล็กน้อย',
    });
  }

  // --- midfield ---
  if (scores.midfieldControl < 42 && flags.cmSpread) {
    const cms = home.filter((p) => ['CM', 'AM'].includes(p.role));
    candidates.push({
      priority: 70,
      severity: 'warn',
      text: 'คุณเสีย midfield control เพราะกองกลางยืนห่างกันเกินไป ขยับ CM เข้าใกล้ DM เพื่อสร้างสามเหลี่ยมส่งบอล',
      ghost: cms[0] ? { playerId: cms[0].id, x: cms[0].x, y: (cms[0].y + 34) / 2, label: 'หุบ CM' } : null,
    });
  } else if (scores.midfieldControl < 38) {
    candidates.push({
      priority: 68, severity: 'warn',
      text: `กลางสนามเสียเปรียบจำนวนคน (${scores.midfieldControl}/100) คู่แข่งคุมจังหวะได้ ลองดึงปีกหรือ ST ลงมาเพิ่มตัวกลางสนาม`,
    });
  }

  // --- เกมรุก ---
  if (flags.stIsolated && scores.attackThreat < 45) {
    const am = home.find((p) => ['AM', 'CM'].includes(p.role));
    candidates.push({
      priority: 60,
      severity: 'info',
      text: 'ST แยกจากแดนกลางเกินไป ทำให้ attack threat ต่ำ ดัน AM หรือ CM ขึ้นไป support ใกล้ขึ้น',
      ghost: am ? { playerId: am.id, x: clamp(am.x + 9, 2, 102), y: am.y, label: 'ดันขึ้น support' } : null,
    });
  }
  if (flags.fewOptions && state.possessionTeam === 'home') {
    candidates.push({
      priority: 58, severity: 'info',
      text: 'ผู้ถือบอลของคุณมีตัวเลือกส่งบอลน้อย ขยับเพื่อนรอบบอลให้เปิดมุมรับในระยะ 10-18 เมตร',
    });
  }

  // --- compactness ---
  if (scores.compactness < 45) {
    candidates.push({
      priority: 55, severity: 'warn',
      text: `ทีมยืดเกินไป (compactness ${scores.compactness}/100) ช่องระหว่างไลน์ใหญ่ คู่แข่งสอดบอลผ่านได้ง่าย หุบทีมให้แต่ละแผงห่างกันไม่เกิน ~15 เมตร`,
    });
  }

  // --- stamina ---
  if (flags.tiredPlayers && flags.tiredPlayers.length && scores.fatigueLoad > 55) {
    const names = flags.tiredPlayers.slice(0, 2).map((p) => `${p.role} #${p.number}`).join(', ');
    candidates.push({
      priority: 50, severity: 'warn',
      text: `stamina ของ ${names} ลดเร็ว ถ้ายัง pressing หนักต่อ ช่วงท้ายจะวิ่งไม่ทัน ลองลด pressing level ลง`,
    });
  }

  // --- ข้อความเชิงบวกเมื่อการแก้เกมได้ผล ---
  if (prevScores) {
    if (prevScores.counterRisk - scores.counterRisk >= 12) {
      candidates.push({
        priority: 45, severity: 'good',
        text: `การปรับตำแหน่งช่วยลด counter risk จาก ${prevScores.counterRisk} เหลือ ${scores.counterRisk} เกมรับสมดุลขึ้น`,
      });
    }
    if (scores.midfieldControl - prevScores.midfieldControl >= 12) {
      candidates.push({
        priority: 44, severity: 'good',
        text: `midfield control ดีขึ้นจาก ${prevScores.midfieldControl} เป็น ${scores.midfieldControl} คุมจังหวะกลางสนามได้มากขึ้น`,
      });
    }
    if (scores.attackThreat - prevScores.attackThreat >= 12) {
      candidates.push({
        priority: 43, severity: 'good',
        text: `attack threat เพิ่มจาก ${prevScores.attackThreat} เป็น ${scores.attackThreat} ทีมเข้าใกล้ประตูคู่แข่งมากขึ้น`,
      });
    }
  }

  // --- อ่าน event เด่นจากเทิร์นที่ผ่านมา ---
  if (events.some((e) => e.startsWith('GOAL'))) {
    candidates.push({ priority: 99, severity: 'good', text: 'มีประตูเกิดขึ้นในจังหวะที่ผ่านมา! ดู event log ด้านล่าง', });
  } else if (events.some((e) => e.includes('Shot chance') && e.includes('Our'))) {
    candidates.push({ priority: 47, severity: 'good', text: 'คุณสร้างโอกาสยิงได้ในเทิร์นที่แล้ว รักษาโครงสร้าง support รอบกรอบเขตโทษไว้', });
  } else if (events.some((e) => e.includes('Shot chance') && e.includes('Their'))) {
    candidates.push({ priority: 80, severity: 'danger', text: 'คู่แข่งได้จังหวะยิงในเทิร์นที่แล้ว เช็กว่าใครปล่อยให้ผู้ยิงโล่ง แล้วปิดพื้นที่นั้นก่อนเทิร์นหน้า', });
  }
  if (events.some((e) => e.includes('Counter risk: we lost ball'))) {
    candidates.push({ priority: 72, severity: 'warn', text: 'คุณเสียบอลตอนมีผู้เล่นดันสูงหลายคน โครงสร้างกันสวนบางมาก เก็บ DM หรือ FB หนึ่งข้างไว้ต่ำเสมอ', });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const top = candidates.slice(0, 3);

  if (!top.length) {
    top.push({
      severity: 'good',
      text: `โครงสร้างทีมโอเค ไม่มีจุดอ่อนใหญ่ตอนนี้ — ครองบอล: ${state.possessionTeam === 'home' ? 'เรา' : 'คู่แข่ง'} ลองหาจังหวะดันเกมรุกเพิ่ม`,
    });
  }

  return {
    messages: top.map((c) => ({ text: c.text, severity: c.severity })),
    ghosts: top.filter((c) => c.ghost).map((c) => c.ghost),
  };
}
