// dashboard ด้านขวา + overlay บนสนาม (paths, lanes, pressure, ghosts) + tooltip

import { COLORS, MATCH_TURNS, TURN_SECONDS } from './config.js';
import { clamp, distP, formatClock } from './utils.js';
import { toPx, toPy, drawPlayerPath } from './player.js';
import { getPlayer, teamPlayers } from './team.js';
import { passOptions } from './simulation.js';
import { FORMATION_NAMES } from './formations.js';

const SCORE_DEFS = [
  { key: 'defensiveStability', label: 'Defensive Stability', good: 'high' },
  { key: 'attackThreat', label: 'Attack Threat', good: 'high' },
  { key: 'midfieldControl', label: 'Midfield Control', good: 'high' },
  { key: 'counterRisk', label: 'Counter Risk', good: 'low' },
  { key: 'compactness', label: 'Compactness', good: 'high' },
  { key: 'pressingEfficiency', label: 'Pressing Efficiency', good: 'high' },
  { key: 'passingOptions', label: 'Passing Options', good: 'high' },
  { key: 'fatigueLoad', label: 'Fatigue Load', good: 'low' },
];

const els = {};

export function initUI(state, handlers) {
  const ids = [
    'clock', 'turn', 'phase', 'scoreline', 'awayStyle',
    'btnPlay', 'btnReset', 'btnSave', 'btnLoad', 'btnExport', 'btnImport', 'btnClearPaths',
    'importFile', 'simSpeed', 'formation', 'scoreBars', 'assistantBox', 'eventList',
    'playerInfo', 'tooltip', 'statusMsg', 'historyList',
    'pressingLevel', 'defensiveLine', 'attackingWidth', 'passingStyle', 'tempo', 'riskLevel',
  ];
  for (const id of ids) els[id] = document.getElementById(id);

  // formation selector
  for (const name of FORMATION_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.formation.appendChild(opt);
  }
  els.formation.value = state.teams.home.formation;
  els.formation.addEventListener('change', () => handlers.onFormation(els.formation.value));

  // score bars
  for (const def of SCORE_DEFS) {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `
      <span class="score-label">${def.label}</span>
      <div class="score-bar"><div class="score-fill" id="bar-${def.key}"></div></div>
      <span class="score-val" id="val-${def.key}">–</span>`;
    els.scoreBars.appendChild(row);
  }

  // team instructions
  const t = state.teams.home;
  els.pressingLevel.value = t.pressingLevel;
  els.defensiveLine.value = t.defensiveLine;
  els.attackingWidth.value = t.attackingWidth;
  els.passingStyle.value = t.passingStyle;
  els.tempo.value = t.tempo;
  els.riskLevel.value = t.riskLevel;
  for (const key of ['pressingLevel', 'defensiveLine', 'attackingWidth', 'tempo', 'riskLevel']) {
    els[key].addEventListener('input', () => {
      state.teams.home[key] = Number(els[key].value);
      state.ui.scoresDirty = true;
    });
  }
  els.passingStyle.addEventListener('change', () => {
    state.teams.home.passingStyle = els.passingStyle.value;
    state.ui.scoresDirty = true;
  });

  // sim speed
  els.simSpeed.value = String(state.ui.simSpeed);
  els.simSpeed.addEventListener('change', () => {
    state.ui.simSpeed = Number(els.simSpeed.value);
  });

  // buttons
  els.btnPlay.addEventListener('click', handlers.onPlay);
  els.btnReset.addEventListener('click', handlers.onReset);
  els.btnSave.addEventListener('click', handlers.onSave);
  els.btnLoad.addEventListener('click', handlers.onLoad);
  els.btnExport.addEventListener('click', handlers.onExport);
  els.btnClearPaths.addEventListener('click', handlers.onClearPaths);
  els.btnImport.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => {
    const file = els.importFile.files[0];
    if (file) handlers.onImport(file);
    els.importFile.value = '';
  });
}

export function setStatus(text, isError = false) {
  if (!els.statusMsg) return;
  els.statusMsg.textContent = text;
  els.statusMsg.className = isError ? 'status error' : 'status';
  if (text) setTimeout(() => { if (els.statusMsg.textContent === text) els.statusMsg.textContent = ''; }, 4000);
}

