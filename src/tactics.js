// P3.0: หน้าปรับแผน (Tactics) แบบ Football Manager — modal เต็มจอ
// ซ้าย: สนามลากตำแหน่ง → ตำแหน่งที่วาง = baseX/baseY (ตำแหน่งหลักที่นักเตะวิ่งอ้างอิง)
// ขวา: รายชื่อ (ตัวจริง + ตัวสำรอง) ดูรายละเอียด + เปลี่ยนตัว

import { CANVAS_W, CANVAS_H, SCALE, MARGIN, PITCH, COLORS } from './config.js';
import { clamp } from './utils.js';
import { drawPitch } from './pitch.js';
import { toPx, toPy } from './player.js';
import { teamPlayers, substitute, getPlayer } from './team.js';
import { applyFormation } from './state.js';
import { FORMATION_NAMES } from './formations.js';

let els = {};
let ctx = null;
let dragId = null;
let selectedStarterId = null; // ตัวจริงที่เลือกไว้รอจับคู่เปลี่ยนตัว
let stateRef = null;
let onCloseCb = null;

const HIT_R = 14;
// จำกัดบริเวณวาง base: ฝั่งเราเป็นหลัก แต่ดันได้ถึงราวกลางสนามคู่แข่ง
const X_MIN = 2, X_MAX = PITCH.length * 0.64;

export function initTactics(state, handlers = {}) {
  stateRef = state;
  onCloseCb = handlers.onClose;
  for (const id of [
    'tacticsModal', 'tacticsCanvas', 'tacticsFormation', 'tacticsSubs',
    'tacticsClose', 'tacticsReset', 'starterList', 'benchList', 'tacticsHint',
  ]) els[id] = document.getElementById(id);

  const canvas = els.tacticsCanvas;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx = canvas.getContext('2d');

  for (const name of FORMATION_NAMES) {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    els.tacticsFormation.appendChild(opt);
  }
  els.tacticsFormation.addEventListener('change', () => {
    applyFormation(state, els.tacticsFormation.value);
    selectedStarterId = null;
    render();
  });

  els.tacticsClose.addEventListener('click', close);
  els.tacticsReset.addEventListener('click', () => {
    applyFormation(state, state.teams.home.formation);
    selectedStarterId = null;
    render();
  });

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}

export function openTactics() {
  if (!stateRef) return;
  if (stateRef.phase === 'simulating') return; // ปรับแผนได้เฉพาะตอนไม่จำลอง
  selectedStarterId = null;
  dragId = null;
  els.tacticsFormation.value = stateRef.teams.home.formation;
  els.tacticsModal.classList.add('open');
  render();
}

export function close() {
  els.tacticsModal.classList.remove('open');
  onCloseCb?.();
}

export function isTacticsOpen() {
  return els.tacticsModal?.classList.contains('open');
}

// ---------- drag base positions ----------

function toField(e) {
  const canvas = els.tacticsCanvas;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x: (px - MARGIN) / SCALE, y: (py - MARGIN) / SCALE };
}

function starterAt(pos) {
  let found = null, best = HIT_R / SCALE;
  for (const p of teamPlayers(stateRef, 'home')) {
    const d = Math.hypot(p.baseX - pos.x, p.baseY - pos.y);
    if (d < best) { best = d; found = p; }
  }
  return found;
}

function onDown(e) {
  const p = starterAt(toField(e));
  if (p) {
    dragId = p.id;
    selectedStarterId = p.id;
    els.tacticsCanvas.setPointerCapture(e.pointerId);
    render();
  }
}

function onMove(e) {
  if (!dragId) return;
  const p = getPlayer(stateRef, dragId);
  if (!p) return;
  const pos = toField(e);
  const bx = clamp(pos.x, X_MIN, X_MAX);
  const by = clamp(pos.y, 2, PITCH.width - 2);
  p.baseX = bx; p.baseY = by;
  // ก่อนเขี่ยเริ่มเกม (ยังไม่เดินนาฬิกา) → ย้ายตัวจริงให้เห็นทันที
  if (isPreMatch(stateRef)) {
    p.x = bx; p.y = by; p.targetX = bx; p.targetY = by;
  } else {
    p.targetX = bx; p.targetY = by; // ใช้ base ใหม่เป็น anchor เทิร์นถัดไป
  }
  stateRef.ui.scoresDirty = true;
  render();
}

