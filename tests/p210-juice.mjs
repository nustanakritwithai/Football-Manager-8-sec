// P-juice: ตรวจว่า audio.js import-safe และ no-op อย่างปลอดภัยใน headless (ไม่มี AudioContext)
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../src', import.meta.url));
const audio = await import(`${BASE}/audio.js`);

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failures++; } };

const fns = ['initAudio', 'unlockAudio', 'toggleSound', 'isSoundOn', 'setSoundEnabled',
  'playWhistle', 'playCheer', 'playKick', 'playSave', 'playPost', 'playOoh'];
for (const f of fns) assert(typeof audio[f] === 'function', `audio ต้อง export ${f}`);

// เรียกทุกฟังก์ชันใน Node (ไม่มี window/AudioContext) ต้องไม่ throw
let threw = null;
try {
  audio.initAudio();
  assert(typeof audio.isSoundOn() === 'boolean', 'isSoundOn คืน boolean');
  assert(audio.setSoundEnabled(false) === false, 'setSoundEnabled(false) คืน false');
  assert(audio.setSoundEnabled(true) === true, 'setSoundEnabled(true) คืน true');
  assert(typeof audio.toggleSound() === 'boolean', 'toggleSound คืน boolean');
  audio.unlockAudio();
  audio.playWhistle('short'); audio.playWhistle('long'); audio.playWhistle('double');
  audio.playCheer(); audio.playKick(); audio.playSave(); audio.playPost(); audio.playOoh();
} catch (e) { threw = e; }
assert(!threw, `เรียก audio ใน headless ต้องไม่ throw (ได้ ${threw && threw.message})`);
console.log('Audio import-safe + no-op OK');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL P-JUICE TESTS PASS ✅');
