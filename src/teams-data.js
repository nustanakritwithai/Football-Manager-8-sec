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

// ดาวเด่น/ตัวจริง/ตัวสำรอง+ดาวรุ่ง แต่ละทีม (ชื่อ homage จำได้ว่าใคร แต่สะกดเพี้ยนเลี่ยงสิทธิชื่อจริง)
// a = ค่าพลังเฉพาะตัวที่ปั้นตามโปรไฟล์จริง (key ที่ไม่ระบุ = ใช้ค่ามาตรฐานตามตำแหน่ง + เรตติ้งทีม)
// เรียง "ตัวจริง (ตามช่อง formation) ก่อน → ตัวสำรอง/ดาวรุ่งหลัง" ให้ตรงระบบจับช่อง
// (★ = ดาวดัง, ◇ = ดาวรุ่ง/wonderkid) — แก้/เพิ่มชื่อจริงได้ที่ไฟล์นี้ที่เดียว
const STAR_ROSTERS = {
  'man-sky': [ // 4-3-3
    { name: 'Edersson',    role: 'GK', a: { positioning: 88, passing: 90, decision: 83 } },
    { name: 'J. Gvardiola', role: 'LB', a: { tackling: 85, speed: 83, passing: 81, positioning: 85 } },
    { name: 'R. Dais',     role: 'CB', a: { tackling: 88, positioning: 89, passing: 82, decision: 85 } },
    { name: 'N. Akay',     role: 'CB', a: { tackling: 84, positioning: 85, passing: 80 } },
    { name: 'R. Lewes',    role: 'RB', a: { speed: 80, passing: 81, tackling: 78, decision: 80 } }, // ◇
    { name: 'Rodry',       role: 'DM', a: { passing: 88, vision: 85, tackling: 85, positioning: 90, decision: 91, pressing: 80 } },
    { name: 'P. Foten',    role: 'CM', a: { passing: 87, vision: 86, shooting: 84, decision: 89, speed: 81 } },
    { name: 'B. Silvva',   role: 'CM', a: { passing: 88, vision: 87, decision: 89, speed: 78 } },
    { name: 'J. Doku',     role: 'LW', a: { speed: 92, shooting: 78, decision: 78, passing: 76 } },
    { name: 'E. Halund',   role: 'ST', a: { speed: 88, shooting: 94, positioning: 93, decision: 82, aggression: 75 } },
    { name: 'Savio',       role: 'RW', a: { speed: 86, shooting: 80, passing: 81, decision: 80 } }, // ◇
    { name: 'S. Ortega',   role: 'GK', a: { positioning: 82, decision: 80 } },
    { name: 'J. Stonas',   role: 'CB', a: { tackling: 84, positioning: 86, passing: 83, decision: 84 } },
    { name: 'N. Akee',     role: 'LB', a: { tackling: 83, speed: 80, positioning: 82 } },
    { name: 'M. Kovacik',  role: 'DM', a: { passing: 85, vision: 82, tackling: 80 } },
    { name: "N. O'Reilly", role: 'CM', a: { passing: 78, speed: 81, decision: 78 } }, // ◇
    { name: 'O. Bobb',     role: 'RW', a: { speed: 85, shooting: 80, decision: 81, passing: 80 } }, // ◇
    { name: 'O. Marmosh',  role: 'ST', a: { speed: 87, shooting: 84, positioning: 83 } },
  ],
  'mersey-red': [ // 4-3-3
    { name: 'Alisson',     role: 'GK', a: { positioning: 91, decision: 87, passing: 80 } },
    { name: 'A. Robersen', role: 'LB', a: { speed: 82, passing: 82, tackling: 80, positioning: 80 } },
    { name: 'V. van Dik',  role: 'CB', a: { tackling: 90, positioning: 92, speed: 80, passing: 81, aggression: 78 } },
    { name: 'I. Konatay',  role: 'CB', a: { tackling: 86, positioning: 85, speed: 85 } },
    { name: 'T. Arnald',   role: 'RB', a: { passing: 88, vision: 86, speed: 80, shooting: 78 } },
    { name: 'W. Endoo',    role: 'DM', a: { tackling: 85, positioning: 85, passing: 80, pressing: 82 } },
    { name: 'A. MacAllstar', role: 'CM', a: { passing: 86, vision: 85, decision: 86, shooting: 80 } },
    { name: 'D. Szobo',    role: 'CM', a: { passing: 85, shooting: 85, vision: 83, speed: 83 } },
    { name: 'L. Diaaz',    role: 'LW', a: { speed: 89, shooting: 83, decision: 81 } },
    { name: 'H. Ekitiky',  role: 'ST', a: { speed: 85, shooting: 83, positioning: 83 } }, // ◇
    { name: 'M. Sallah',   role: 'RW', a: { speed: 90, shooting: 90, passing: 81, decision: 89, positioning: 89 } },
    { name: 'C. Kellaher', role: 'GK', a: { positioning: 82 } },
    { name: 'J. Gomaz',    role: 'CB', a: { tackling: 84, positioning: 84, speed: 84 } },
    { name: 'K. Tsimika',  role: 'LB', a: { speed: 82, tackling: 80 } },
    { name: 'S. Bajcetik', role: 'DM', a: { passing: 80, tackling: 80, speed: 80 } }, // ◇
    { name: 'C. Jonas',    role: 'CM', a: { passing: 82, speed: 81, decision: 82 } },
    { name: 'F. Chesa',    role: 'RW', a: { speed: 85, shooting: 82, decision: 82 } },
    { name: 'C. Gakpoo',   role: 'ST', a: { speed: 84, shooting: 84, positioning: 84 } },
  ],
  'nlon-red': [ // 4-3-3 (Arsenal)
    { name: 'D. Rayya',    role: 'GK', a: { positioning: 87, passing: 82, decision: 84 } },
    { name: 'M. Lewes-Skelly', role: 'LB', a: { speed: 82, passing: 82, tackling: 79, decision: 80 } }, // ◇
    { name: 'G. Magalan',  role: 'CB', a: { tackling: 88, positioning: 88, aggression: 80, speed: 82 } },
    { name: 'W. Saleba',   role: 'CB', a: { tackling: 88, positioning: 88, speed: 85 } },
    { name: 'J. Timbar',   role: 'RB', a: { tackling: 84, positioning: 84, speed: 84, passing: 80 } },
    { name: 'D. Rece',     role: 'DM', a: { tackling: 88, passing: 83, positioning: 87, decision: 87, aggression: 80 } },
    { name: 'M. Ödegard',  role: 'CM', a: { passing: 90, vision: 90, shooting: 83, decision: 91 } },
    { name: 'M. Marino',   role: 'CM', a: { passing: 82, vision: 82, shooting: 80, positioning: 82 } },
    { name: 'G. Martinello', role: 'LW', a: { speed: 88, shooting: 83, decision: 80 } },
    { name: 'V. Gyokeres', role: 'ST', a: { speed: 86, shooting: 88, positioning: 88, decision: 82 } },
    { name: 'B. Saca',     role: 'RW', a: { speed: 86, shooting: 86, passing: 84, decision: 87 } },
    { name: 'K. Hain',     role: 'GK', a: { positioning: 80 } }, // ◇
    { name: 'J. Kewior',   role: 'CB', a: { tackling: 83, positioning: 83 } },
    { name: 'R. Calafori', role: 'LB', a: { tackling: 83, passing: 82, speed: 82 } },
    { name: 'T. Party',    role: 'DM', a: { tackling: 84, passing: 83, positioning: 84, decision: 84 } },
    { name: 'E. Nwanari',  role: 'CM', a: { passing: 82, shooting: 83, vision: 82, speed: 82 } }, // ◇
    { name: 'R. Nelsen',   role: 'RW', a: { speed: 84, shooting: 80 } },
    { name: 'K. Havatz',   role: 'ST', a: { speed: 82, shooting: 84, positioning: 84 } },
  ],
  'man-red': [ // 4-2-3-1 (Man Utd)
    { name: 'A. Onanna',   role: 'GK', a: { positioning: 83, passing: 85, decision: 80 } },
    { name: 'L. Shawe',    role: 'LB', a: { tackling: 82, speed: 80, passing: 80 } },
    { name: 'M. de Lict',  role: 'CB', a: { tackling: 86, positioning: 86, passing: 81, aggression: 80 } },
    { name: 'L. Yorro',    role: 'CB', a: { tackling: 84, positioning: 84, speed: 85 } }, // ◇
    { name: 'N. Mazraui',  role: 'RB', a: { speed: 82, tackling: 80, passing: 80 } },
    { name: 'M. Ugartay',  role: 'DM', a: { tackling: 85, positioning: 84, passing: 80, pressing: 83 } },
    { name: 'K. Maynoo',   role: 'DM', a: { passing: 84, vision: 82, tackling: 80, decision: 84, speed: 80 } }, // ◇
    { name: 'A. Garnacha', role: 'LW', a: { speed: 88, shooting: 83, decision: 80 } }, // ◇
    { name: 'B. Fernandez', role: 'AM', a: { passing: 90, vision: 90, shooting: 86, decision: 88 } },
    { name: 'A. Diallo',   role: 'RW', a: { speed: 85, shooting: 82, decision: 81 } }, // ◇
    { name: 'R. Höjlund',  role: 'ST', a: { speed: 85, shooting: 82, positioning: 82 } }, // ◇
    { name: 'T. Heaten',   role: 'GK', a: { positioning: 80 } },
    { name: 'L. Martinaz', role: 'CB', a: { tackling: 86, positioning: 85, aggression: 82, speed: 82 } },
    { name: 'P. Dorgu',    role: 'LB', a: { speed: 84, tackling: 80 } }, // ◇
    { name: 'T. Collyar',  role: 'DM', a: { passing: 78, tackling: 80, speed: 80 } }, // ◇
    { name: 'M. Mountt',   role: 'CM', a: { passing: 83, shooting: 82, vision: 82 } },
    { name: 'J. Zirkzy',   role: 'ST', a: { speed: 82, shooting: 82, positioning: 82 } },
  ],
  'wlon-blue': [ // 4-2-3-1 (Chelsea)
    { name: 'R. Sanchaz',  role: 'GK', a: { positioning: 82, passing: 82 } },
    { name: 'M. Cucurela', role: 'LB', a: { tackling: 82, speed: 82, passing: 80 } },
    { name: 'L. Colwell',  role: 'CB', a: { tackling: 85, positioning: 85, passing: 82, speed: 83 } }, // ◇
    { name: 'W. Fofana',   role: 'CB', a: { tackling: 85, positioning: 84, speed: 86 } },
    { name: 'R. Jamas',    role: 'RB', a: { speed: 86, tackling: 80, passing: 80 } },
    { name: 'M. Caicido',  role: 'DM', a: { tackling: 88, positioning: 86, passing: 81, pressing: 83 } },
    { name: 'E. Fernandaz', role: 'DM', a: { passing: 86, vision: 85, decision: 85, shooting: 80 } },
    { name: 'P. Neto',     role: 'LW', a: { speed: 87, shooting: 80, decision: 80 } },
    { name: 'C. Palmar',   role: 'AM', a: { passing: 88, shooting: 89, vision: 86, decision: 89 } },
    { name: 'N. Madueky',  role: 'RW', a: { speed: 88, shooting: 82, decision: 79 } }, // ◇
    { name: 'N. Jacksen',  role: 'ST', a: { speed: 87, shooting: 81, positioning: 80 } }, // ◇
    { name: 'F. Jorgensen', role: 'GK', a: { positioning: 80 } }, // ◇
    { name: 'A. Disasy',   role: 'CB', a: { tackling: 84, positioning: 83, speed: 83 } },
    { name: 'B. Chilwall', role: 'LB', a: { speed: 82, tackling: 80 } },
    { name: 'R. Lavia',    role: 'DM', a: { tackling: 83, passing: 81, pressing: 82 } }, // ◇
    { name: 'C. Nkunkoo',  role: 'CM', a: { shooting: 85, speed: 84, decision: 83 } },
    { name: 'M. Mudrik',   role: 'RW', a: { speed: 90, shooting: 78 } },
    { name: 'M. Guiu',     role: 'ST', a: { speed: 82, shooting: 80 } }, // ◇
  ],
  'nlon-white': [ // 4-2-3-1 (Spurs)
    { name: 'G. Vicaro',   role: 'GK', a: { positioning: 82, passing: 81 } },
    { name: 'D. Udogy',    role: 'LB', a: { speed: 85, tackling: 80 } }, // ◇
    { name: 'C. Romoro',   role: 'CB', a: { tackling: 86, positioning: 84, aggression: 83 } },
    { name: 'M. van de Ven', role: 'CB', a: { tackling: 85, positioning: 85, speed: 90 } },
    { name: 'P. Porro',    role: 'RB', a: { speed: 83, passing: 82, shooting: 78 } },
    { name: 'R. Bentancor', role: 'DM', a: { tackling: 83, passing: 82, positioning: 83 } },
    { name: 'Y. Bissouma', role: 'DM', a: { tackling: 85, positioning: 83, pressing: 83 } },
    { name: 'Son H.',      role: 'LW', a: { speed: 88, shooting: 88, decision: 86, positioning: 85 } },
    { name: 'J. Maddisen', role: 'AM', a: { passing: 86, vision: 86, shooting: 83 } },
    { name: 'D. Kuluseski', role: 'RW', a: { passing: 84, shooting: 82, speed: 83, vision: 83 } },
    { name: 'D. Solanky',  role: 'ST', a: { shooting: 83, positioning: 83 } },
    { name: 'A. Austen',   role: 'GK', a: { positioning: 78 } }, // ◇
    { name: 'R. Dragusin', role: 'CB', a: { tackling: 83, positioning: 83 } },
    { name: 'D. Spence',   role: 'LB', a: { speed: 83, tackling: 79 } },
    { name: 'A. Grey',     role: 'DM', a: { tackling: 80, passing: 79, speed: 81 } }, // ◇
    { name: 'P. Sar',      role: 'CM', a: { tackling: 82, passing: 80, speed: 82 } },
    { name: 'M. Tell',     role: 'RW', a: { speed: 86, shooting: 82 } }, // ◇
    { name: 'Richarlisen', role: 'ST', a: { speed: 83, shooting: 82, positioning: 82 } },
  ],
  'newcastle': [ // 4-3-3
    { name: 'N. Popo',     role: 'GK', a: { positioning: 85, decision: 83 } },
    { name: 'D. Burn',     role: 'LB', a: { tackling: 84, positioning: 83, aggression: 80 } },
    { name: 'S. Botman',   role: 'CB', a: { tackling: 86, positioning: 86, speed: 83 } },
    { name: 'F. Shar',     role: 'CB', a: { tackling: 84, positioning: 84, passing: 82 } },
    { name: 'T. Livremento', role: 'RB', a: { speed: 86, tackling: 80 } }, // ◇
    { name: 'B. Guima',    role: 'DM', a: { passing: 86, vision: 85, tackling: 83, decision: 87 } },
    { name: 'S. Tonalli',  role: 'CM', a: { passing: 84, tackling: 83, vision: 82 } },
    { name: 'J. Willok',   role: 'CM', a: { speed: 82, passing: 81, shooting: 80 } },
    { name: 'A. Gordan',   role: 'LW', a: { speed: 88, shooting: 82, decision: 81 } },
    { name: 'A. Isaak',    role: 'ST', a: { speed: 87, shooting: 88, positioning: 86, decision: 84 } },
    { name: 'H. Barns',    role: 'RW', a: { speed: 85, shooting: 81 } },
    { name: 'M. Gillaspy', role: 'GK', a: { positioning: 78 } },
    { name: 'J. Lascells', role: 'CB', a: { tackling: 82, positioning: 82 } },
    { name: 'L. Hal',      role: 'LB', a: { speed: 83, tackling: 79 } }, // ◇
    { name: 'S. Longstaf', role: 'DM', a: { tackling: 81, passing: 80 } },
    { name: 'J. Murfy',    role: 'CM', a: { speed: 84, shooting: 80, passing: 80 } },
    { name: 'W. Osola',    role: 'ST', a: { speed: 85, shooting: 80 } }, // ◇
  ],
  'villa': [ // 4-4-2
    { name: 'E. Martinz',  role: 'GK', a: { positioning: 88, decision: 85 } },
    { name: 'L. Digny',    role: 'LB', a: { speed: 80, passing: 81, tackling: 79 } },
    { name: 'E. Konza',    role: 'CB', a: { tackling: 84, positioning: 84, speed: 83 } },
    { name: 'P. Torrez',   role: 'CB', a: { tackling: 84, positioning: 85, passing: 82 } },
    { name: 'M. Cash',     role: 'RB', a: { speed: 83, tackling: 80 } },
    { name: 'J. McGinny',  role: 'LW', a: { passing: 82, shooting: 81, speed: 81, aggression: 80 } },
    { name: 'Y. Tielmans', role: 'CM', a: { passing: 84, vision: 83 } },
    { name: 'B. Kamarra',  role: 'CM', a: { tackling: 83, passing: 81, positioning: 83 } },
    { name: 'M. Rogars',   role: 'RW', a: { passing: 84, shooting: 84, vision: 83, speed: 83, decision: 85 } }, // ◇
    { name: 'O. Watkens',  role: 'ST', a: { speed: 86, shooting: 86, positioning: 86 } },
    { name: 'J. Duran',    role: 'ST', a: { speed: 85, shooting: 85, positioning: 83 } }, // ◇
    { name: 'R. Olson',    role: 'GK', a: { positioning: 80 } },
    { name: 'T. Mingz',    role: 'CB', a: { tackling: 83, positioning: 82 } },
    { name: 'I. Matsen',   role: 'LB', a: { speed: 84, tackling: 79 } }, // ◇
    { name: 'R. Barkly',   role: 'DM', a: { passing: 82, shooting: 81, vision: 82 } },
    { name: 'J. Ramsy',    role: 'CM', a: { passing: 81, speed: 82, shooting: 80 } }, // ◇
    { name: 'L. Baily',    role: 'ST', a: { speed: 87, shooting: 81 } },
  ],
  'brighton': [ // 4-2-3-1
    { name: 'B. Verbrugen', role: 'GK', a: { positioning: 82, passing: 83 } }, // ◇
    { name: 'P. Estupian', role: 'LB', a: { speed: 83, tackling: 80 } },
    { name: 'L. Dunk',     role: 'CB', a: { tackling: 85, positioning: 85, aggression: 80 } },
    { name: 'J. van Heck', role: 'CB', a: { tackling: 83, positioning: 83 } },
    { name: 'T. Lamptay',  role: 'RB', a: { speed: 88, tackling: 78 } },
    { name: 'C. Balaba',   role: 'DM', a: { tackling: 84, positioning: 83, pressing: 82 } }, // ◇
    { name: 'M. Wiefar',   role: 'DM', a: { passing: 82, tackling: 81 } },
    { name: 'K. Mitoba',   role: 'LW', a: { speed: 86, shooting: 81, decision: 83 } },
    { name: 'G. Rutar',    role: 'AM', a: { passing: 83, shooting: 82, vision: 82 } }, // ◇
    { name: 'Y. Mintay',   role: 'RW', a: { speed: 88, shooting: 80 } }, // ◇
    { name: 'J. Pedru',    role: 'ST', a: { speed: 84, shooting: 84, positioning: 83 } },
    { name: 'J. Steel',    role: 'GK', a: { positioning: 78 } },
    { name: 'Igor J.',     role: 'CB', a: { tackling: 83, positioning: 82 } },
    { name: 'F. Kadioglo', role: 'LB', a: { speed: 82, tackling: 80 } },
    { name: 'J. Hinshelwod', role: 'DM', a: { tackling: 80, passing: 80, speed: 82 } }, // ◇
    { name: "M. O'Rily",   role: 'CM', a: { passing: 83, vision: 82, shooting: 81 } },
    { name: 'S. Adingrah', role: 'RW', a: { speed: 87, shooting: 79 } },
    { name: 'D. Welbek',   role: 'ST', a: { shooting: 82, positioning: 82, speed: 81 } },
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
