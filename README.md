# Tactic Manager Lab ⚽

เกมฟุตบอล manager แบบ **turn-based tactical simulation** — ทุก 1 เทิร์น = 8 วินาทีในสนาม

คุณคือโค้ชที่อ่านสนาม ลากตำแหน่งนักเตะ ปรับแท็กติก แล้วกดให้เกมเดินต่อ 8 วินาที
ระบบจะจำลองการเคลื่อนที่ การจ่ายบอล การเพรสซิ่ง แล้ว **commit ผลลัพธ์เข้า state จริง**
จากนั้น AI Assistant (rule-based) จะวิเคราะห์จุดอ่อนและแนะนำการแก้เกมในเทิร์นถัดไป

> แกนหลัก: จัดตำแหน่ง → เล่นต่อ 8 วินาที → จำลอง → อัปเดตสถานะจริง → AI วิเคราะห์ → แก้เกม → เล่นต่อ

## วิธีรัน

เกมใช้ ES Modules จึงต้องเปิดผ่าน HTTP server (เปิดไฟล์ตรงๆ ด้วย `file://` ไม่ได้)

```bash
# วิธีที่ 1: Python
python3 -m http.server 8000

# วิธีที่ 2: Node
npx serve .
```

แล้วเปิด `http://localhost:8000` ในเบราว์เซอร์

## Deploy

### Render (แนะนำ)

`render.yaml` ชี้ branch **`claude/ball-physics-lite-p27-k4c083`** (P2.7 Ball Physics + P2.8 Match Rules)

**ไม่ต้อง merge** เข้า `claude/tactic-manager-lab-design-cvyqs9` — ใช้วิธีเดียวกับตอน deploy P2.7:
Render Dashboard → Service → **Settings → Branch** → `claude/ball-physics-lite-p27-k4c083` → **Manual Deploy**

ถ้าตั้ง branch ไว้แล้วตั้งแต่ P2.7 แค่ push P2.8 ขึ้น branch เดิม Render จะ auto-deploy ให้

**ทางเลือก:** merge `claude/ball-physics-lite-p27-k4c083` → `claude/tactic-manager-lab-design-cvyqs9` แล้วชี้ Render กลับไปที่ base branch

**วิธีที่ 1: Blueprint**  
Render Dashboard → **New +** → **Blueprint** → เลือก repo `Football-Manager-8-sec` → Deploy

**วิธีที่ 2: API / Script**  
ตั้งค่า secrets แล้วรัน:

```bash
export RENDER_API_KEY="rnd_..."        # Account Settings → API Keys
export RENDER_OWNER_ID="tea_..."         # Workspace Settings → Workspace ID
# export RENDER_SERVICE_ID="srv_..."     # ถ้ามี service อยู่แล้ว ใส่แทนการสร้างใหม่
./scripts/deploy-render.sh
```

### GitHub Pages / jsDelivr

push ขึ้น `claude/tactic-manager-lab-design-cvyqs9` แล้ว GitHub Actions จะ publish ไปที่ branch `gh-pages` อัตโนมัติ

**เล่นออนไลน์ (jsDelivr):** https://cdn.jsdelivr.net/gh/nustanakritwithai/Football-Manager-8-sec@gh-pages/

**GitHub Pages:** https://nustanakritwithai.github.io/Football-Manager-8-sec/  
เปิดใช้ที่ **Settings → Pages → Deploy from branch → `gh-pages` / `/ (root)`**

## วิธีเล่น

1. **Planning** — ลากนักเตะทีมน้ำเงินเพื่อ **ออกคำสั่งวิ่ง** (ไม่ใช่ย้ายตำแหน่งทันที):
   เส้นเหลือง = คำสั่ง, X = จุดหมาย, วงประ = รัศมีที่วิ่งถึงได้จริงใน 8 วินาที
   (คิดจาก speed × stamina × role) ลากเกินระบบจะ clamp ให้ · ดับเบิลคลิก = ยกเลิกคำสั่ง
   เลือก formation และปรับ team instructions ได้ตามปกติ