function onUp() {
  dragId = null;
}

function isPreMatch(state) {
  return state.clock === 0 && state.turn === 1 && (state.history?.length ?? 0) === 0;
}

// ---------- render ----------

function render() {
  if (!isTacticsOpen() && !ctx) return;
  drawEditorPitch();
  renderSquad();
  const used = stateRef.subsUsed?.home ?? 0;
  els.tacticsSubs.textContent = `เปลี่ยนตัว ${used}/${stateRef.subsMax ?? 5}`;
  els.tacticsHint.textContent = selectedStarterId
    ? `เลือก ${labelOf(byId(selectedStarterId))} แล้ว — คลิกตัวสำรองเพื่อเปลี่ยนตัว หรือลากบนสนามเพื่อปรับตำแหน่งหลัก`
    : 'ลากนักเตะบนสนามเพื่อตั้งตำแหน่งหลัก · คลิกตัวจริงแล้วคลิกตัวสำรองเพื่อเปลี่ยนตัว';
}

function drawEditorPitch() {
  drawPitch(ctx);
  for (const p of teamPlayers(stateRef, 'home')) {
    const px = toPx(p.baseX), py = toPy(p.baseY);
    const sel = p.id === selectedStarterId;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.home;
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffd84a' : '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), px, py + 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px sans-serif';
    ctx.fillText(p.role, px, py + 19);
  }
}

function renderSquad() {
  els.starterList.innerHTML = '';
  for (const p of teamPlayers(stateRef, 'home')) {
    els.starterList.appendChild(squadRow(p, 'starter'));
  }
  els.benchList.innerHTML = '';
  for (const p of stateRef.benches?.home ?? []) {
    els.benchList.appendChild(squadRow(p, 'bench'));
  }
}

function squadRow(p, kind) {
  const row = document.createElement('div');
  row.className = 'squad-row' + (p.id === selectedStarterId ? ' selected' : '');
  const stColor = p.stamina > 60 ? '#3ecf6e' : p.stamina > 35 ? '#e8b73a' : '#e0473d';
  row.innerHTML = `
    <span class="sq-num">${p.number}</span>
    <span class="sq-role">${p.role}</span>
    <span class="sq-name">${p.name}</span>
    <span class="sq-attrs">PAC ${p.speed} · PAS ${p.passing} · SHO ${p.shooting} · DEF ${p.tackling}</span>
    <span class="sq-stam"><i style="width:${Math.round(p.stamina)}%;background:${stColor}"></i></span>`;
  row.addEventListener('click', () => onSquadClick(p, kind));
  return row;
}

function onSquadClick(p, kind) {
  if (kind === 'starter') {
    selectedStarterId = (selectedStarterId === p.id) ? null : p.id;
    render();
    return;
  }
  // bench: ต้องเลือกตัวจริงก่อน
  if (!selectedStarterId) {
    els.tacticsHint.textContent = 'เลือก "ตัวจริง" ที่จะเอาออกก่อน แล้วค่อยคลิกตัวสำรอง';
    return;
  }
  const r = substitute(stateRef, 'home', selectedStarterId, p.id);
  if (!r.ok) {
    els.tacticsHint.textContent = `เปลี่ยนตัวไม่ได้: ${r.error}`;
    return;
  }
  els.tacticsHint.textContent = `เปลี่ยนตัว: ${r.outP.name} ออก → ${r.inP.name} ลง (เหลือสิทธิ์ ${r.remaining})`;
  selectedStarterId = r.inP.id;
  render();
}

function byId(id) {
  return getPlayer(stateRef, id) || (stateRef.benches?.home ?? []).find((p) => p.id === id);
}
function labelOf(p) {
  return p ? `${p.role} #${p.number} ${p.name}` : '';
}