export function updateDashboard(state) {
  els.clock.textContent = formatClock(state.clock);
  els.turn.textContent = `เทิร์น ${Math.min(state.turn, MATCH_TURNS)}/${MATCH_TURNS}`;
  els.scoreline.textContent = `${state.teams.home.teamName} ${state.score.home} - ${state.score.away} ${state.teams.away.teamName}`;
  els.awayStyle.textContent = `คู่แข่ง: ${state.teams.away.strategy}`;

  const phaseLabel = { planning: 'Planning', simulating: 'Simulating…', finished: 'Match Finished' };
  els.phase.textContent = phaseLabel[state.phase] || state.phase;
  els.phase.className = `phase phase-${state.phase}`;

  const busy = state.phase === 'simulating';
  els.btnPlay.disabled = busy || state.phase === 'finished';
  els.btnPlay.textContent = state.phase === 'finished'
    ? 'จบแมตช์แล้ว'
    : busy ? `กำลังจำลอง ${TURN_SECONDS} วินาที…` : `▶ Play Next ${TURN_SECONDS} Seconds`;
  for (const b of [els.btnReset, els.btnSave, els.btnLoad, els.btnExport, els.btnImport, els.formation]) {
    b.disabled = busy;
  }

  // score bars
  if (state.tacticalScores) {
    for (const def of SCORE_DEFS) {
      const v = state.tacticalScores[def.key];
      const bar = document.getElementById(`bar-${def.key}`);
      const val = document.getElementById(`val-${def.key}`);
      if (!bar || v == null) continue;
      bar.style.width = `${v}%`;
      const effective = def.good === 'low' ? 100 - v : v;
      bar.style.background = effective > 60 ? '#3ecf6e' : effective > 35 ? '#e8b73a' : '#e0473d';
      val.textContent = v;
    }
  }

  // assistant
  els.assistantBox.innerHTML = '';
  for (const m of state.assistant.messages) {
    const div = document.createElement('div');
    div.className = `assistant-msg sev-${m.severity || 'info'}`;
    div.textContent = m.text;
    els.assistantBox.appendChild(div);
  }
  if (!state.assistant.messages.length) {
    els.assistantBox.innerHTML = '<div class="assistant-msg sev-info">จัดตำแหน่งแล้วกด Play เพื่อเริ่มเทิร์นแรก</div>';
  }

  // events
  els.eventList.innerHTML = '';
  const events = state.lastTurnEvents.length
    ? state.lastTurnEvents
    : (state.history.at(-1)?.events ?? []);
  for (const e of events) {
    const li = document.createElement('li');
    li.textContent = e;
    if (e.startsWith('GOAL')) li.className = 'ev-goal';
    els.eventList.appendChild(li);
  }
  if (!events.length) {
    els.eventList.innerHTML = '<li class="ev-empty">ยังไม่มี event — เล่นเทิร์นแรกก่อน</li>';
  }

  // turn history
  els.historyList.innerHTML = '';
  for (const h of [...state.history].reverse()) {
    const li = document.createElement('li');
    const poss = h.possessionEnd === 'home' ? 'เรา' : 'คู่แข่ง';
    li.textContent = `T${h.turnNumber} (${formatClock(h.startClock)}→${formatClock(h.endClock)}) บอลจบที่: ${poss}`;
    els.historyList.appendChild(li);
  }

  updatePlayerInfo(state);
}

function updatePlayerInfo(state) {
  const p = state.ui.selectedId ? getPlayer(state, state.ui.selectedId) : null;
  if (!p) {
    els.playerInfo.innerHTML = '<div class="muted">คลิกนักเตะเพื่อดูข้อมูล (ลากได้เฉพาะทีมน้ำเงินตอน Planning)</div>';
    return;
  }
  const stColor = p.stamina > 60 ? '#3ecf6e' : p.stamina > 35 ? '#e8b73a' : '#e0473d';
  els.playerInfo.innerHTML = `
    <div class="pi-head">
      <span class="pi-dot" style="background:${p.team === 'home' ? COLORS.home : COLORS.away}"></span>
      <strong>#${p.number} ${p.name}</strong> <span class="muted">(${p.role} · ${p.team === 'home' ? 'ทีมเรา' : 'คู่แข่ง'})</span>
    </div>
    <div class="pi-stamina">
      <span>Stamina ${Math.round(p.stamina)}</span>
      <div class="score-bar"><div class="score-fill" style="width:${p.stamina}%;background:${stColor}"></div></div>
    </div>
    <div class="pi-attrs">
      <span>SPD ${p.speed}</span><span>PAS ${p.passing}</span><span>PRS ${p.pressing}</span>
      <span>TCK ${p.tackling}</span><span>VIS ${p.vision}</span><span>POS ${p.positioning}</span>
      <span>SHO ${p.shooting}</span><span>DEC ${p.decision}</span>
    </div>`;
}

