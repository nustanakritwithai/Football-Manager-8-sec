# TacticAI Research Notes — ต้นไอเดียของ Tactic Manager Lab

เอกสารสรุปการศึกษา TacticAI (Google DeepMind) เพื่อนำแนวคิดมาพัฒนาเกมต่อ
อัปเดต: มิถุนายน 2026

---

## 1. TacticAI คืออะไร

ระบบ AI ผู้ช่วยโค้ชฟุตบอลของ Google DeepMind พัฒนาร่วมกับ Liverpool FC
ตีพิมพ์ใน Nature Communications (มีนาคม 2024) โฟกัสที่ **ลูกเตะมุม (corner kick)**
และล่าสุด (10 มิ.ย. 2026) จับมือกับ **Palmeiras** เป็นสโมสรแรกของโลกที่ใช้เวอร์ชัน
**open play** ที่ **ทำนายพลวัตของเกม "ล่วงหน้า 8 วินาที"** — ตัวเลขเดียวกับ
core loop ของเกมเราพอดี

## 2. เทคนิคหลักจากเปเปอร์ (corner-kick version)

### 2.1 ฟุตบอลเป็นกราฟ ไม่ใช่จุด 22 จุด

- **Node = นักเตะ 1 คน** ฟีเจอร์ต่อ node: ตำแหน่ง (x,y), ความเร็ว (vx,vy),
  ส่วนสูง, น้ำหนัก, และ flag ว่าถือบอลหรือไม่ — นักเตะเป็น "นิรนาม"
  (ไม่ใช้ชื่อ/identity ทำให้โมเดล generalize)
- **กราฟ fully connected** — ทุกคู่นักเตะมี edge, ฟีเจอร์ edge บอกว่า
  เป็นเพื่อนร่วมทีมหรือคู่แข่ง
- โมเดล: **Graph Attention Network (GATv2)** 4 ชั้น, 8 attention heads

### 2.2 ความสมมาตรของสนาม (D2 group equivariance)

สนามฟุตบอลสมมาตรซ้าย-ขวา/บน-ล่าง → สถานการณ์เดียวกันที่ถูกพลิกกระจก
ควรได้คำตอบเดียวกัน TacticAI จึงประมวลผล 4 มุมมองพร้อมกัน
(ปกติ, พลิกแนวนอน, พลิกแนวตั้ง, พลิกทั้งคู่) แล้วให้ทั้ง 4 view คุยกัน
→ **แก้ปัญหา data น้อย** (คอร์เนอร์มีแค่ ~10 ครั้ง/นัด)

### 2.3 สามงานหลัก (ตรงกับภาพ diagram B)

| งาน | คำถาม | ผลลัพธ์ |
|---|---|---|
| **Receiver?** | ใครจะสัมผัสบอลคนแรก | top-3 accuracy **0.782 ± 0.039** |
| **Shot?** | จะเกิดการยิงไหม | F1 **0.64 ± 0.02** โดยแยกเป็น P(shot) = Σ P(shot\|receiver=i)·P(receiver=i) |
| **Adjust?** | ควรขยับนักเตะอย่างไรเพื่อเพิ่ม/ลดโอกาสยิง | generative (VAE): สุ่มตำแหน่ง+ความเร็วใหม่ของทีมหนึ่งโดยตรึงอีกทีม แล้ว condition ด้วยผลลัพธ์ที่ต้องการ (shot=0 สำหรับแก้เกมรับ, shot=1 สำหรับเกมรุก) |

### 2.4 Dataset และการประเมินโดยผู้เชี่ยวชาญ Liverpool

- คอร์เนอร์ 7,176 ครั้งจาก Premier League 2020-21 (กรองจาก 9,693),
  tracking 25 เฟรม/วินาที + event stream
- ผู้เชี่ยวชาญ 5 คน (data scientist 3, video analyst 1, ผู้ช่วยโค้ช 1):
  - ชอบคำแนะนำของ TacticAI มากกว่าแผนจริง **90%** ของ 50 เคส
  - แยกคอร์เนอร์ที่ AI สร้างกับของจริง **แทบไม่ออก** (F1 0.60 ใกล้ระดับเดา 0.5)
  - งานค้นหาสถานการณ์คล้าย: recall 0.63 vs baseline 0.33

## 3. เวอร์ชัน Palmeiras (open play, 2026)

