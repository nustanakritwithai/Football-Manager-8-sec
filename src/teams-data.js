// P3.1 Arcade: ฐานข้อมูลทีม "พรีเมียร์ลีกอังกฤษ" แบบไม่ละเมิดลิขสิทธิ์
// ใช้ชื่อ เมือง+ฉายา/สี ที่จำได้ว่าทีมไหน แต่ไม่ใช้เครื่องหมายการค้าจริง
// strength = ดาว 1-5 → สเกลค่าพลังนักเตะ (ยิ่งดาวมาก ทีมยิ่งแกร่ง = อาเขตเลือกความยากได้)

export const TEAMS = [
  { id: 'man-red',     name: 'Manchester Red',    short: 'MNR', color: '#da2128', color2: '#ffffff', strength: 5, formation: '4-2-3-1', style: 'Possession' },
  { id: 'man-sky',     name: 'Manchester Sky',    short: 'MNS', color: '#6cabdd', color2: '#ffffff', strength: 5, formation: '4-3-3',   style: 'Possession' },
  { id: 'mersey-red',  name: 'Merseyside Red',    short: 'MYR', color: '#c8102e', color2: '#ffffff', strength: 5, formation: '4-3-3',   style: 'High Press' },
  { id: 'nlon-red',    name: 'North London Reds', short: 'NLR', color: '#ef0107', color2: '#ffffff', strength: 5, formation: '4-3-3',   style: 'Possession' },
  { id: 'wlon-blue',   name: 'West London Blues', short: 'WLB', color: '#034694', color2: '#ffffff', strength: 4, formation: '4-2-3-1', style: 'High Press' },
  { id: 'nlon-white',  name: 'North London White', short: 'NLW', color: '#ffffff', color2: '#132257', strength: 4, formation: '4-2-3-1', style: 'Wing Play' },
  { id: 'newcastle',   name: 'Tyneside Magpies',  short: 'TYN', color: '#241f20', color2: '#ffffff', strength: 4, formation: '4-3-3',   style: 'High Press' },
  { id: 'villa',       name: 'Birmingham Claret', short: 'BMC', color: '#95bfe5', color2: '#670e36', strength: 4, formation: '4-4-2',   style: 'Counter Attack' },
  { id: 'brighton',    name: 'Brighton Gulls',    short: 'BTG', color: '#0057b8', color2: '#ffffff', strength: 4, formation: '4-2-3-1', style: 'Possession' },
  { id: 'westham',     name: 'East London Irons', short: 'ELI', color: '#7a263a', color2: '#1bb1e7', strength: 3, formation: '4-2-3-1', style: 'Counter Attack' },
  { id: 'palace',      name: 'South London Eagles', short: 'SLE', color: '#1b458f', color2: '#c4122e', strength: 3, formation: '4-3-3',   style: 'Counter Attack' },
  { id: 'wolves',      name: 'Midland Gold',      short: 'MLG', color: '#fdb913', color2: '#231f20', strength: 3, formation: '3-5-2',   style: 'Counter Attack' },
  { id: 'fulham',      name: 'West London Whites', short: 'WLW', color: '#ffffff', color2: '#000000', strength: 3, formation: '4-2-3-1', style: 'Possession' },
  { id: 'brentford',   name: 'West London Bees',  short: 'WBE', color: '#e30613', color2: '#ffffff', strength: 3, formation: '4-3-3',   style: 'Wing Play' },
  { id: 'forest',      name: 'Nottingham Reds',   short: 'NOR', color: '#dd0000', color2: '#ffffff', strength: 3, formation: '4-2-3-1', style: 'Low Block' },
  { id: 'everton',     name: 'Merseyside Blue',   short: 'MYB', color: '#003399', color2: '#ffffff', strength: 3, formation: '4-4-2',   style: 'Low Block' },
  { id: 'leicester',   name: 'East Midland Foxes', short: 'EMF', color: '#003090', color2: '#fdbe11', strength: 3, formation: '4-4-2',   style: 'Counter Attack' },
  { id: 'bournemouth', name: 'South Coast Cherries', short: 'SCC', color: '#da291c', color2: '#000000', strength: 2, formation: '4-4-2',   style: 'Low Block' },
  { id: 'saints',      name: 'South Coast Saints', short: 'SCS', color: '#d71920', color2: '#ffffff', strength: 2, formation: '4-2-3-1', style: 'Low Block' },
  { id: 'ipswich',     name: 'East Anglia Blues', short: 'EAB', color: '#3a64a3', color2: '#ffffff', strength: 2, formation: '4-4-2',   style: 'Low Block' },
];