2. กด **▶ Play Next 8 Seconds** — ระบบจำลอง 8 วินาที (80 tick) นักเตะค่อยๆ วิ่งตามคำสั่ง
   ผู้ถือบอลตัดสินใจเองว่าจะ **pass / carry / dribble / hold / shoot / clear / switch play**
   ส่วนคนไม่มีบอลวิ่งทำทางตาม role + team phase (ST วิ่งช่อง, ปีกถ่าง width,
   fullback overlap, DM คุมหลังบอล)
3. **Resolution** — ตำแหน่งสุดท้ายกลายเป็นสถานะจริงของเทิร์นถัดไป (ไม่ reset กลับ formation)
4. **Analysis** — อ่าน tactical scores 8 ตัว, event log และคำแนะนำจาก AI Assistant
   (ghost สีเหลืองบนสนาม = ตำแหน่งที่ AI แนะนำ)
5. แก้เกมแล้วเล่นต่อ — แมตช์เต็ม 90 นาที: 2 ครึ่ง ครึ่งละ 40 เทิร์น (รวม 80 เทิร์น)
   นาฬิกาแมตช์เดิน 0→45 (พักครึ่ง ฟื้น stamina +35%, คู่แข่งเขี่ยครึ่งหลัง) →90:00 (Full Time)

### ปุ่มทั้งหมด

| ปุ่ม | หน้าที่ |
|---|---|
| Play Next 8 Seconds | จำลองเทิร์นถัดไป |
| Reset Formation | กลับตำแหน่ง formation เริ่มต้น (ผู้เล่นสั่งเองเท่านั้น) |
| Clear Paths | ล้างเส้น path การเคลื่อนที่ |
| Save / Load | บันทึก/โหลดแผนผ่าน localStorage |
| Export / Import JSON | ส่งออก/นำเข้าแผนเป็นไฟล์ (มี validation กัน JSON เสีย) |

### Tactical Scores (0-100)

Defensive Stability · Attack Threat · Midfield Control · Counter Risk ·
Compactness · Pressing Efficiency · Passing Options · Fatigue Load

## โครงสร้างไฟล์

```
index.html              โครงหน้าเกม: canvas + tactical dashboard
style.css               layout และ visual style
src/main.js             entry point: init + game loop
src/config.js           ค่าคงที่ (ขนาดสนาม, tick rate, สี)
src/state.js            game state กลาง
src/pitch.js            วาดสนามฟุตบอล
src/player.js           player object + การวาดนักเตะ
src/team.js             สร้างทีม home/away + สไตล์ AI คู่แข่ง
src/ball.js             ลูกบอล การส่ง loose ball
src/formations.js       formation presets (4-3-3, 4-2-3-1, 4-4-2, 3-5-2)
src/input.js            ลากนักเตะ / เลือก / tooltip
src/simulation.js       จำลอง 8 วินาที (80 tick) — หัวใจของเกม
src/tacticalAnalyzer.js คำนวณ tactical scores + ตรวจจุดอ่อน
src/aiAssistant.js      ผู้ช่วยโค้ช rule-based
src/ui.js               dashboard, score bars, overlay บนสนาม
src/saveLoad.js         localStorage + export/import JSON + validation
src/utils.js            helper (distance, clamp, lerp, ...)
```

## Tech Stack

HTML + CSS + JavaScript (ES Modules) + Canvas API + localStorage — ไม่มี framework, ไม่มี backend, ไม่มี AI API

## ขอบเขต MVP

มีแล้ว: สนาม 2D, นักเตะ 22 คน, ลากตำแหน่ง, 4 formations, ลูกบอล/possession,
simulation 8 วินาที + commit state จริง, path history, tactical scores 8 ตัว,
AI Assistant rule-based + ghost suggestion, match clock, turn history (10 เทิร์นล่าสุด),
save/load, export/import JSON, แมตช์เต็ม 90 นาที (2 ครึ่ง × 40 เทิร์น) + พักครึ่ง

## P2: Tactical Intelligence

ยกระดับ match engine จาก "ลากหมาก + จ่ายบอลวน" เป็น "ออกคำสั่งโค้ช + นักเตะตัดสินใจเอง":

