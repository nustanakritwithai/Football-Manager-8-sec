// ลูกบอล: การครองบอล การส่งบอล loose ball + P2.7 Ball Physics Lite
// บอลเป็นวัตถุกลม: velocity (x,y,z), spin, gravity, friction, bounce

import {
  COLORS, PITCH, TICK_DT,
  BALL_RADIUS, BALL_BOUNCINESS, BALL_GROUND_FRICTION, BALL_AIR_DRAG,
  BALL_GRAVITY, BALL_BOUNCE_FRICTION, BALL_MIN_BOUNCE_VZ, BALL_ROLL_STOP_SPEED,
} from './config.js';
import { clamp, dist } from './utils.js';
import { toPx, toPy } from './player.js';

export function createBall() {
  return {
    x: PITCH.length / 2,
    y: PITCH.width / 2,
    z: 0,                   // ความสูงจากพื้น (2.5D) สำหรับบอลลอย/เด้ง
    ownerPlayerId: null,
    possessionTeam: null,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,           // ความเร็วแนวตั้ง (บอลลอย/เด้ง)
    spin: 0,                // แรงหมุนรวม — เพิ่ม curve/ความไม่แน่นอนเล็กน้อย
    radius: BALL_RADIUS,
    bounciness: BALL_BOUNCINESS,
    friction: BALL_GROUND_FRICTION,
    airDrag: BALL_AIR_DRAG,
    isLoose: true,
    inFlight: false,        // กำลังถูกส่ง (โมเดล pass เดิม)
    flightSpeed: 0,
    lastTouchTeam: null,
    lastTouchPlayerId: null,
    targetX: PITCH.length / 2,
    targetY: PITCH.width / 2,
    ballMode: 'owned',      // owned|rolling|loose|inFlight|bouncing|deflected|shot|rebound|parried
    trail: [],              // ประวัติตำแหน่งสั้น ๆ สำหรับวาด trail (ไม่สำคัญต่อ logic)
  };
}

// เติม field ฟิสิกส์ให้ครบ (ใช้ตอนโหลด save เก่าที่ยังไม่มี z/velocityZ/spin/ballMode)
export function ensureBallPhysics(b) {
  if (b.z == null) b.z = 0;
  if (b.velocityZ == null) b.velocityZ = 0;
  if (b.spin == null) b.spin = 0;
  if (b.radius == null) b.radius = BALL_RADIUS;
  if (b.bounciness == null) b.bounciness = BALL_BOUNCINESS;
  if (b.friction == null) b.friction = BALL_GROUND_FRICTION;
  if (b.airDrag == null) b.airDrag = BALL_AIR_DRAG;
  if (b.lastTouchPlayerId === undefined) b.lastTouchPlayerId = null;
  if (!b.ballMode) b.ballMode = b.isLoose ? 'loose' : b.inFlight ? 'inFlight' : 'owned';
  if (!Array.isArray(b.trail)) b.trail = [];
  return b;
}

export function giveBall(state, player) {
  const b = state.ball;
  b.ownerPlayerId = player.id;
  b.possessionTeam = player.team;
  b.isLoose = false;
  b.inFlight = false;
  b.velocityX = 0;
  b.velocityY = 0;
  b.velocityZ = 0;
  b.z = 0;
  b.spin = 0;
  b.ballMode = 'owned';
  b.lastTouchTeam = player.team;
  b.lastTouchPlayerId = player.id;
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
  b.z = 0;
  b.velocityZ = 0;
  b.ballMode = 'inFlight';
  b.lastTouchTeam = passer.team;
  b.lastTouchPlayerId = passer.id;
  b.targetX = clamp(tx, 0.5, PITCH.length - 0.5);
  b.targetY = clamp(ty, 0.5, PITCH.width - 0.5);
  const d = dist(b.x, b.y, b.targetX, b.targetY);
  b.flightSpeed = clamp(13 + d * 0.35, 13, 26); // m/s
}

// เตะบอลทิ้ง / บอลหลุดเป็น loose ball มีความเร็วเริ่มต้น (+ ความสูงถ้าโด่ง)
export function makeLoose(state, vx, vy, vz = 0, mode = 'loose') {
  const b = state.ball;
  b.ownerPlayerId = null;
  b.inFlight = false;
  b.isLoose = true;
  b.velocityX = vx;
  b.velocityY = vy;
  b.velocityZ = vz;
  b.ballMode = mode;
}

// สร้าง loose ball ที่จุดปัจจุบัน (alias เชิงความหมายของ makeLoose)
export function createLooseBall(state, vx, vy, vz = 0, mode = 'loose') {
  makeLoose(state, vx, vy, vz, mode);
}

// สร้าง rebound: ตั้งตำแหน่ง + ปล่อยเป็น loose ball ที่เด้งกระเด็น
export function createRebound(state, fromX, fromY, vx, vy, vz = 0) {
  const b = state.ball;
  b.x = clamp(fromX, 0.5, PITCH.length - 0.5);
  b.y = clamp(fromY, 0.5, PITCH.width - 0.5);
  makeLoose(state, vx, vy, vz, 'rebound');
}