- ทำนายพลวัต open play **ล่วงหน้าสูงสุด 8 วินาที** แบบ real time
- ใช้ข้อมูลภาพระดับ broadcast (ไม่ต้องใช้เซ็นเซอร์พิเศษ)
- ทีม data science ใช้ **drag-and-drop interface**: ลากนักเตะบนสนามเสมือน
  แล้วดูผลกระทบลูกโซ่ทันที — *"ถ้าดัน left back สูงขึ้น 5 เมตร โครงสร้าง
  เกมรับทั้งระบบจะเปลี่ยนอย่างไร"*
- นี่คือ interaction แบบเดียวกับ Planning Phase ของเกมเราเป๊ะ

## 4. Map สู่เกมเรา — มีแล้ว / ควรทำต่อ

### มีแล้ว (MVP + P2)

| แนวคิด TacticAI | ในเกมเรา |
|---|---|
| นักเตะเป็น agent มีตำแหน่ง/ความเร็ว/บทบาท | player model + role behavior |
| จำลอง 8 วินาทีข้างหน้า | turn engine 80 tick |
| Drag & drop ทดสอบ setup | intent drag + movement radius (P2) |
| ความสัมพันธ์ระหว่างนักเตะ (ใกล้ใคร, lane เปิด, โดน press) | passOptions, pressure, congestion grid |
| คำแนะนำปรับตำแหน่ง | AI Assistant + ghost positions (rule-based) |

### ควรทำต่อ (P3 เรียงตามความคุ้ม)

1. **Preview Next 8 Seconds (ghost simulation)** — จุดขายเดียวกับ TacticAI:
   ระหว่าง planning กดดูตัวอย่างจำลองจาง ๆ ของ 8 วินาทีข้างหน้าด้วยคำสั่งปัจจุบัน
   (รัน simulation บน state copy ด้วย seed คงที่ วาดเป็น ghost path)
   → ผู้เล่น "เห็นอนาคตก่อนกด Play" แล้วแก้แผนได้ทันที
2. **Receiver % (ทำแล้วในคอมมิตนี้)** — แปลงคะแนน pass options เป็นความน่าจะเป็น
   แสดง % ข้างผู้รับ 3 อันดับ เหมือน UI 92%/68%/89% ในภาพโปรโมต
3. **Shot probability (xG เบื้องต้น)** — แสดง P(shot) ของทั้งสองทีมต่อเทิร์น
   คำนวณแบบ TacticAI: Σ P(shot|ผู้รับ)·P(ผู้รับ) จาก heuristic ที่มีอยู่
4. **Adjust? button (guided refinement)** — ปุ่ม "ให้ AI จัดเกมรับ":
   hill-climbing ตำแหน่งนักเตะรับ 1-2 คน (ภายใน movement radius) เพื่อ minimize
   attack threat/shot prob ของคู่แข่ง แล้วเสนอเป็น ghost — เทียบเท่า generative
   refinement ของ TacticAI แต่ใช้ optimizer บน heuristic แทน VAE (ไม่ต้องใช้ ML)
5. **Set-piece sandbox (โหมดเตะมุม)** — TacticAI พิสูจน์ตัวเองกับคอร์เนอร์ก่อน
   เพราะเป็นสถานการณ์ปิด ตัวแปรน้อย → ทำโหมดซ้อม corner แยกในเกมเราได้ง่าย
   และโชว์ความลึกแท็กติกชัด
6. **Similar situation retrieval** — ใช้ turn history หา snapshot ที่ positions
   คล้ายปัจจุบัน (ระยะ Frobenius/EMD อย่างง่าย) แล้วเตือนว่า "เคยโดนแบบนี้เทิร์น 12"
7. **D2 symmetry สำหรับ heuristic** — normalize สถานการณ์ให้บอลอยู่ฝั่งเดียวก่อน
   วิเคราะห์ แล้ว map กลับ → กฎซ้าย/ขวาสมมาตรกันเสมอ ลด bug rule เขียนฝั่งเดียว
8. **ระยะยาว: เก็บ replay เป็น dataset** — ทุกเทิร์น log (positions, action, ผลลัพธ์)
   เป็น JSON → ภายหลังฝึกโมเดลเบา ๆ (เช่น logistic regression รันใน JS) ทำ
   receiver/shot prediction จริงแทน heuristic โดยไม่ต้องพึ่ง API

## 5. บทเรียนเชิงออกแบบ