- **Movement radius** — ลาก = ตั้ง intended target ภายในรัศมีที่วิ่งถึงจริงใน 8 วินาที
  ไม่มี teleport ตำแหน่งจริงเปลี่ยนเฉพาะระหว่าง simulation
- **Ball carrier decision** — ผู้ถือบอลเลือก action ที่ดีที่สุดจาก
  pass / carry ball / dribble 1v1 / hold รอเพื่อน / shoot / clear / switch play
- **Off-ball movement** — ST วิ่งช่องระหว่าง CB, ปีกรักษา width หรือวิ่งหลังแบ็ก,
  fullback overlap ตาม risk, DM อยู่หลังบอลกัน counter, ปีกถอยช่วยแบ็กตอนรับ
- **Team phase** — BUILD_UP / ATTACKING / FINAL_THIRD / DEFENDING /
  TRANSITION_TO_ATTACK / TRANSITION_TO_DEFENSE (มี counter-press ช่วง transition)
- **Team objective** — buildUp, progressLeft/Right/Middle, attackHalfSpace,
  switchPlay, counterAttack, highPress, midBlock, recoverShape — มีผลต่อทั้งการจ่าย
  การ carry และการวิ่ง (แสดงบน scoreboard)
- **Anti-clustering** — separation force + congestion grid 8×5 กันนักเตะกองรวมกัน
  และลดคะแนนจ่าย/วิ่งเข้าโซนแน่น
- **Pass memory + progression** — กัน ping-pong passing, โทษการจ่ายถอยไร้เหตุผล,
  through pass ให้ runner ที่กำลังวิ่งเข้า space
- **AI Assistant ใหม่** — เตือน clustering, เสีย width, ผู้ถือบอลโดดเดี่ยว,
  ส่งบอลวนไม่ progress, ไม่มี off-ball run, CB/DM หลุดโซน

## P3: TacticAI Tools

ฟีเจอร์ชุดใหม่ตามแนวคิด [TacticAI ของ Google DeepMind](docs/TACTICAI-RESEARCH.md)
(ระบบที่ทำนายเกมล่วงหน้า 8 วินาทีให้ Palmeiras):

- **👁 Preview 8s** — "เห็นอนาคตก่อนกด Play": จำลอง 8 วินาทีข้างหน้าบนสำเนา state
  แล้ววาดเป็น ghost trails จาง ๆ พร้อมสรุป (บอลจบที่ใคร / มีโอกาสยิงไหม)
  ลากนักเตะแก้แผนแล้วกด Preview ใหม่ได้เรื่อย ๆ — state จริงไม่ถูกแตะ
- **Receiver %** — passing lanes แสดงความน่าจะเป็นผู้รับบอลคนต่อไป (top 3)
  แบบเดียวกับ UI ของ TacticAI
- **โอกาสยิงใน 8 วิ (xG)** — P(shot) ของทั้งสองทีม คิดแบบเปเปอร์:
  Σ P(ผู้รับ=i) · P(ยิง|ผู้รับ=i) แสดงเป็น bar ใต้ tactical scores
- **🛡 Adjust (AI จัดรับ)** — guided refinement: hill-climbing ตำแหน่งนักเตะรับ
  ภายใน movement radius เพื่อลดโอกาสยิงคู่แข่ง + counter risk แล้วเสนอเป็น ghost
  (เทียบเท่า generative refinement ของ TacticAI แต่ใช้ optimizer บน heuristic)
- **✅ ใช้คำแนะนำ AI** — แปลง ghost ทั้งหมดเป็นคำสั่งวิ่งจริงในคลิกเดียว
- **⚽ ซ้อมเตะมุม** — จัดสถานการณ์ corner ทั้งสองทีม (คนเตะ, ตัวโจมตีในกรอบ,
  คนคุม second ball, แนวกันสวน vs แนวรับ zonal + เสา) ตามรอยที่ TacticAI
  เริ่มพิสูจน์ตัวเองกับลูกเตะมุมก่อน