// P2.8: บันทึกผู้สัมผัสบอลล่าสุด (ใช้ตัดสิน throw-in/goal kick/corner)
export function markLastTouch(ball, player) {
  ball.lastTouchPlayerId = player.id;
  ball.lastTouchTeam = player.team;
}

// P2.9: บันทึกผู้ยิงเป็นผู้สัมผัสล่าสุด (alias เชิงความหมาย)
export function markShotLastTouch(ball, shooter) {
  markLastTouch(ball, shooter);
  ball.ballMode = 'shot';
}

// P2.9: สร้างลูก rebound จากการยิง (เซฟ/บล็อก/ชนเสา) เป็น loose ball
export function createReboundBall(state, x, y, vx, vy, vz = 0) {
  createRebound(state, x, y, vx, vy, vz);
}

// P2.8: วางบอลนิ่งที่จุด restart แล้วหยุดความเร็วทั้งหมด
export function placeBallAtRestartSpot(ball, x, y) {
  ball.x = x;
  ball.y = y;
  ball.z = 0;
  ball.velocityX = 0;
  ball.velocityY = 0;
  ball.velocityZ = 0;
  ball.spin = 0;
  ball.inFlight = false;
  ball.isLoose = false;
  ball.ballMode = 'owned';
  ball.trail = [];
}

// ---------- physics primitives (pure: ทำงานกับ ball object เท่านั้น) ----------

export function applyBallGravity(b, dt = TICK_DT) {
  b.velocityZ -= BALL_GRAVITY * dt;
  b.z += b.velocityZ * dt;
}

export function applyAirDrag(b) {
  b.velocityX *= b.airDrag;
  b.velocityY *= b.airDrag;
}

export function applyBallFriction(b) {
  b.velocityX *= b.friction;
  b.velocityY *= b.friction;
}

// บอลแตะพื้นแล้วเด้ง — คืน true ถ้าเด้งจริง
export function handleGroundBounce(b) {
  if (b.z <= 0 && b.velocityZ < 0) {
    b.z = 0;
    if (-b.velocityZ < BALL_MIN_BOUNCE_VZ) { b.velocityZ = 0; return false; }
    b.velocityZ = -b.velocityZ * b.bounciness;
    b.velocityX *= BALL_BOUNCE_FRICTION;
    b.velocityY *= BALL_BOUNCE_FRICTION;
    b.ballMode = 'bouncing';
    return true;
  }
  return false;
}

// integrate บอล loose หนึ่ง tick (gravity/drag/friction/bounce/spin) — คืน true ถ้าเด้ง
export function stepLooseBall(b) {
  const airborne = b.z > 0.001 || b.velocityZ !== 0;
  if (airborne) {
    applyBallGravity(b);
    applyAirDrag(b);
  } else {
    applyBallFriction(b);
  }

  // spin → curve เบา ๆ ให้บอลไม่ตรงเป๊ะ
  if (b.spin) {
    b.velocityY += b.spin * 0.015;
    b.spin *= 0.94;
    if (Math.abs(b.spin) < 0.02) b.spin = 0;
  }

  b.x += b.velocityX * TICK_DT;
  b.y += b.velocityY * TICK_DT;

  const bounced = handleGroundBounce(b);
  if (b.z < 0) b.z = 0;

  // หยุดเมื่อบอลกลิ้งช้ามากและอยู่ติดพื้น (ต้องไม่กำลังเด้งขึ้น — กัน kill bounce)
  if (b.z <= 0.02 && Math.abs(b.velocityZ) < 0.01
      && Math.hypot(b.velocityX, b.velocityY) < BALL_ROLL_STOP_SPEED) {
    b.velocityX = 0;
    b.velocityY = 0;
    b.velocityZ = 0;
  }
  return bounced;
}

// สะท้อน vector ความเร็วรอบ normal (player→ball) + สุ่ม noise = มุมแฉลบ
export function reflectVelocity(vx, vy, nx, ny, noise = 0) {
  const nlen = Math.hypot(nx, ny) || 1;
  const ux = nx / nlen, uy = ny / nlen;
  const d = vx * ux + vy * uy;
  let rx = vx - 2 * d * ux;
  let ry = vy - 2 * d * uy;
  if (noise) {
    const a = (Math.random() * 2 - 1) * noise;
    const c = Math.cos(a), s = Math.sin(a);
    const tx = rx * c - ry * s;
    const ty = rx * s + ry * c;
    rx = tx; ry = ty;
  }
  return { x: rx, y: ry };
}

// ---------- การวาด ----------

export function drawBall(ctx, ball) {
  const px = toPx(ball.x), py = toPy(ball.y);
  const z = ball.z || 0;

  // เงาบนพื้นเมื่อบอลลอย (z > 0) — ช่วยให้อ่านความสูงได้
  if (z > 0.1) {
    const shadowR = 4.5 / (1 + z * 0.18);
    ctx.beginPath();
    ctx.ellipse(px, py, shadowR + 1.5, shadowR, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
  }

  // ตัวบอล: ยกขึ้นตามความสูง + ขยายเล็กน้อยเมื่อลอย
  const lift = z * 2.0;
  const r = 4.5 + Math.min(z * 0.25, 2);
  ctx.beginPath();
  ctx.arc(px, py - lift, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
