// 귀여운 효과음 — 소리 파일 없이 브라우저(Web Audio)로 바로 만들어 냄
// 브라우저 정책상 첫 클릭 이후부터 소리가 남

let ctx = null;
let muted = false;

if (typeof window !== 'undefined') {
  try {
    muted = window.localStorage.getItem('sfx-muted') === '1';
  } catch {}
}

function audio() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 음 하나: from → to 로 미끄러지는 짧은 소리
function note(from, to, { at = 0, dur = 0.1, type = 'sine', vol = 0.13 } = {}) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export const sfx = {
  pop: () => note(420, 860, { dur: 0.09 }), // 뽁! 기본 버튼
  on: () => { note(520, 700, { dur: 0.07 }); note(780, 1050, { at: 0.07, dur: 0.1 }); }, // 띠링↑ 켜기
  off: () => { note(700, 520, { dur: 0.07 }); note(520, 360, { at: 0.06, dur: 0.1 }); }, // 띠롱↓ 끄기
  pin: () => note(300, 760, { dur: 0.12, type: 'triangle', vol: 0.16 }), // 뿅! 지도 핀
  open: () => { note(600, 900, { dur: 0.08 }); note(900, 1200, { at: 0.06, dur: 0.09, vol: 0.09 }); }, // 카드 펼치기
  start: () => [392, 523, 659].forEach((f, i) => note(f, f * 1.02, { at: i * 0.07, dur: 0.12, type: 'triangle', vol: 0.15 })), // 뽑기 시작
  tick: () => note(1100 + Math.random() * 500, 900, { dur: 0.03, type: 'square', vol: 0.025 }), // 통 안에서 달그락
  roll: () => note(880, 300, { dur: 0.16, type: 'triangle', vol: 0.14 }), // 공이 또르르
  land: (i = 0) => note(360 + i * 110, 620 + i * 140, { dur: 0.11, vol: 0.17 }), // 공 착지 콩!
  tada: () => [523, 659, 784, 1047].forEach((f, i) => note(f, f, { at: i * 0.085, dur: i === 3 ? 0.35 : 0.13, type: 'triangle', vol: 0.15 })), // 짜잔~
  pick: () => { note(659, 659, { dur: 0.09, type: 'triangle' }); note(988, 988, { at: 0.09, dur: 0.2, type: 'triangle' }); }, // 골랐다!
};

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  try {
    window.localStorage.setItem('sfx-muted', v ? '1' : '0');
  } catch {}
  if (!v) sfx.on();
}