- TacticAI ไม่ได้ "เล่นแทนโค้ช" แต่ช่วยให้โค้ช **ทดลองเร็วขึ้น** — เกมเราต้องรักษา
  หลักนี้: AI ชี้จุดอ่อน + เสนอ ghost แต่ผู้เล่นตัดสินใจเอง
- ผลลัพธ์ที่ผู้เชี่ยวชาญชอบ 90% ไม่ใช่เพราะ "ทายแม่น" แต่เพราะคำแนะนำ
  **actionable และดูเป็นธรรมชาติ** — ตรงกับหลัก AI Assistant ของเรา
  (ห้ามพูดกว้าง ต้องชี้เฉพาะ + แนะ action)
- เริ่มจากสถานการณ์ปิด (corner) ก่อนแล้วค่อยขยายเป็น open play —
  ยืนยันแนวทาง MVP → P2 → P3 ของเรา

## Part 2: งานวิจัยที่ TacticAI ต่อยอดมา (ศึกษาเพิ่มเติม)

### 2.1 Game Plan: What AI can do for Football (DeepMind + Liverpool, JAIR 2021)

เปเปอร์วิสัยทัศน์ที่นำมาสู่ TacticAI — วาง "AI ฟุตบอล" เป็น 3 ชั้นซ้อนกัน:

1. **Predictive** — ทำนายสิ่งที่จะเกิด (ผู้รับบอล, การยิง, วิถีการวิ่ง)
2. **Generative** — สร้างสถานการณ์ทางเลือก / **counterfactual**
   ("ถ้าตอนนั้นกองหลังยืนอีกแบบ ผลจะเป็นอย่างไร")
3. **Prescriptive** — แนะนำว่าควรทำอะไร (จุดที่ AI ฟุตบอลมีค่าที่สุดกับโค้ช)

→ **เกมเราเดินครบทั้ง 3 ชั้นแล้ว**: Preview 8s (predictive), corner sandbox +
preview ซ้ำหลังแก้แผน (generative/counterfactual), Adjust + AI Assistant (prescriptive)

นอกจากนี้เปเปอร์ยังวิเคราะห์จุดโทษด้วย **game theory** (penalty = เกม
ผู้รักษาประตู-คนยิงแบบ mixed strategy) → ไอเดียต่อยอด: penalty mini-game

### 2.2 Pitch Control (Spearman) — *implement แล้วในรอบนี้*

โมเดลพื้นฐานที่วงการ analytics ใช้ก่อนยุค GNN: ความน่าจะเป็นที่ทีมจะคุมบอล
ณ จุดใดจุดหนึ่ง = ฟังก์ชันของ "เวลาที่ผู้เล่นที่เร็วที่สุดของแต่ละทีมไปถึงจุดนั้น"
(ระยะ ÷ ความเร็ว + เวลาตอบสนอง ผ่าน sigmoid) — Graph Imputer ของ DeepMind
ก็ใช้ pitch control เป็น downstream task

→ ในเกม: `src/pitchControl.js` คำนวณ grid 28×18 จาก speed×stamina จริงของ
นักเตะ แสดงเป็น heatmap (ปุ่ม 🗺 Space Control) + ตัวเลข "คุมพื้นที่กลางสนาม/
final third" บน dashboard

### 2.3 EPV / Expected Threat (xT) — *implement แล้วในรอบนี้*

มูลค่าของการครองบอล ณ ตำแหน่งหนึ่ง = โอกาสที่ possession นี้จะจบด้วยประตู
การกระทำที่ดีไม่ใช่ "ไปข้างหน้า" แต่คือ "ย้ายบอลไปยังตำแหน่งที่มูลค่าสูงขึ้น"
(Fernández & Bornn แยก EPV เป็นองค์ประกอบ pass / carry / shot)

→ ในเกม: `epvValue(x,y)` พื้นผิวมูลค่าแบบ closed-form (สูงสุดกลางหน้ากรอบ)
ถูกถักเข้าไปในคะแนนการจ่าย (`valueGain`) และทิศทางการ carry — ผู้ถือบอล
ตอนนี้เลือกเส้นทางที่ "เพิ่มมูลค่า" ไม่ใช่แค่เดินหน้า

### 2.4 Data-Driven Ghosting (Le, Carr, Yue, Lucey — Sloan 2017)

