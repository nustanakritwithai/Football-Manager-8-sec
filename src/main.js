// entry point: init state, canvas, input, UI, game loop

import { CANVAS_W, CANVAS_H, TICK_DT } from './config.js';
import { createInitialState, applyFormation, resetFormation, clearPaths } from './state.js';
import { startSimulation, simTick } from './simulation.js';
import { analyze } from './tacticalAnalyzer.js';
import { drawPitch } from './pitch.js';
import { drawPlayer } from './player.js';
import { drawBall } from './ball.js';
import { initInput } from './input.js';
import { initUI, updateDashboard, drawOverlays, drawTooltip, setStatus } from './ui.js';
import { saveToLocal, loadFromLocal, exportJSON, importJSON } from './saveLoad.js';

const canvas = document.getElementById('pitchCanvas');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

const state = createInitialState('4-2-3-1');

initInput(canvas, state, () => updateDashboard(state));

initUI(state, {
  onPlay() {
    if (startSimulation(state)) updateDashboard(state);
  },
  onFormation(name) {
    applyFormation(state, name);
    setStatus(`เปลี่ยน formation เป็น ${name}`);
    updateDashboard(state);
  },
  onReset() {
    resetFormation(state);
    setStatus('รีเซ็ตตำแหน่งแล้ว');
    updateDashboard(state);
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
    // planning: คะแนนอัปเดตสดตอนลากนักเตะ/ปรับ instruction
    state.tacticalScores = analyze(state).scores;
    state.ui.scoresDirty = false;
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
