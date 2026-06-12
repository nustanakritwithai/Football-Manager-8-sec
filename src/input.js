// mouse/touch: ลาก = ตั้งคำสั่ง (intended target) ไม่ใช่ย้ายตำแหน่งจริง (P2)
// ตำแหน่งจริงเปลี่ยนเฉพาะระหว่าง simulation 8 วินาที

import { MARGIN, SCALE, PITCH } from './config.js';
import { clamp, dist } from './utils.js';
import { getPlayer } from './team.js';
import { movementRadius } from './player.js';

const HIT_RADIUS_PX = 13;

export function initInput(canvas, state, onChange, onClamp) {
  function toField(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return { x: (px - MARGIN) / SCALE, y: (py - MARGIN) / SCALE, px, py };
  }

  function hitPlayer(pos) {
    let found = null, best = HIT_RADIUS_PX / SCALE;
    for (const p of state.players) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < best) { best = d; found = p; }
    }
    return found;
  }

  // clamp เป้าหมายให้อยู่ใน movement radius ของนักเตะ + ในสนาม
  function setIntent(p, pos) {
    let tx = clamp(pos.x, 0.5, PITCH.length - 0.5);
    let ty = clamp(pos.y, 0.5, PITCH.width - 0.5);
    const r = movementRadius(p);
    const d = dist(p.x, p.y, tx, ty);
    let clamped = false;
    if (d > r) {
      tx = p.x + ((tx - p.x) / d) * r;
      ty = p.y + ((ty - p.y) / d) * r;
      clamped = true;
    }
    p.intendedTarget = { x: tx, y: ty };
    p.commandType = 'move';
    p.commandLocked = true;
    p.lastCommandTurn = state.turn;
    return clamped;
  }

  let clampWarnedThisDrag = false;

  canvas.addEventListener('pointerdown', (e) => {
    const pos = toField(e);
    const p = hitPlayer(pos);

    if (state.ui.selectedId) {
      const prev = getPlayer(state, state.ui.selectedId);
      if (prev) prev.isSelected = false;
    }
    state.ui.selectedId = p ? p.id : null;
    if (p) p.isSelected = true;

    if (p && p.team === 'home' && state.phase === 'planning') {
      state.ui.dragId = p.id;
      clampWarnedThisDrag = false;
      canvas.setPointerCapture(e.pointerId);
    }
    onChange();
  });

  canvas.addEventListener('pointermove', (e) => {
    const pos = toField(e);
    state.ui.mouseX = e.clientX;
    state.ui.mouseY = e.clientY;

    if (state.ui.dragId && state.phase === 'planning') {
      const p = getPlayer(state, state.ui.dragId);
      if (p) {
        const clamped = setIntent(p, pos);
        if (clamped && !clampWarnedThisDrag) {
          clampWarnedThisDrag = true;
          onClamp?.(p);
        }
      }
    } else {
      const hover = hitPlayer(pos);
      state.ui.hoverId = hover ? hover.id : null;
    }
  });

  function endDrag() {
    if (state.ui.dragId) {
      state.ui.dragId = null;
      state.ui.scoresDirty = true;
      onChange();
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { state.ui.hoverId = null; });

  // double click = ยกเลิกคำสั่งของนักเตะ
  canvas.addEventListener('dblclick', (e) => {
    const p = hitPlayer(toField(e));
    if (p && p.team === 'home' && state.phase === 'planning') {
      p.intendedTarget = null;
      p.commandLocked = false;
      onChange();
    }
  });
}
