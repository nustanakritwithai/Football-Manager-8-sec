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

## Deploy (GitHub Pages)

เกมเป็น static site — push ขึ้น `claude/tactic-manager-lab-design-cvyqs9` แล้ว GitHub Actions จะ deploy อัตโนมัติ

**Live URL:** https://nustanakritwithai.github.io/Football-Manager-8-sec/

ครั้งแรก (ถ้ายังไม่เคยเปิด Pages): ไปที่ repo **Settings → Pages → Build and deployment → Source** แล้วเลือก **GitHub Actions**

## วิธีเล่น

1. **Planning** — ลากนักเตะทีมน้ำเงิน (ทีมเรา) ไปตำแหน่งที่ต้องการ เลือก formation
   และปรับ team instructions (pressing, defensive line, width, tempo, passing style, risk)
2. กด **▶ Play Next 8 Seconds** — ระบบจำลอง 8 วินาที (80 tick) นักเตะวิ่ง จ่ายบอล
   เพรสซิ่ง สกัดบอล และอาจมีจังหวะยิงประตู
3. **Resolution** — ตำแหน่งสุดท้ายกลายเป็นสถานะจริงของเทิร์นถัดไป (ไม่ reset กลับ formation)
4. **Analysis** — อ่าน tactical scores 8 ตัว, event log และคำแนะนำจาก AI Assistant
   (ghost สีเหลืองบนสนาม = ตำแหน่งที่ AI แนะนำ)
5. แก้เกมแล้วเล่นต่อ — แมตช์ MVP ยาว 38 เทิร์น (~5 นาทีจำลอง)

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
save/load, export/import JSON, แมตช์ 38 เทิร์นพร้อมโอกาสยิงประตู

ยังไม่ทำ (ตามแผน): ลีก, ตลาดซื้อขาย, นักเตะจริง, ฤดูกาล, 3D, multiplayer, LLM runtime