ระบบ "ghost" ที่เรียนจาก tracking data ว่า *กองหลังลีกเฉลี่ย/ทีมชั้นนำ
จะยืนตรงไหนในสถานการณ์นี้* แล้ววาดเทียบกับตำแหน่งจริง → ตอบคำถาม
"ผู้เล่นคนนี้ควรเล่นอย่างไรเมื่อเทียบกับมาตรฐาน" — ปุ่ม **Adjust ของเราคือ
prescriptive ghosting เวอร์ชัน heuristic แล้ว** ต่อยอดได้: หลังจบเทิร์น
วาด ghost "ตำแหน่งที่ควรยืน" เทียบกับที่ยืนจริงของกองหลังที่พลาด

### 2.5 Graph Imputer / Multiagent off-screen prediction (Sci. Reports 2022)

ทำนายตำแหน่งผู้เล่นที่ "หลุดจากกล้อง broadcast" ด้วย graph network + VAE —
สำคัญเพราะทำให้ TacticAI เวอร์ชัน Palmeiras ใช้แค่ภาพถ่ายทอดสดได้

→ ไอเดียเกมที่เจ๋งมาก: **Fog-of-War / Scouting mode** — โค้ชเห็นเฉพาะโซน
ที่ scout มองอยู่ ตำแหน่งคู่แข่งนอกสายตาแสดงเป็น "การคาดการณ์" (วงเบลอ)
ที่อัปเดตเมื่อเห็นจริง → เพิ่มมิติการอ่านเกมโดยไม่ต้องใช้ ML

### 2.6 Backlog ใหม่จาก Part 2 (เรียงตามคุ้มค่า)

1. ~~Pitch control map + EPV ในการตัดสินใจ~~ — **เสร็จแล้ว**
2. **Ghost defender replay** — หลังเทิร์นที่โดนเจาะ วาดตำแหน่ง "ที่ควรยืน"
   ของกองหลังเทียบกับที่ยืนจริง (ghosting แบบ 2.4)
3. **Counterfactual เทิร์นที่แล้ว** — โหลด snapshot ต้นเทิร์นจาก history
   มาเป็น sandbox ชั่วคราว ลองยืนใหม่ + Preview โดยไม่กระทบแมตช์จริง
4. **Fog-of-War scouting mode** (2.5) — โหมดความยากสูง
5. **Penalty mini-game แบบ game theory** (2.1) — เลือกมุมยิง/พุ่งแบบ
   mixed strategy เมื่อเกิดจุดโทษ
6. **ใช้ replay dataset ฝึก receiver model จริง** — logistic regression
   เล็ก ๆ ใน JS จาก Export Dataset แทน softmax heuristic

## 6. แหล่งอ้างอิง

- เปเปอร์: [TacticAI: an AI assistant for football tactics — Nature Communications](https://www.nature.com/articles/s41467-024-45965-x) ([arXiv](https://arxiv.org/abs/2310.10553))
- บล็อก DeepMind: [TacticAI: AI assistant for football tactics](https://deepmind.google/discover/blog/tacticai-ai-assistant-for-football-tactics/)
- ข่าว Palmeiras: [TNW — TacticAI can predict football plays 8 seconds before they happen](https://thenextweb.com/news/google-deepmind-tacticai-football-palmeiras-predict-plays)
- บริบทเพิ่มเติม: [MIT Technology Review](https://www.technologyreview.com/2024/03/19/1089927/google-deepminds-new-ai-assistant-helps-elite-soccer-coaches-get-even-better/)

แหล่งอ้างอิง Part 2:

- [Game Plan: What AI can do for Football, and What Football can do for AI (JAIR 2021)](https://arxiv.org/pdf/2011.09192)
- [Multiagent off-screen behavior prediction in football — Scientific Reports 2022 (Graph Imputer)](https://www.nature.com/articles/s41598-022-12547-0)
- [Data-Driven Ghosting using Deep Imitation Learning — Le, Carr, Yue, Lucey (Sloan 2017)](https://la.disneyresearch.com/wp-content/uploads/Data-Driven-Ghosting-using-Deep-Imitation-Learning-Paper1.pdf)
- [A framework for the fine-grained evaluation of the instantaneous expected value of soccer possessions (EPV — Fernández, Bornn, Cervone)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8570314/)
- [LaurieOnTracking — โค้ดตัวอย่าง pitch control ของ Spearman (Friends of Tracking)](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking)
