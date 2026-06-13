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
export const SAVE_VERSION = 2;

// ---------- P2: Tactical Intelligence ----------

export const SIM_SECONDS = TURN_SECONDS;

// อิสระในการเคลื่อนที่ต่อ role (คูณกับ movement radius)
export const ROLE_FREEDOM = {
  GK: 0.35, CB: 0.55, LB: 0.75, RB: 0.75, DM: 0.65,
  CM: 0.75, AM: 0.8, LW: 0.95, RW: 0.95, ST: 0.85,
};
export const MAX_MOVEMENT_RADIUS = 45; // เมตร เพดานต่อเทิร์น

// anti-clustering
export const MIN_PLAYER_SPACING = 4.5;  // เมตร
export const SEPARATION_FORCE = 0.8;
export const CONGESTION_GRID = { cols: 8, rows: 5 };
export const CONGESTION_LIMIT = 3;      // เพื่อนร่วมทีมต่อโซนก่อนถือว่าแน่น

// ball carrier decision
export const CARRY_SPACE_THRESHOLD = 6;   // เมตรพื้นที่ว่างด้านหน้าขั้นต่ำก่อนพิจารณา carry
export const DRIBBLE_PRESSURE_MAX = 1.8;
export const HOLD_PRESSURE_LIMIT = 1.5;

// pass memory
export const PASS_MEMORY_SIZE = 8;

export const DEBUG = {
  showIntents: true,     // เส้น intent / run target ระหว่าง simulation
  showPhase: true,       // แสดง team phase + objective บน scoreboard
  showCongestion: false, // highlight โซนแออัด
};

// ---------- P2.7: Ball Physics Lite ----------
// บอลเป็น "วัตถุกลม" เบา ๆ: กลิ้ง เด้ง แฉลบ กระเด็น — ความไม่แน่นอนที่มีเหตุผล
export const BALL_RADIUS = 0.11;             // เมตร
export const BALL_GROUND_FRICTION = 0.93;    // ตัวคูณต่อ tick ตอนบอลกลิ้งบนพื้น
export const BALL_AIR_DRAG = 0.985;          // ตัวคูณต่อ tick ตอนบอลลอย
export const BALL_GRAVITY = 9.8;             // m/s^2
export const BALL_BOUNCINESS = 0.45;         // ค่าเด้งเริ่มต้น (0.35–0.65)
export const BALL_BOUNCE_FRICTION = 0.82;    // แรงเสียดทานแนวราบตอนเด้งกับพื้น
export const BALL_ROLL_STOP_SPEED = 0.35;    // m/s ต่ำกว่านี้ถือว่าบอลเกือบหยุด
export const BALL_MIN_BOUNCE_VZ = 1.2;       // m/s |velocityZ| ต่ำกว่านี้เลิกเด้ง
export const PLAYER_TOUCH_RADIUS = 1.6;      // ระยะที่ผู้เล่นเอื้อมแตะ/รับบอล
export const PLAYER_BLOCK_RADIUS = 1.25;     // ระยะบล็อก/แฉลบเมื่อบอลพุ่งผ่าน
export const BALL_REACH_HEIGHT = 2.2;        // ความสูงบอลสูงสุดที่ผู้เล่นยังเอื้อมถึง (เมตร)
export const DEFLECTION_NOISE = 0.5;         // เรเดียน ค่าคลาดเคลื่อนของมุมแฉลบ
export const POST_REBOUND_POWER = 0.6;       // แรงเด้งกลับจากเสา/คาน
export const POST_HIT_CHANCE = 0.07;         // โอกาสลูกที่ไม่เข้าไปชนเสา (เมื่อมุมดี)
export const GK_HOLD_CHANCE = 0.55;          // เซฟแล้วรับติดมือ (ที่เหลือ = ปัดออก)
export const GK_PARRY_POWER = 9;             // ความเร็วบอลที่ GK ปัดออก (m/s)
export const GK_PARRY_CENTER_CHANCE = 0.3;   // โอกาสปัดไปกลางประตู (เสี่ยงซ้ำ) ที่เหลือปัดออกข้าง
export const SECOND_BALL_RADIUS = 18;        // รัศมีพิจารณาการแย่ง second ball (เมตร)
export const FIRST_TOUCH_LOOSE = 0.2;        // first touch ต่ำกว่านี้ = บอลหลุดเป็น loose
export const FIRST_TOUCH_CLEAN = 0.36;       // สูงกว่านี้ = รับเรียบทันที (ลูกง่ายต้องรับได้)

// ---------- P2.8: Match Rules & Restart System ----------
export const GOAL_WIDTH = 7.32;              // เมตร
export const GOAL_HALF_WIDTH = 3.66;         // ระยะจากกลางประตูถึงเสาแต่ละข้าง
export const CROSSBAR_HEIGHT = 2.44;         // ความสูงคาน (ใช้กับ z ตอนเช็กประตู)
export const PENALTY_AREA_DEPTH = 16.5;      // เขตโทษลึก
export const PENALTY_AREA_HALF_WIDTH = 20.15; // ครึ่งความกว้างเขตโทษ
export const PENALTY_SPOT_DISTANCE = 11;     // จุดโทษห่างเส้นประตู
export const SIX_YARD_DEPTH = 5.5;           // กรอบ 6 หลา
export const RESTART_DISTANCE = 9.15;        // ระยะคู่แข่งต้องถอยตอน set piece
export const FOUL_BASE_RATE = 0.05;          // อัตราฟาวล์พื้นฐานต่อจังหวะ tackle/press
export const FOUL_PRESSURE_WEIGHT = 0.12;    // น้ำหนัก pressure ต่อโอกาสฟาวล์
export const YELLOW_CARD_THRESHOLD = 0.62;   // foulSeverity เกินนี้ = ใบเหลือง
export const ADVANTAGE_SECONDS = 2.0;        // ได้เปรียบหลังฟาวล์ก่อนดึงกลับมาเป็นฟรีคิก

// ---------- P2.9: Finishing Engine ----------
export const GOAL_HEIGHT = 2.44;             // ความสูงประตู (เมตร)
export const SHOT_XG_MIN = 0.01;
export const SHOT_XG_MAX = 0.75;             // เพดาน xG (ยกเว้น penalty/tap-in โล่งจริง)
export const BIG_CHANCE_XG = 0.30;           // xG ตั้งแต่นี้ = big chance
export const LONG_SHOT_MAX_XG = 0.06;        // เพดาน xG ลูกไกล
export const GK_BASE_REACH = 0.42;           // ฐานโอกาสเซฟลูกเข้ากรอบ (ก่อนปรับ placement/power)
export const GK_REACTION_WEIGHT = 0.28;      // น้ำหนัก reaction/positioning ต่อ saveChance
export const SHOT_TARGET_ERROR_BASE = 0.18;  // ความคลาดเคลื่อนการเล็งพื้นฐาน
export const SHOT_PRESSURE_ERROR = 0.07;     // ความคลาดเคลื่อนเพิ่มต่อ pressure
export const POST_CHANCE_MAX = 0.08;         // โอกาสชนเสาสูงสุด (ลูกคุณภาพดี)
export const REBOUND_CHANCE_BASE = 0.5;      // โอกาสที่ลูกเซฟ/บล็อกกลายเป็น rebound
