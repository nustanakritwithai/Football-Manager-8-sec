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

  // --- P2: clustering / spacing ---
  if (flags.clusters?.length) {
    const c = flags.clusters[0];
    const zoneY = c.y < 23 ? 'ซ้าย' : c.y > 45 ? 'ขวา' : 'กลาง';
    const zoneX = c.x < 35 ? 'แดนหลัง' : c.x > 70 ? 'แดนหน้า' : 'กลางสนาม';
    candidates.push({
      priority: 76, severity: 'warn',
      text: `ผู้เล่น ${c.count} คน (${c.roles.join(', ')}) กองกันโซน${zoneX}ฝั่ง${zoneY} เสีย spacing และ passing option ลองถ่างออกหรือสั่ง runWide`,
    });
  }

  // --- P2: ping-pong / no progression ---
  if (flags.pingPong) {
    candidates.push({
      priority: 66, severity: 'warn',
      text: 'ทีมส่งบอลวนระหว่างผู้เล่นกลุ่มเดิมโดยไม่พาบอลขึ้นหน้า ลองเปิดบอลไปฝั่งที่มีพื้นที่หรือให้กองกลางพาบอลขึ้นเอง',
    });
  } else if (flags.noProgression && state.possessionTeam === 'home') {
    candidates.push({
      priority: 62, severity: 'info',
      text: 'หลายจังหวะล่าสุดบอลไม่ขยับเข้าใกล้ประตูคู่แข่งเลย หาช่องส่งเข้า half-space หรือ switch play ไปฝั่งไกล',
    });
  }

  // --- P2: overpassing / ไม่มี off-ball run ---
  if (flags.overPassing) {
    candidates.push({
      priority: 57, severity: 'info',
      text: 'เทิร์นที่แล้วทีมเอาแต่จ่ายบอลทั้งที่มีพื้นที่ให้พาบอลขึ้นหน้าเอง CM/AM ควร carry เข้าพื้นที่ว่างมากขึ้น',
    });
  }
  if (flags.noOffBallRuns) {
    candidates.push({
      priority: 56, severity: 'info',
      text: 'ทีมมีบอลแต่ไม่มีใครวิ่งทำทางเลย กองหน้ากับปีกควรวิ่งเข้าพื้นที่ว่างเพื่อเปิดเกม',
    });
  }

  // --- P2: เสีย width ---
  if (flags.lostWidth) {
    const side = flags.lostWidth === 'both' ? 'ทั้งสองฝั่ง' : flags.lostWidth === 'left' ? 'ฝั่งซ้าย' : 'ฝั่งขวา';
    const winger = home.find((p) => (flags.lostWidth === 'right' ? p.role === 'RW' : p.role === 'LW'));
    candidates.push({
      priority: 59, severity: 'warn',
      text: `ทีมเสียความกว้าง${side} ปีกหุบเข้ากลางหมดทำให้แนวรับคู่แข่งหุบตาม ลองดันปีกออกริมเส้นเพื่อเปิด passing lane`,
      ghost: winger ? {
        playerId: winger.id,
        x: winger.x,
        y: winger.role === 'LW' ? 8 : 60,
        label: 'ถ่างออก',
      } : null,
    });
  }

  // --- P2: ผู้ถือบอลโดดเดี่ยว ---
  if (flags.carrierIsolated) {
    const c = flags.carrierIsolated;
    candidates.push({
      priority: 64, severity: 'warn',
      text: `${c.role} (#${c.number}) ถือบอลแบบโดดเดี่ยว ไม่มีเพื่อนในระยะ 14 เมตร เสี่ยงเสียบอล ขยับ CM/AM เข้าไป support`,
    });
  }

  // --- P2: หลุด role zone ---
  if (flags.roleViolations?.length) {
    const v = flags.roleViolations[0];
    if (['CB', 'DM'].includes(v.role)) {
      candidates.push({
        priority: 71, severity: 'warn',
        text: `${v.role} (#${v.number}) หลุดออกจากโซนรับของตัวเองไกลมาก แนวรับเสีย shape ปล่อยให้เขากลับตำแหน่งหรือสั่งถอยกลับ`,
      });
    }
  }

  // --- P2.6: finishing / end product ---
  if (flags.missedShotOpportunity) {
    candidates.push({
      priority: 73, severity: 'warn',
      text: flags.overCarryInBox
        ? 'มีจังหวะยิงในกรอบแต่ผู้ถือบอล carry ต่อจนโดนบีบ — ถึง must-shoot zone แล้วต้องจบสกอร์ ไม่ใช่พาบอลสวย'
        : 'ผู้ถือบอลอยู่ในมุมยิงดีแต่ไม่ยอมยิง ทำให้เสียโอกาส — เพิ่ม shot urgency ใน final third',
    });
  }
  if (flags.noEndProduct) {
    candidates.push({
      priority: 63, severity: 'info',
      text: 'ทีมพาบอลถึง final third ได้หลายเทิร์นแต่ไม่มี end product (ยิง/cutback/ทะลุช่อง) ลองดันตัวเติมเข้ากรอบให้มีเป้ารับบอลจังหวะสุดท้าย',
    });
  }
  if (flags.goodCutback) {
    candidates.push({
      priority: 42, severity: 'good',
      text: 'จังหวะ cutback จากริมกรอบหาตัวกลางเขตโทษทำได้ถูกต้อง — มุมแคบอย่าฝืนยิง รักษา pattern นี้ไว้',
    });
  }

  // --- P2.7: cross / early ball ---
  if (flags.crossesWasted) {
    candidates.push({
      priority: 61, severity: 'warn',
      text: 'เปิดบอลเข้ากรอบหลายครั้งแต่แพ้ลูกกลางอากาศตลอด — เพิ่มตัวเติมเข้ากรอบ (ST/AM/ปีกเสาไกล) ก่อนเปิด หรือเปลี่ยนไปเจาะด้วย cutback แทน',
    });
  } else if (flags.crossWon) {
    candidates.push({
      priority: 41, severity: 'good',
      text: 'ลูกเปิดเข้ากรอบมีตัวรอชนะลูกกลางอากาศได้ — width ของทีมเริ่มสร้างอันตรายจริง',
    });
  }

  // --- P2.7: ball physics / second ball / rebound / first touch ---
  if (flags.reboundChanceCreated) {
    candidates.push({
      priority: flags.reboundChanceMissed ? 69 : 46,
      severity: flags.reboundChanceMissed ? 'warn' : 'good',
      text: flags.reboundChanceMissed
        ? 'ลูกยิงของคุณโดนบล็อก/ปัดแล้วบอลกระเด็นกลับเข้าเขตโทษ แต่คู่แข่งเก็บ second ball ไปก่อน — ดัน ST/AM ยืนรอเก็บตกหน้าเขตโทษ อย่าให้ค้างหลังบอล'
        : 'ลูกยิงของคุณถูกปัด/บล็อกแล้วบอลกระเด็นกลับเข้าเขตโทษ — รักษาตัวเติมซ้ำดาบสองให้พร้อมวิ่งเข้าทุกครั้งที่ยิง',
    });
  }
  if (flags.dangerousRebound) {
    candidates.push({
      priority: 81, severity: 'danger',
      text: 'GK คุณปัด/บอลเด้งในกรอบเขตโทษเรา เสี่ยงโดนซ้ำดาบสอง — สั่ง CB/DM เก็บ second ball หน้าปากประตู อย่ามองแต่ผู้ยิงคนแรก',
    });
  }
  if (flags.secondBallLost) {
    candidates.push({
      priority: 65, severity: 'warn',
      text: 'ทีมคุณแพ้ second ball บ่อย เพราะ CM/DM อยู่ไกลจุดตกบอลเกินไป — ให้กองกลางยืนใกล้รัศมีบอลกระเด็นและพร้อมพุ่งเข้าก่อน',
    });
  } else if (flags.secondBallWon) {
    candidates.push({
      priority: 40, severity: 'good',
      text: 'ทีมคุณชนะ second ball หน้าเขตโทษ — การยืนตำแหน่งรอบจุดตกบอลกำลังได้ผล รักษาโครงสร้างนี้ไว้',
    });
  }
  if (flags.dangerousDeflection) {
    candidates.push({
      priority: 70, severity: 'warn',
      text: 'กองหลังเคลียร์/บอลแฉลบไม่ขาดในแดนหลัง บอลกระเด็นเข้ากลางสนามให้คู่แข่งสวน — เคลียร์ให้ไกลและกว้างขึ้น หรือเก็บ DM ไว้คอยตัด second ball',
    });
  }
  if (flags.poorFirstTouch && state.possessionTeam !== 'home') {
    candidates.push({
      priority: 54, severity: 'info',
      text: 'ผู้รับบอลของคุณจับบอลแรกไม่ดีตอนโดนบีบ/บอลแรง ทำให้บอลหลุด — ลองจ่ายบอลเรียบเข้าเท้าในจังหวะที่ผู้รับมีพื้นที่มากขึ้น',
    });
  }

  // --- P2.8: set piece / foul / restart ---
  if (flags.pendingRestart && flags.pendingRestart.team === 'home') {
    const tips = {
      corner: 'ได้เตะมุม — ดัน CB ตัวสูงกับ ST เข้า box เปิดเสาไกล/เสาใกล้ และเก็บ DM ไว้คุม second ball หน้ากรอบ',
      freeKick: 'ได้ฟรีคิก — ถ้าใกล้กรอบลองยิงตรงหรือเปิดเข้า box, ถ้าไกลจ่ายสั้นตั้งเกมแล้วค่อยเจาะ',
      goalKick: 'ลูกตั้งเตะจากประตู — ถ้าคู่แข่งกดสูงให้เปิดยาวหา ST/ปีก, ถ้าไม่กดเล่นสั้นออกจากกรอบ',
      throwIn: 'ทุ่มเข้าเล่น — หาตัวรับใกล้ริมเส้นแล้วต่อบอลเร็ว อย่าทุ่มเข้ากลางที่คู่แข่งคุมอยู่',
      penalty: 'ได้จุดโทษ! เลือกมุมยิงให้เด็ดขาด',
    };
    candidates.push({ priority: 86, severity: 'good', text: tips[flags.pendingRestart.type] || 'เริ่มเล่นลูกตั้งเตะ' });
  }
  if (flags.concededPenalty) {
    candidates.push({ priority: 95, severity: 'danger', text: 'เสียจุดโทษจากการฟาวล์ในกรอบ — ระวังการเข้าปะทะในเขตโทษ อย่าเสียบสุ่มเสี่ยงเมื่อยังคุมตำแหน่งได้' });
  }
  if (flags.concededCornerShot) {
    candidates.push({ priority: 79, severity: 'danger', text: 'เสียเตะมุมแล้วโดนยิงต่อ — ตั้งรับ corner ไม่มีคนคุมเสาไกล/หน้ากรอบ จัดคนมาร์กตัวสูงและคุม zone หน้าประตูให้ครบ' });
  } else if (flags.concededCorner) {
    candidates.push({ priority: 58, severity: 'warn', text: 'เสียเตะมุมบ่อย — เช็ก rest defence ตอนเปิดเกมรุก อย่าให้ fullback โดนเจาะจนต้องสกัดออกหลัง' });
  }
  if (flags.cornerCreatedShot) {
    candidates.push({ priority: 44, severity: 'good', text: 'เตะมุมของเราสร้างโอกาสยิงได้ — แพตเทิร์นเติมคนเข้า box กำลังได้ผล รักษาไว้' });
  }
  if (flags.foulProne) {
    candidates.push({ priority: 64, severity: 'warn', text: 'ทีมเราเสียฟาวล์เยอะ เสี่ยงใบเหลือง/ฟรีคิกอันตราย — ลดการเข้าปะทะแบบสุ่มเสี่ยง เน้นยืนตำแหน่งปิดพื้นที่แทนการเสียบ' });
  } else if (flags.gotFreeKick || flags.gotPenalty) {
    candidates.push({ priority: 41, severity: 'info', text: 'ได้ลูกตั้งเตะในแดนคู่แข่ง — ใช้จังหวะ set piece ให้เป็นโอกาสจบสกอร์ ดันตัวเป้าเข้ากรอบก่อนเล่น' });
  }

  // --- P3: เคยเจอสถานการณ์คล้ายกันมาก่อน (similar situation retrieval) ---
  if (flags.similarTurn?.danger) {
    const s = flags.similarTurn;
    candidates.push({
      priority: 67, severity: 'warn',
      text: `รูปเกมตอนนี้คล้ายเทิร์น ${s.turnNumber}${s.mirrored ? ' (สลับฝั่งกระจก)' : ''} ที่คุณโดนคู่แข่งสร้างโอกาส — อย่าแก้เกมแบบเดิม ลองเปลี่ยนโครงสร้างก่อนกด Play`,
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