- **Similar situation retrieval** — เทียบรูปเกมปัจจุบันกับจุดเริ่มของเทิร์นในอดีต
  (รวมภาพกระจกซ้าย-ขวาแบบ D2 symmetry) ถ้าเคยโดนเจาะในรูปเกมเดียวกัน AI จะเตือน
- **Export Dataset** — บันทึกข้อมูลต่อเทิร์น (positions เริ่ม/จบ, objective, stats,
  shots, scores) สูงสุด 200 เทิร์น สำหรับวิเคราะห์หรือฝึกโมเดลเบา ๆ ภายหลัง
- **🗺 Space Control (Pitch Control แบบ Spearman)** — heatmap ว่าใครคุมพื้นที่
  ตรงไหน คิดจากเวลาที่นักเตะที่เร็วที่สุดของแต่ละทีมวิ่งถึงแต่ละจุด
  (speed × stamina จริง) + ตัวเลขส่วนแบ่งคุมกลางสนาม/final third
- **EPV (xT-lite)** — ผู้ถือบอลตัดสินใจด้วย "มูลค่าพื้นที่": การจ่าย/พาบอลที่ดี
  คือย้ายบอลไปตำแหน่งที่มีโอกาสนำไปสู่ประตูสูงขึ้น ไม่ใช่แค่ไปข้างหน้า
- **⏪ What-if เทิร์นที่แล้ว (counterfactual)** — ย้อนสนามกลับจุดเริ่มเทิร์นล่าสุด
  เป็น sandbox ลองยืน/สั่ง/เล่นใหม่ได้อิสระ ออกจากโหมดเมื่อไรแมตช์จริงกลับมาเหมือนเดิม
- **Ghost defender replay** — เทิร์นไหนโดนเจาะ ระบบวาดวง ghost "แนวที่ควรยืน"
  ของกองหลังที่หลุดตำแหน่งมากที่สุด พร้อมบอกระยะที่คลาดไป
- **🌫 Fog of War** — โหมดอ่านเกมขั้นสูง: เห็นคู่แข่งเฉพาะรัศมีสายตานักเตะเรา/บอล
  ที่เหลือเป็นวงคาดการณ์ "?" ที่ความไม่แน่นอนขยายตามเวลาที่คลาดสายตา
- **⚡ Penalty mini-game (game theory)** — โดนเสียบในกรอบอาจได้จุดโทษ
  เลือกมุมยิง/ทางพุ่ง GK สู้กับ AI แบบ mixed strategy
- **🧠 Train Pass Model** — ทุกการจ่ายของทีมถูกเก็บเป็นข้อมูลฝึก กดปุ่มเดียว
  ฝึก logistic regression ใน browser แล้วโมเดลช่วยเลือกจังหวะจ่ายจริงในเกม
- **Finishing instinct (P2.6)** — ใน final third นักเตะเปลี่ยน mindset จาก
  "progression" เป็น "end product": must-shoot zone (<16m มุมเปิด) ยิงเกือบทุกกรณี,
  มุมแคบริมกรอบ → cutback หาตัวกลางเขตโทษ, มีเพื่อน tap-in โล่งกว่า → จ่าย,
  ห้าม hold/carry เพลินหน้าประตู และห้ามยิงมั่วจากไกล (>27m/มุมแคบ = ไม่ยิง)
- **Cross / Early ball (P2.7)** — ปีก/แบ็กริมเส้นเปิดบอลโด่งเข้ากรอบหาตัวรอ
  ที่ marker ห่างสุด (บอลลอยข้ามหัว ตัดกลางทางไม่ได้ ไปวัดกันที่ลูกกลางอากาศ
  ตอนบอลตก — ใครชนะ duel ได้บอล แล้วยิงจังหวะเดียวได้) ส่วน early ball
  คือโยนจากลึกข้ามแนวรับให้ runner ก่อนเกมรับตั้งหลัก เด่นช่วง counter
