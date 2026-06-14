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
