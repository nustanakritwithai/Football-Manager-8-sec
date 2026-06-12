// วาดสนามฟุตบอล 2D top-down

import { CANVAS_W, CANVAS_H, COLORS, MARGIN, PITCH, SCALE } from './config.js';
import { toPx, toPy } from './player.js';

export function drawPitch(ctx) {
  // พื้นหญ้าลายแถบ
  ctx.fillStyle = COLORS.pitch;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = COLORS.pitchAlt;
  const stripeW = PITCH.length * SCALE / 14;
  for (let i = 0; i < 14; i += 2) {
    ctx.fillRect(MARGIN + i * stripeW, MARGIN, stripeW, PITCH.width * SCALE);
  }

  // กริดจางๆ ช่วยอ่านตำแหน่ง
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= PITCH.length; x += 10.5) {
    line(ctx, toPx(x), toPy(0), toPx(x), toPy(PITCH.width));
  }
  for (let y = 0; y <= PITCH.width; y += 8.5) {
    line(ctx, toPx(0), toPy(y), toPx(PITCH.length), toPy(y));
  }

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;

  // เส้นขอบสนาม
  ctx.strokeRect(toPx(0), toPy(0), PITCH.length * SCALE, PITCH.width * SCALE);

  // เส้นกลางสนาม + วงกลม
  line(ctx, toPx(PITCH.length / 2), toPy(0), toPx(PITCH.length / 2), toPy(PITCH.width));
  circle(ctx, toPx(PITCH.length / 2), toPy(PITCH.width / 2), 9.15 * SCALE);
  dot(ctx, toPx(PITCH.length / 2), toPy(PITCH.width / 2));

  // เขตโทษ + กรอบ 6 หลา + จุดโทษ ทั้งสองฝั่ง
  drawBox(ctx, 'left');
  drawBox(ctx, 'right');

  // ประตู
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  line(ctx, toPx(0) - 5, toPy(34 - 3.66), toPx(0) - 5, toPy(34 + 3.66));
  line(ctx, toPx(PITCH.length) + 5, toPy(34 - 3.66), toPx(PITCH.length) + 5, toPy(34 + 3.66));
}

function drawBox(ctx, side) {
  const left = side === 'left';
  const gx = left ? 0 : PITCH.length;
  const dir = left ? 1 : -1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.line;

  // เขตโทษ 16.5m ลึก กว้าง 40.3m
  ctx.strokeRect(
    toPx(left ? 0 : PITCH.length - 16.5), toPy(34 - 20.15),
    16.5 * SCALE, 40.3 * SCALE
  );
  // กรอบ 6 หลา 5.5m ลึก กว้าง 18.32m
  ctx.strokeRect(
    toPx(left ? 0 : PITCH.length - 5.5), toPy(34 - 9.16),
    5.5 * SCALE, 18.32 * SCALE
  );
  // จุดโทษ
  dot(ctx, toPx(gx + dir * 11), toPy(34));
  // โค้งหน้าเขตโทษ
  ctx.beginPath();
  const a = left ? -0.295 * Math.PI : 0.705 * Math.PI;
  const b = left ? 0.295 * Math.PI : 1.295 * Math.PI;
  ctx.arc(toPx(gx + dir * 11), toPy(34), 9.15 * SCALE, a, b);
  ctx.stroke();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function dot(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.line;
  ctx.fill();
}