// ดาวเด่นแต่ละทีม (ชื่อ homage จำได้ว่าใคร แต่สะกดเพี้ยนเลี่ยงสิทธิชื่อจริง)
// a = ค่าพลังเฉพาะตัวที่ปั้นตามโปรไฟล์จริง (key ที่ไม่ระบุ = ใช้ค่ามาตรฐานตามตำแหน่ง)
// role ต้องตรงกับช่องใน formation ของทีม ดาวที่ไม่ได้ช่องตัวจริงจะไปนั่งสำรอง
const STAR_ROSTERS = {
  'man-sky': [ // 4-3-3
    { name: 'E. Halund',   role: 'ST', a: { speed: 88, shooting: 94, positioning: 93, decision: 82, aggression: 75 } },
    { name: 'P. Foten',    role: 'CM', a: { passing: 87, vision: 86, shooting: 84, decision: 89, speed: 81 } },
    { name: 'Rodry',       role: 'DM', a: { passing: 88, vision: 85, tackling: 85, positioning: 90, decision: 91, pressing: 80 } },
    { name: 'B. Silvva',   role: 'CM', a: { passing: 88, vision: 87, decision: 89, speed: 78 } },
    { name: 'R. Dais',     role: 'CB', a: { tackling: 88, positioning: 89, passing: 82, decision: 85 } },
    { name: 'Edersson',    role: 'GK', a: { positioning: 88, passing: 90, decision: 83 } },
  ],
  'mersey-red': [ // 4-3-3
    { name: 'M. Sallah',   role: 'RW', a: { speed: 90, shooting: 90, passing: 81, decision: 89, positioning: 89 } },
    { name: 'V. van Dik',  role: 'CB', a: { tackling: 90, positioning: 92, speed: 80, passing: 81, aggression: 78 } },
    { name: 'Alisson',     role: 'GK', a: { positioning: 91, decision: 87, passing: 80 } },
    { name: 'D. Szobo',    role: 'CM', a: { passing: 85, shooting: 85, vision: 83, speed: 83 } },
    { name: 'L. Diaaz',    role: 'LW', a: { speed: 89, shooting: 83, decision: 81 } },
  ],
  'nlon-red': [ // 4-3-3 (Arsenal-ish)
    { name: 'B. Saca',     role: 'RW', a: { speed: 86, shooting: 86, passing: 84, decision: 87 } },
    { name: 'M. Ödegard',  role: 'CM', a: { passing: 90, vision: 90, shooting: 83, decision: 91 } },
    { name: 'W. Saleba',   role: 'CB', a: { tackling: 88, positioning: 88, speed: 85 } },
    { name: 'D. Rece',     role: 'DM', a: { tackling: 88, passing: 83, positioning: 87, decision: 87, aggression: 80 } },
    { name: 'G. Martinello', role: 'LW', a: { speed: 88, shooting: 83 } },
  ],
  'man-red': [ // 4-2-3-1 (Man Utd-ish)
    { name: 'B. Fernandez', role: 'AM', a: { passing: 90, vision: 90, shooting: 86, decision: 88 } },
    { name: 'R. Höjlund',   role: 'ST', a: { speed: 85, shooting: 82, positioning: 82 } },
    { name: 'L. Yorro',     role: 'CB', a: { tackling: 84, positioning: 84, speed: 85 } },
    { name: 'A. Onanna',    role: 'GK', a: { positioning: 83, passing: 85, decision: 80 } },
  ],
  'wlon-blue': [ // 4-2-3-1 (Chelsea-ish)
    { name: 'C. Palmar',   role: 'AM', a: { passing: 88, shooting: 89, vision: 86, decision: 89 } },
    { name: 'M. Caicido',  role: 'DM', a: { tackling: 88, positioning: 86, passing: 81, pressing: 83 } },
    { name: 'N. Jacksen',  role: 'ST', a: { speed: 87, shooting: 81, positioning: 80 } },
  ],
  'nlon-white': [ // 4-2-3-1 (Spurs-ish)
    { name: 'Son H.',      role: 'LW', a: { speed: 88, shooting: 88, decision: 86, positioning: 85 } },
    { name: 'J. Maddisen', role: 'AM', a: { passing: 86, vision: 86, shooting: 83 } },
    { name: 'C. Romoro',   role: 'CB', a: { tackling: 86, positioning: 84, aggression: 83 } },
    { name: 'D. Solanky',  role: 'ST', a: { shooting: 83, positioning: 83 } },
  ],
  'newcastle': [ // 4-3-3
    { name: 'A. Isaak',    role: 'ST', a: { speed: 87, shooting: 88, positioning: 86, decision: 84 } },
    { name: 'B. Guima',    role: 'CM', a: { passing: 86, vision: 85, tackling: 83, decision: 87 } },
    { name: 'S. Tonalli',  role: 'CM', a: { passing: 84, tackling: 83, vision: 82 } },
  ],
  'villa': [ // 4-4-2
    { name: 'O. Watkens',  role: 'ST', a: { speed: 86, shooting: 86, positioning: 86 } },
    { name: 'E. Martinz',  role: 'GK', a: { positioning: 88, decision: 85 } },
    { name: 'Y. Tielmans', role: 'CM', a: { passing: 84, vision: 83 } },
  ],
  'brighton': [ // 4-2-3-1
    { name: 'K. Mitoba',   role: 'LW', a: { speed: 86, shooting: 81, decision: 83 } },
  ],
};
for (const t of TEAMS) t.roster = STAR_ROSTERS[t.id] || [];

export function getTeamData(id) {
  return TEAMS.find((t) => t.id === id) || null;
}

// แปลงดาวเป็นโบนัสค่าพลัง (3 ดาว = มาตรฐาน 0)
export function strengthBonus(stars) {
  return ((stars ?? 3) - 3) * 6; // 5★ = +12, 4★ = +6, 3★ = 0, 2★ = -6, 1★ = -12
}

export function defaultMatchup() {
  return { homeTeamId: 'man-sky', awayTeamId: 'mersey-red' };
}
