// P3.1 Arcade: หน้าจอเลือกทีมก่อนเริ่มแมตช์ (เลือกทีมเรา + คู่แข่ง → VS → Start)

import { TEAMS, getTeamData } from './teams-data.js';
import { choice } from './utils.js';

let els = {};
let onStartCb = null;
let pickedHome = null;
let pickedAway = null;

export function initTeamSelect(handlers = {}) {
  onStartCb = handlers.onStart;
  for (const id of [
    'teamSelectModal', 'teamGrid', 'tsHomePick', 'tsAwayPick',
    'tsStart', 'tsRandom', 'tsReset', 'tsPrompt',
  ]) els[id] = document.getElementById(id);

  buildGrid();
  els.tsStart.addEventListener('click', () => {
    if (pickedHome && pickedAway) {
      els.teamSelectModal.classList.remove('open');
      onStartCb?.(pickedHome, pickedAway);
    }
  });
  els.tsRandom.addEventListener('click', () => {
    // สุ่มคู่แข่งที่ไม่ซ้ำทีมเรา
    const pool = TEAMS.filter((t) => t.id !== pickedHome);
    pickedAway = choice(pool).id;
    refresh();
  });
  els.tsReset.addEventListener('click', () => {
    pickedHome = null; pickedAway = null; refresh();
  });
}

export function openTeamSelect() {
  els.teamSelectModal.classList.add('open');
  refresh();
}

function buildGrid() {
  els.teamGrid.innerHTML = '';
  for (const t of TEAMS) {
    const card = document.createElement('button');
    card.className = 'team-card';
    card.dataset.id = t.id;
    card.innerHTML = `
      <span class="tc-badge" style="background:${t.color};border-color:${t.color2}">${t.short}</span>
      <span class="tc-name">${t.name}</span>
      <span class="tc-stars">${'★'.repeat(t.strength)}${'☆'.repeat(5 - t.strength)}</span>`;
    card.addEventListener('click', () => onPick(t.id));
    els.teamGrid.appendChild(card);
  }
}

// คลิกครั้งแรก = ทีมเรา, ครั้งถัดไป = คู่แข่ง, คลิกทีมที่เลือกแล้วซ้ำ = ยกเลิก
function onPick(id) {
  if (pickedHome === id) { pickedHome = null; }
  else if (pickedAway === id) { pickedAway = null; }
  else if (!pickedHome) { pickedHome = id; }
  else if (!pickedAway) { pickedAway = id; }
  else { pickedAway = id; } // เปลี่ยนคู่แข่ง
  refresh();
}

function teamChip(id) {
  if (!id) return '<span class="muted">— ยังไม่เลือก —</span>';
  const t = getTeamData(id);
  return `<span class="tc-badge sm" style="background:${t.color};border-color:${t.color2}">${t.short}</span>
    <span>${t.name} <span class="tc-stars sm">${'★'.repeat(t.strength)}</span></span>`;
}

function refresh() {
  for (const card of els.teamGrid.querySelectorAll('.team-card')) {
    const id = card.dataset.id;
    card.classList.toggle('pick-home', id === pickedHome);
    card.classList.toggle('pick-away', id === pickedAway);
  }
  els.tsHomePick.innerHTML = teamChip(pickedHome);
  els.tsAwayPick.innerHTML = teamChip(pickedAway);
  els.tsStart.disabled = !(pickedHome && pickedAway);
  els.tsPrompt.textContent = !pickedHome
    ? 'เลือก "ทีมของคุณ" (สีน้ำเงินในสนาม)'
    : !pickedAway ? 'เลือก "คู่แข่ง" หรือกดสุ่มคู่แข่ง'
    : 'พร้อมแล้ว — กด Kick Off!';
}
