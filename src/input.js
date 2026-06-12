// mouse/touch: ลากนักเตะทีมเรา เลือกนักเตะ hover tooltip

import { MARGIN, SCALE, PITCH } from './config.js';
import { clamp } from './utils.js';
import { getPlayer } from './team.js';

const HIT_RADIUS_PX = 13;

export function initInput(canvas, state, onChange) {
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

  canvas.addEventListener('pointerdown', (e) => {
    const pos = toField(e);
    const p = hitPlayer(pos);

    // เลือกได้ทุกคน (ดูข้อมูล) แต่ลากได้เฉพาะทีมเราในช่วง planning
    if (state.ui.selectedId) {
      const prev = getPlayer(state, state.ui.selectedId);
      if (prev) prev.isSelected = false;
    }
    state.ui.selectedId = p ? p.id : null;
    if (p) p.isSelected = true;

    if (p && p.team === 'home' && state.phase === 'planning') {
      state.ui.dragId = p.id;
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
        p.x = clamp(pos.x, 0.5, PITCH.length - 0.5);
        p.y = clamp(pos.y, 0.5, PITCH.width - 0.5);
        p.targetX = p.x;
        p.targetY = p.y;
        state.ui.scoresDirty = true;
      }
    } else {
      const hover = hitPlayer(pos);
      state.ui.hoverId = hover ? hover.id : null;
    }
  });

  function endDrag(e) {
    if (state.ui.dragId) {
      state.ui.dragId = null;
      state.ui.scoresDirty = true;
      onChange();
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { state.ui.hoverId = null; });
}
