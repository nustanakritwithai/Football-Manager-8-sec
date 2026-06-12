// P4: Pitch Control + EPV (xT-lite) — รากฐานเชิงวิเคราะห์ที่ TacticAI ต่อยอดมา
//
// Pitch Control (Spearman): ความน่าจะเป็นที่แต่ละทีมจะคุมบอล ณ จุดใดจุดหนึ่ง
// ประเมินจาก "เวลาที่ผู้เล่นที่เร็วที่สุดของแต่ละทีมใช้วิ่งไปถึงจุดนั้น"
//
// EPV / xT-lite: มูลค่าของการมีบอล ณ ตำแหน่งหนึ่ง (โอกาสนำไปสู่ประตู)
// ใช้เป็นเกณฑ์ตัดสินใจ: การจ่าย/พาบอลที่ดี = เพิ่มมูลค่าตำแหน่งของบอล

import { PITCH } from './config.js';
import { clamp } from './utils.js';
import { maxSpeed } from './player.js';

export const CONTROL_GRID = { cols: 28, rows: 18 };
const REACTION_TIME = 0.4; // วินาที ก่อนเริ่มวิ่ง

export function cellCenter(c, r) {
  return {
    x: ((c + 0.5) / CONTROL_GRID.cols) * PITCH.length,
    y: ((r + 0.5) / CONTROL_GRID.rows) * PITCH.width,
  };
}

// คืน Float32Array ขนาด cols*rows ค่า 0..1 = ส่วนแบ่งการคุมพื้นที่ของทีม home
export function computePitchControl(state) {
  const { cols, rows } = CONTROL_GRID;
  const data = new Float32Array(cols * rows);
  const players = state.players;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, y } = cellCenter(c, r);
      let tHome = Infinity, tAway = Infinity;
      for (const p of players) {
        const d = Math.hypot(p.x - x, p.y - y);
        const t = REACTION_TIME + d / maxSpeed(p);
        if (p.team === 'home') { if (t < tHome) tHome = t; }
        else if (t < tAway) tAway = t;
      }
      // sigmoid ของส่วนต่างเวลา: ถึงก่อน = คุมพื้นที่
      data[r * cols + c] = 1 / (1 + Math.exp((tHome - tAway) / 0.45));
    }
  }
  return data;
}

// % พื้นที่ที่ home คุมในโซน: 'all' | 'middle' (x 35..70) | 'finalThird' (x > 70)
export function controlShare(control, zone = 'all') {
  const { cols, rows } = CONTROL_GRID;
  let sum = 0, n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x } = cellCenter(c, r);
      if (zone === 'middle' && (x < 35 || x > 70)) continue;
      if (zone === 'finalThird' && x <= 70) continue;
      sum += control[r * cols + c];
      n++;
    }
  }
  return n ? sum / n : 0.5;
}

// มูลค่าตำแหน่ง (xT-lite) สำหรับทีมที่บุกไปทางประตูของอีกฝ่าย
// สูงสุดบริเวณกลางหน้ากรอบเขตโทษ ลดลงตามระยะและมุมที่เบี่ยงจากกลาง
export function epvValue(x, y, team) {
  const gx = team === 'home' ? PITCH.length : 0;
  const d = Math.hypot(gx - x, 34 - y);
  const centrality = 0.35 + 0.65 * (1 - Math.abs(y - 34) / 34);
  return clamp(0.006 + Math.exp(-d / 23) * centrality, 0, 1);
}

// มูลค่าที่เพิ่มขึ้นถ้าบอลย้ายจาก (x1,y1) ไป (x2,y2)
export function epvGain(x1, y1, x2, y2, team) {
  return epvValue(x2, y2, team) - epvValue(x1, y1, team);
}
