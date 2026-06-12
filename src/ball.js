// ลูกบอล: การครองบอล การส่งบอล loose ball

import { COLORS, PITCH } from './config.js';
import { clamp, dist } from './utils.js';
import { toPx, toPy } from './player.js';

export function createBall() {
  return {
    x: PITCH.length / 2,
    y: PITCH.width / 2,
    ownerPlayerId: null,
    possessionTeam: null,
    velocityX: 0,
    velocityY: 0,
    isLoose: true,
    inFlight: false,        // กำลังถูกส่ง
    flightSpeed: 0,
    lastTouchTeam: null,
    targetX: PITCH.length / 2,
    targetY: PITCH.width / 2,
  };
}

export function giveBall(state, player) {
  const b = state.ball;
  b.ownerPlayerId = player.id;
  b.possessionTeam = player.team;
  b.isLoose = false;
  b.inFlight = false;
  b.velocityX = 0;
  b.velocityY = 0;
  b.lastTouchTeam = player.team;
  b.x = player.x;
  b.y = player.y;
  state.possessionTeam = player.team;
}

// เริ่มส่งบอลไปยังจุด (tx, ty) — ความแม่นจัดการใน simulation
export function startPass(state, passer, tx, ty) {
  const b = state.ball;
  b.ownerPlayerId = null;
  b.isLoose = false;
  b.inFlight = true;
  b.lastTouchTeam = passer.team;
  b.targetX = clamp(tx, 0.5, PITCH.length - 0.5);
  b.targetY = clamp(ty, 0.5, PITCH.width - 0.5);
  const d = dist(b.x, b.y, b.targetX, b.targetY);
  b.flightSpeed = clamp(13 + d * 0.35, 13, 26); // m/s
}

// เตะบอลทิ้ง / บอลหลุดเป็น loose ball มีความเร็วเริ่มต้น
export function makeLoose(state, vx, vy) {
  const b = state.ball;
  b.ownerPlayerId = null;
  b.inFlight = false;
  b.isLoose = true;
  b.velocityX = vx;
  b.velocityY = vy;
}

export function drawBall(ctx, ball) {
  const px = toPx(ball.x), py = toPy(ball.y);
  ctx.beginPath();
  ctx.arc(px, py, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