- **⚽ Ball Physics Lite (P2.7)** — บอลเป็น "วัตถุกลม": มี velocity แนวราบ/แนวตั้ง (z),
  spin, friction, gravity และความเด้ง → กลิ้งแล้วค่อยหยุด, เปิดยาว/เคลียร์แล้วเด้ง,
  พุ่งจ่อกองหลังแล้ว **แฉลบ** เป็น loose ball, รับบอลแรง/โดนบีบ/บอลเด้งแล้ว
  **first touch หลุด**, ลูกยิง **โดนบล็อก / GK ปัด / ชนเสา** กลายเป็น rebound,
  แล้วเกิด **second ball contest** — ใครยืนตำแหน่งดี/หันเข้าหาบอล/สดกว่า เก็บตกได้ก่อน
  (randomness ถูกคุมด้วยบริบท: ความเร็วบอล, pressure, positioning, stamina ไม่ใช่ pinball)
  AI Assistant เตือนเรื่อง rebound, second ball, first touch, deflection ในแดนหลัง
- **🏟 Match Rules & Restart (P2.8)** — เกมเป็น "แมตช์จริง" แบบ turn-based:
  นับสกอร์เมื่อบอลข้ามเส้นประตูระหว่างเสา, บอลออก → throw-in / goal kick / corner
  (ตัดสินจาก lastTouchTeam), ฟาวล์จาก context (tackle/pressure/aggression/stamina/discipline)
  → free kick นอกกรอบ / penalty ในกรอบ, ใบเหลืองเบื้องต้น, advantage แบบ simplified
  **เมื่อบอลตายกลางเทิร์น (goal/out/foul) simulation หยุดทันที** ไม่เล่นต่อจนครบ 8 วิ →
  เข้า dead ball แล้วกด Play เพื่อ execute restart ตามกติกา (kickoff/corner/free kick/penalty
  auto-resolve), clock เดินเฉพาะวินาทีที่บอล live, scoreboard/overlay แสดง playState + restart spot
  และ AI Assistant แนะนำ set piece + เตือนเสีย corner/ฟาวล์หน้าเขตโทษ
  (MVP — ยังไม่ทำ offside / VAR / ไล่ผู้เล่นออกจากใบแดง / set-piece play ละเอียด)
- **🥅 Finishing Engine (P2.9)** — ระบบจบสกอร์ 6 ชั้น: shot context → xG → เลือกโซนกรอบประตู
  → block check → goalkeeper reach → outcome แทนตรรกะ "ยิง=ติดโกล" เดิม:
  **โอกาสเข้าผูกกับ xG** (คุมสกอร์ด้วยคุณภาพโอกาส ไม่ใช่ให้ GK เซฟทุกลูก), `chooseShotTarget`
  แบ่งกรอบเป็นโซน (low/top corner, near post, central) กันยิงกลางตลอด, GK เซฟ/รับติด/ปัดออก/
  กระฉอกตาม placement & power & reach, มี block→corner/rebound, ยิงพลาด→goal kick, ชนเสา
  เก็บ matchStats (shots/onTarget/goals/xG/bigChances/saves/blocks/posts) + AI เตือน placement/
  finishing/GK แข็ง — บาลานซ์ ~2 ประตู/เกม, on-target 2–6, สกอร์ทั่วไป 0-0/1-0/1-1/2-1

## การทดสอบ

```bash
node tests/p2-tactical.mjs     # movement radius, no-teleport, anti-clustering
node tests/p3-tools.mjs        # preview, adjust, corner, retrieval, dataset
node tests/p5-research.mjs     # penalty, learning, what-if, fog of war
node tests/p26-finishing.mjs   # must-shoot, cutback, no wild shots, shot volume, cross
node tests/p27-ball-physics.mjs # rolling, bounce, deflection, first touch, rebound, second ball
node tests/p28-match-rules.mjs # goal/ball-out, restart exec, foul, dead-ball stop, save/load
node tests/p29-finishing.mjs   # xG bands, target zones, GK-not-a-wall, score balance, calibration
```

ยังไม่ทำ (ตามแผน): ลีก, ตลาดซื้อขาย, นักเตะจริง, ฤดูกาล, 3D, multiplayer, LLM runtime
