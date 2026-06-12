// formation presets เก็บตำแหน่งแบบ normalized
// x: 0 = หน้าประตูตัวเอง → 1 = ประตูคู่แข่ง (เก็บเฉพาะช่วง 0..0.5 คือฝั่งตัวเอง)
// y: 0 = ริมสนามบน → 1 = ริมสนามล่าง

export const FORMATIONS = {
  '4-3-3': [
    { role: 'GK', x: 0.04, y: 0.50 },
    { role: 'LB', x: 0.18, y: 0.16 },
    { role: 'CB', x: 0.15, y: 0.38 },
    { role: 'CB', x: 0.15, y: 0.62 },
    { role: 'RB', x: 0.18, y: 0.84 },
    { role: 'DM', x: 0.27, y: 0.50 },
    { role: 'CM', x: 0.34, y: 0.32 },
    { role: 'CM', x: 0.34, y: 0.68 },
    { role: 'LW', x: 0.44, y: 0.16 },
    { role: 'ST', x: 0.46, y: 0.50 },
    { role: 'RW', x: 0.44, y: 0.84 },
  ],
  '4-2-3-1': [
    { role: 'GK', x: 0.04, y: 0.50 },
    { role: 'LB', x: 0.18, y: 0.16 },
    { role: 'CB', x: 0.15, y: 0.38 },
    { role: 'CB', x: 0.15, y: 0.62 },
    { role: 'RB', x: 0.18, y: 0.84 },
    { role: 'DM', x: 0.27, y: 0.40 },
    { role: 'DM', x: 0.27, y: 0.60 },
    { role: 'LW', x: 0.41, y: 0.18 },
    { role: 'AM', x: 0.39, y: 0.50 },
    { role: 'RW', x: 0.41, y: 0.82 },
    { role: 'ST', x: 0.47, y: 0.50 },
  ],
  '4-4-2': [
    { role: 'GK', x: 0.04, y: 0.50 },
    { role: 'LB', x: 0.17, y: 0.16 },
    { role: 'CB', x: 0.14, y: 0.38 },
    { role: 'CB', x: 0.14, y: 0.62 },
    { role: 'RB', x: 0.17, y: 0.84 },
    { role: 'LW', x: 0.33, y: 0.15 },
    { role: 'CM', x: 0.31, y: 0.40 },
    { role: 'CM', x: 0.31, y: 0.60 },
    { role: 'RW', x: 0.33, y: 0.85 },
    { role: 'ST', x: 0.45, y: 0.42 },
    { role: 'ST', x: 0.45, y: 0.58 },
  ],
  '3-5-2': [
    { role: 'GK', x: 0.04, y: 0.50 },
    { role: 'CB', x: 0.15, y: 0.30 },
    { role: 'CB', x: 0.13, y: 0.50 },
    { role: 'CB', x: 0.15, y: 0.70 },
    { role: 'LB', x: 0.29, y: 0.10 },
    { role: 'DM', x: 0.26, y: 0.50 },
    { role: 'CM', x: 0.34, y: 0.35 },
    { role: 'CM', x: 0.34, y: 0.65 },
    { role: 'RB', x: 0.29, y: 0.90 },
    { role: 'ST', x: 0.45, y: 0.42 },
    { role: 'ST', x: 0.45, y: 0.58 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

export function isValidFormation(name) {
  return Object.prototype.hasOwnProperty.call(FORMATIONS, name);
}
