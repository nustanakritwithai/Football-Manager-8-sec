// P5: ฝึกโมเดลจากข้อมูลในเกมจริง (ตามแนว "เก็บ replay เป็น dataset")
// logistic regression เล็ก ๆ รันใน JS ล้วน ทำนายว่าการจ่ายบอลจะสำเร็จไหม

const MAX_SAMPLES = 600;

// features (0..1 ทุกตัว): [laneSafety, receiverSpace, forward, distFit, valueGain, dist, pressure]
export const PASS_FEATURE_COUNT = 7;

export function collectPassSample(state, features, label) {
  if (!Array.isArray(features) || features.length !== PASS_FEATURE_COUNT) return;
  state.passSamples.push({ f: features.map((v) => +v.toFixed(3)), y: label ? 1 : 0 });
  if (state.passSamples.length > MAX_SAMPLES) state.passSamples.shift();
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function predictPass(model, f) {
  let z = model.b;
  for (let i = 0; i < model.w.length; i++) z += model.w[i] * (f[i] ?? 0);
  return sigmoid(z);
}

// batch gradient descent — ข้อมูลไม่กี่ร้อยแถว เทรนเสร็จใน <100ms
export function trainPassModel(samples, epochs = 400, lr = 0.6) {
  if (!samples || samples.length < 30) return null;
  const dim = samples[0].f.length;
  const w = new Array(dim).fill(0);
  let b = 0;

  for (let e = 0; e < epochs; e++) {
    const gw = new Array(dim).fill(0);
    let gb = 0;
    for (const s of samples) {
      let z = b;
      for (let i = 0; i < dim; i++) z += w[i] * s.f[i];
      const err = sigmoid(z) - s.y;
      for (let i = 0; i < dim; i++) gw[i] += err * s.f[i];
      gb += err;
    }
    for (let i = 0; i < dim; i++) w[i] -= (lr * gw[i]) / samples.length;
    b -= (lr * gb) / samples.length;
  }

  let correct = 0;
  for (const s of samples) {
    if ((predictPass({ w, b }, s.f) >= 0.5 ? 1 : 0) === s.y) correct++;
  }
  return { w, b, acc: correct / samples.length, n: samples.length };
}
