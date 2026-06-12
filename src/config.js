// ค่าคงที่ของเกมทั้งหมด

export const PITCH = { length: 105, width: 68 }; // เมตร

export const SCALE = 8;          // พิกเซลต่อเมตร
export const MARGIN = 26;        // ขอบรอบสนามบน canvas
export const CANVAS_W = PITCH.length * SCALE + MARGIN * 2;
export const CANVAS_H = PITCH.width * SCALE + MARGIN * 2;

export const TICKS_PER_SECOND = 10;
export const TURN_SECONDS = 8;
export const TICKS_PER_TURN = TICKS_PER_SECOND * TURN_SECONDS; // 80
export const TICK_DT = 1 / TICKS_PER_SECOND;

export const MATCH_TURNS = 38;   // ~5 นาทีจำลอง
export const MAX_HISTORY = 10;   // เก็บ turn history ล่าสุด
export const PATH_SAMPLE_EVERY = 4; // บันทึก path ทุกกี่ tick
export const MAX_EVENTS_PER_TURN = 14;

export const SIM_SPEEDS = [1, 2, 4];
export const SIM_SPEED_DEFAULT = 2;

export const COLORS = {
  home: '#2f6fed',
  homeDark: '#1c4ec4',
  away: '#e0473d',
  awayDark: '#b22d24',
  ball: '#f7f4e9',
  ghost: '#f2c94c',
  pitch: '#27693c',
  pitchAlt: '#2e7445',
  line: 'rgba(255,255,255,0.85)',
  grid: 'rgba(255,255,255,0.06)',
  pathHome: 'rgba(110,160,255,0.55)',
  pathAway: 'rgba(255,130,120,0.5)',
  laneSafe: 'rgba(120,230,140,0.55)',
  laneRisky: 'rgba(255,120,90,0.5)',
  pressure: 'rgba(255,90,60,0.22)',
  danger: 'rgba(255,60,40,0.13)',
};

export const STORAGE_KEY = 'tactic-manager-lab-save-v1';
export const SAVE_VERSION = 1;
