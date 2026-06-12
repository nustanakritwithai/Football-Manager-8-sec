// entry point: init state, canvas, input, UI, game loop

import { CANVAS_W, CANVAS_H, TICK_DT } from './config.js';
import { createInitialState, applyFormation, resetFormation, clearPaths } from './state.js';
import { startSimulation, simTick } from './simulation.js';
import { analyze } from './tacticalAnalyzer.js';
import { drawPitch } from './pitch.js';
import { drawPlayer } from './player.js';
import { drawBall } from './ball.js';
import { initInput } from './input.js';
import { initUI, updateDashboard, drawOverlays, drawTooltip, setStatus, setPreviewSummary } from './ui.js';
import { saveToLocal, loadFromLocal, exportJSON, importJSON, exportDataset } from './saveLoad.js';
import { runPreview } from './preview.js';
import { suggestDefensiveAdjustments, applyGhostsAsCommands } from './refine.js';
import { setupCornerScenario } from './scenarios.js';

const canvas = document.getElementById('pitchCanvas');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

const state = createInitialState('4-2-3-1');

function clearPreview() {
  state.ui.preview = null;
  setPreviewSummary('');
}

initInput(
  canvas, state,
  () => { clearPreview(); updateDashboard(state); },
  (p) => setStatus(`${p.role} #${p.number} วิ่งไม่ถึงจุดนั้นใน 8 วิ — จำกัดเป้าหมายตามรัศมีให้แล้ว`),
);

initUI(state, {
  onPlay() {
    clearPreview();
    if (startSimulation(state)) updateDashboard(state);
  },
  onFormation(name) {
    clearPreview();
    applyFormation(state, name);
    setStatus(`เปลี่ยน formation เป็น ${name}`);
    updateDashboard(state);
  },
  onReset() {
    clearPreview();
    resetFormation(state);
    setStatus('รีเซ็ตตำแหน่งแล้ว');
    updateDashboard(state);
  },
  // ---------- P3: TacticAI tools ----------
  onPreview() {
    if (state.phase !== 'planning') return;
    const pv = runPreview(state);
    if (!pv) {
      setStatus('Preview ไม่สำเร็จ', true);
      return;
    }
    state.ui.preview = pv;
    const s = pv.summary;
    setPreviewSummary(
      `คาดการณ์: บอลจบที่${s.possessionEnd === 'home' ? 'เรา' : 'คู่แข่ง'}` +
      ` · โอกาสยิง เรา ${s.ourShots} / คู่แข่ง ${s.theirShots}` +
      (s.goal ? ' · ⚠ มีประตูเกิดขึ้นใน preview!' : '') +
      ' — ลากนักเตะเพื่อแก้แล้วกด Preview ใหม่'
    );
  },
  onAdjust() {
    if (state.phase !== 'planning') return;
    const result = suggestDefensiveAdjustments(state);
    if (!result || !result.ghosts.length) {
      setStatus('AI ไม่พบการขยับที่ช่วยเกมรับได้ชัดเจน — โครงสร้างปัจจุบันโอเคแล้ว');
      return;
    }
    state.assistant.ghosts = result.ghosts;
    state.assistant.messages = [result.message, ...state.assistant.messages].slice(0, 3);
    clearPreview();
    updateDashboard(state);
    setStatus(`AI เสนอขยับ ${result.ghosts.length} ตำแหน่ง (ghost เหลืองบนสนาม)`);
  },
  onApplyGhosts() {
    if (state.phase !== 'planning') return;
    const n = applyGhostsAsCommands(state);
    if (n) {
      clearPreview();
      setStatus(`สั่งวิ่งตามคำแนะนำ AI แล้ว ${n} คน — กด Play เพื่อดูผล`);
      updateDashboard(state);
    } else {
      setStatus('ไม่มี ghost คำแนะนำให้ใช้ตอนนี้ — กด Adjust ก่อน', true);
    }
  },
  onCorner() {
    if (state.phase === 'simulating') return;
    clearPreview();
    if (setupCornerScenario(state)) {
      setStatus('จัดสถานการณ์เตะมุมแล้ว');
      updateDashboard(state);
    }
  },
  onExportDataset() {
    const n = exportDataset(state);
    setStatus(n ? `ดาวน์โหลด dataset ${n} เทิร์นแล้ว` : 'ยังไม่มีข้อมูล — เล่นสักเทิร์นก่อน', !n);
  },
  onSave() {
    const r = saveToLocal(state);
    setStatus(r.ok ? 'บันทึกแผนลง localStorage แล้ว' : r.error, !r.ok);
  },
  onLoad() {
    const r = loadFromLocal(state);
    setStatus(r.ok ? 'โหลดแผนสำเร็จ' : r.error, !r.ok);
    updateDashboard(state);
  },
  onExport() {
    exportJSON(state);
    setStatus('ดาวน์โหลดไฟล์ JSON แล้ว');
  },
  onImport(file) {
    importJSON(state, file, (r) => {
      setStatus(r.ok ? 'นำเข้าแผนสำเร็จ' : `นำเข้าไม่สำเร็จ: ${r.error}`, !r.ok);
      updateDashboard(state);
    });
  },
  onClearPaths() {
    clearPaths(state);
    setStatus('ล้างเส้น path แล้ว');
  },
});

// คะแนนแท็กติกเริ่มต้น
state.tacticalScores = analyze(state).scores;
state.ui.scoresDirty = false;
updateDashboard(state);

// ---------- game loop ----------

let lastTime = performance.now();
let tickAccumulator = 0;
let dashboardTimer = 0;

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (state.phase === 'simulating') {
    tickAccumulator += dt * state.ui.simSpeed;
    let done = false;
    while (tickAccumulator >= TICK_DT && !done) {
      tickAccumulator -= TICK_DT;
      done = simTick(state);
    }
    if (done) {
      tickAccumulator = 0;
      updateDashboard(state);
    }
  } else if (state.ui.scoresDirty) {
    // planning: คะแนนอัปเดตสดตอนลากนักเตะ/ปรับ instruction (preview เก่าถือว่า stale)
    state.tacticalScores = analyze(state).scores;
    state.ui.scoresDirty = false;
    clearPreview();
    updateDashboard(state);
  }

  // อัปเดตตัวเลขบน dashboard ระหว่าง simulation เป็นระยะ
  dashboardTimer += dt;
  if (state.phase === 'simulating' && dashboardTimer > 0.5) {
    dashboardTimer = 0;
    updateDashboard(state);
  }

  render();
  requestAnimationFrame(frame);
}

function render() {
  drawPitch(ctx);
  drawOverlays(ctx, state);
  for (const p of state.players) drawPlayer(ctx, p, state);
  drawBall(ctx, state.ball);
  drawTooltip(state);
}

requestAnimationFrame(frame);