// ---------- overlays บนสนาม ----------

export function drawOverlays(ctx, state) {
  drawDangerZones(ctx, state);
  for (const p of state.players) drawPlayerPath(ctx, p);
  drawPassingLanes(ctx, state);
  drawPressureCircle(ctx, state);
  drawGhosts(ctx, state);
}

function drawPassingLanes(ctx, state) {
  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (!owner || owner.team !== 'home') return;
  const opts = passOptions(state, owner).slice(0, 4);
  for (const o of opts) {
    ctx.beginPath();
    ctx.moveTo(toPx(owner.x), toPy(owner.y));
    ctx.lineTo(toPx(o.mate.x), toPy(o.mate.y));
    ctx.strokeStyle = o.score > 0.45 ? COLORS.laneSafe : COLORS.laneRisky;
    ctx.lineWidth = o.score > 0.45 ? 2 : 1.2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPressureCircle(ctx, state) {
  const owner = state.ball.ownerPlayerId ? getPlayer(state, state.ball.ownerPlayerId) : null;
  if (!owner) return;
  const opps = state.players.filter((p) => p.team !== owner.team && distP(p, owner) < 7);
  if (!opps.length) return;
  const intensity = clamp(opps.length / 3, 0.3, 1);
  ctx.beginPath();
  ctx.arc(toPx(owner.x), toPy(owner.y), 7 * 8 * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.pressure;
  ctx.globalAlpha = intensity;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawGhosts(ctx, state) {
  if (state.phase !== 'planning') return;
  for (const g of state.assistant.ghosts || []) {
    const p = getPlayer(state, g.playerId);
    if (!p) continue;
    const gx = toPx(g.x), gy = toPy(g.y);

    // เส้นจากตัวจริงไป ghost
    ctx.beginPath();
    ctx.moveTo(toPx(p.x), toPy(p.y));
    ctx.lineTo(gx, gy);
    ctx.strokeStyle = COLORS.ghost;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // วง ghost
    ctx.beginPath();
    ctx.arc(gx, gy, 9, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.ghost;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.ghost;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.label || 'แนะนำ', gx, gy - 13);
  }
}

function drawDangerZones(ctx, state) {
  // โซนแดงจางหลัง fullback ที่ดันสูง (เตือนภาพ)
  if (state.phase !== 'planning') return;
  for (const fb of teamPlayers(state, 'home').filter((p) => ['LB', 'RB'].includes(p.role))) {
    if (fb.x > 52) {
      const x0 = 15, x1 = fb.x - 6;
      const y0 = clamp(fb.y - 8, 0, 68), y1 = clamp(fb.y + 8, 0, 68);
      ctx.fillStyle = COLORS.danger;
      ctx.fillRect(toPx(x0), toPy(y0), (x1 - x0) * 8, (y1 - y0) * 8);
    }
  }
}

export function drawTooltip(state) {
  const tip = els.tooltip;
  const p = state.ui.hoverId && !state.ui.dragId ? getPlayer(state, state.ui.hoverId) : null;
  if (!p) {
    tip.style.display = 'none';
    return;
  }
  tip.style.display = 'block';
  tip.style.left = `${state.ui.mouseX + 14}px`;
  tip.style.top = `${state.ui.mouseY + 10}px`;
  tip.innerHTML = `<strong>#${p.number} ${p.name}</strong> (${p.role})<br>
    stamina ${Math.round(p.stamina)} · spd ${p.speed} · pas ${p.passing}`;
}
