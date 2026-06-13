// เสียงประกอบบรรยากาศแมตช์ — สังเคราะห์ด้วย Web Audio API ล้วน (ไม่ใช้ไฟล์เสียงภายนอก)
// ปลอดภัยเมื่อ import ใน Node/headless (ทุกฟังก์ชัน no-op ถ้าไม่มี AudioContext)

const STORAGE = 'tactic-lab-sound-v1';
let ctx = null;
let masterGain = null;
let crowdSrc = null;
let crowdGain = null;
let enabled = true;

function hasAudio() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

export function isSoundOn() { return enabled; }

export function initAudio() {
  try {
    const v = localStorage.getItem(STORAGE);
    if (v !== null) enabled = v === '1';
  } catch { /* ignore */ }
  return enabled;
}

function ensureCtx() {
  if (!hasAudio()) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

// เรียกหลัง user gesture แรก (autoplay policy): resume + เริ่มเสียงฝูงชน
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  if (enabled) startCrowd();
}

export function setSoundEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(STORAGE, enabled ? '1' : '0'); } catch { /* ignore */ }
  if (enabled) unlockAudio();
  else stopCrowd();
  return enabled;
}

export function toggleSound() { return setSoundEnabled(!enabled); }

// ---------- helpers ----------

function noiseBuffer(c, seconds) {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// burst ของ noise ผ่าน filter + envelope (ใช้ทำเสียงปะทะ/เชียร์)
function noiseBurst({ dur = 0.3, type = 'bandpass', freq = 800, q = 1, peak = 0.3, attack = 0.01 }) {
  const c = ensureCtx(); if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone({ freq = 440, dur = 0.2, type = 'sine', peak = 0.25, glideTo = null }) {
  const c = ensureCtx(); if (!c) return;
  const o = c.createOscillator();
  o.type = type;
  const t = c.currentTime;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}

// ---------- crowd ambience (วน noise ผ่าน bandpass เบา ๆ) ----------

function startCrowd() {
  const c = ensureCtx(); if (!c || crowdSrc) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 2);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 440; bp.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = 0.045;
  src.connect(bp); bp.connect(g); g.connect(masterGain);
  src.start();
  crowdSrc = src; crowdGain = g;
}

function stopCrowd() {
  if (crowdSrc) { try { crowdSrc.stop(); } catch { /* ignore */ } crowdSrc.disconnect(); crowdSrc = null; }
  if (crowdGain) { crowdGain.disconnect(); crowdGain = null; }
}

// ดันเสียงฝูงชนขึ้นชั่วคราว (เฮ/ลุ้น) แล้วค่อยลดกลับ
function swellCrowd(level, dur) {
  if (!crowdGain || !ctx) return;
  const t = ctx.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
  crowdGain.gain.linearRampToValueAtTime(level, t + 0.12);
  crowdGain.gain.linearRampToValueAtTime(0.045, t + dur);
}

// ---------- SFX ----------

// นกหวีด: โทนสูงมี trill เล็กน้อย ('short' = ฟาวล์/เริ่มเล่น, 'long' = พักครึ่ง/จบเกม)
export function playWhistle(kind = 'short') {
  if (!enabled) return;
  const c = ensureCtx(); if (!c) return;
  const segs = kind === 'long' ? [0, 0.001, 0.45] : kind === 'double' ? [0, 0.18] : [0];
  const dur = kind === 'long' ? 0.5 : 0.22;
  for (const off of segs) {
    const o = c.createOscillator();
    o.type = 'square';
    const t = c.currentTime + off;
    o.frequency.setValueAtTime(2300, t);
    // trill ให้เหมือนนกหวีดจริง
    o.frequency.setValueAtTime(2500, t + 0.05);
    o.frequency.setValueAtTime(2300, t + 0.1);
    o.frequency.setValueAtTime(2500, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    o.connect(hp); hp.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // ลมเป่าเบา ๆ
  noiseBurst({ dur, type: 'highpass', freq: 2000, q: 0.5, peak: 0.05 });
}

// เสียงเฮประตู: noise swell ดังขึ้น + ฝูงชนเฮ
export function playCheer() {
  if (!enabled) return;
  const c = ensureCtx(); if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 1.8);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.02, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.25);
  g.gain.setValueAtTime(0.5, t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  // ความสว่างเพิ่มขึ้นตอนเฮ
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.linearRampToValueAtTime(1100, t + 0.3);
  src.connect(bp); bp.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t + 1.85);
  swellCrowd(0.22, 2.2);
}

// เสียงยิงบอล: thump ต่ำสั้น ๆ + click
export function playKick() {
  if (!enabled) return;
  tone({ freq: 150, glideTo: 70, dur: 0.12, type: 'sine', peak: 0.32 });
  noiseBurst({ dur: 0.05, type: 'lowpass', freq: 1200, peak: 0.18, attack: 0.001 });
}

// เซฟ/ปัด: เสียงปะทะแน่น ๆ
export function playSave() {
  if (!enabled) return;
  noiseBurst({ dur: 0.18, type: 'bandpass', freq: 350, q: 0.8, peak: 0.28 });
  swellCrowd(0.14, 0.8);
}

// ชนเสา/คาน: ปิ๊งโลหะ
export function playPost() {
  if (!enabled) return;
  tone({ freq: 1200, dur: 0.5, type: 'triangle', peak: 0.25, glideTo: 900 });
  swellCrowd(0.16, 1.0);
}

// ลุ้น/จังหวะอันตราย (เช่น big chance): ฝูงชนฮือ
export function playOoh() {
  if (!enabled) return;
  swellCrowd(0.16, 1.2);
}
