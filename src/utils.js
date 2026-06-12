// helper functions ทั่วไป

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distP(a, b) {
  return dist(a.x, a.y, b.x, b.y);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// ระยะจากจุด p ถึงส่วนของเส้น a→b (ใช้เช็ก passing lane)
export function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

export function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
