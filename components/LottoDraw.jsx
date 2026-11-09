'use client';

// 🎲 랜덤 뽑기 — 귀여운 가챠 머신
//  ① 동그란 통 안에서 공(가게)들이 통통 섞임
//  ② 공 3개가 차례로 통 아래 → 배출구 → 받침 칸으로 콩콩 굴러 나옴
//  ③ 후보 3곳 카드 공개 → 하나를 고르거나, 3곳 다 지도에서 보기
//  뽑는 확률은 lib/score.js 의 drawWeight (가깝고 후기 많은 집이 최대 2배)

import { useEffect, useRef, useState } from 'react';
import { FOOD_GROUPS, weightedPicks } from '@/lib/score';

const GROUP_ICON = Object.fromEntries(FOOD_GROUPS.map((g) => [g.key, g.icon]));
export const GROUP_PASTEL = { 한식: '#FF9B85', 중식: '#FFC94D', 일식: '#7FB2FF', 양식: '#6FD3A4', 기타: '#C3A3FF' };

const INK = '#2B2A4C';
const W = 340;
const H = 460;
const CX = W / 2;
const CY = 150; // 통 중심
const R = 112; // 통 반지름
const BR = 21; // 공 반지름
const BALLS = 16;
const BODY = { x: 62, y: 236, w: 216, h: 124 };
const OUT = { x: CX + 38, y: 300 }; // 배출구 가운데
const TRAY_Y = 412;
const SLOTS = [CX - 82, CX, CX + 82];
const MIX_MS = 650; // 처음 섞는 시간
const GAP_MS = 330; // 다음 공이 나오기 시작하는 간격 (앞 공이 굴러가는 동안 겹쳐서 나옴)
const EXIT_MS = 170;
const CHUTE_MS = 120;
const POP_MS = 360;
const N_PICK = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ease = (k) => k * k * (3 - 2 * k);

export default function LottoDraw({ candidates, onDone, onClose }) {
  const canvas = useRef(null);
  const [picks, setPicks] = useState([]);
  const [phase, setPhase] = useState('mix'); // mix → reveal
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!candidates.length) return;
    const chosen = weightedPicks(candidates, N_PICK);
    const ids = new Set(chosen.map((p) => p.id));
    const others = shuffle(candidates.filter((p) => !ids.has(p.id))).slice(0, BALLS - chosen.length);
    const pool = shuffle([...chosen, ...others]);
    setPicks(chosen);
    setPhase('mix');

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('reveal');
      return;
    }

    const cv = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    const balls = pool.map((p, i) => {
      const a = (i / pool.length) * Math.PI * 2;
      const d = 20 + Math.random() * 55;
      return {
        p,
        order: chosen.findIndex((c) => c.id === p.id), // -1이면 꽝 공
        state: 'dome', // dome → exit → chute → pop → slot
        x: CX + Math.cos(a) * d,
        y: CY + 30 + Math.sin(a) * d * 0.6,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        rot: Math.random() * 6,
      };
    });
    const pickBalls = chosen.map((c) => balls.find((b) => b.p.id === c.id));

    const start = performance.now();
    let raf;
    let next = 0; // 다음에 나올 공 번호
    let nextAt = start + MIX_MS;
    let finished = false;

    function drawBall(b, s = 1) {
      const r = BR * s;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = GROUP_PASTEL[b.p.group] || '#ddd';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      // 반짝 점 하나
      ctx.beginPath();
      ctx.ellipse(-r * 0.42, -r * 0.45, r * 0.18, r * 0.11, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fill();
      ctx.rotate(Math.sin(b.rot) * 0.35);
      ctx.font = `${Math.round(r * 1.0)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GROUP_ICON[b.p.group] || '🍽️', 0, 2);
      ctx.restore();
    }

    function drawBody(t, mixing) {
      // 받침 칸
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#FFE2B8';
      roundRect(ctx, 34, TRAY_Y - 34, W - 68, 66, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(43,42,76,.10)';
      for (const x of SLOTS) {
        ctx.beginPath();
        ctx.ellipse(x, TRAY_Y + 16, BR + 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 몸통
      ctx.fillStyle = '#FF7A6B';
      roundRect(ctx, BODY.x, BODY.y, BODY.w, BODY.h, 24);
      ctx.fill();
      ctx.stroke();
      // 손잡이 (섞는 동안 빙글빙글)
      const kx = CX - 48;
      const ky = 298;
      ctx.beginPath();
      ctx.arc(kx, ky, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(kx, ky);
      ctx.rotate(mixing ? t / 160 : 0);
      ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.restore();
      // 배출구
      ctx.fillStyle = INK;
      roundRect(ctx, OUT.x - 30, OUT.y - 28, 60, 56, 16);
      ctx.fill();
      ctx.fillStyle = '#FFC94D';
      roundRect(ctx, OUT.x - 30, OUT.y - 28, 60, 14, 7);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
    }

    function drawDome(shake) {
      ctx.save();
      ctx.translate(shake, 0);
      // 뚜껑
      ctx.fillStyle = '#FF7A6B';
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      roundRect(ctx, CX - 26, CY - R - 16, 52, 26, 10);
      ctx.fill();
      ctx.stroke();
      // 통 (속)
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.fillStyle = '#EAF4FF';
      ctx.fill();
      ctx.restore();
    }

    function drawDomeFront(shake) {
      ctx.save();
      ctx.translate(shake, 0);
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      // 귀여운 반짝이
      ctx.beginPath();
      ctx.arc(CX, CY, R - 16, Math.PI * 1.15, Math.PI * 1.38);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.stroke();
      ctx.restore();
    }

    function physics(blow) {
      const inDome = balls.filter((b) => b.state === 'dome');
      for (const b of inDome) {
        b.vy += 0.3;
        if (b.y > CY + 10) {
          b.vy -= blow * (0.55 + Math.random() * 0.9);
          b.vx += (Math.random() - 0.5) * blow * 1.5;
        }
        b.vx *= 0.993;
        b.vy *= 0.993;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vx * 0.05;
        const dx = b.x - CX;
        const dy = b.y - CY;
        const dist = Math.hypot(dx, dy);
        const max = R - BR - 4;
        if (dist > max) {
          const nx = dx / dist;
          const ny = dy / dist;
          b.x = CX + nx * max;
          b.y = CY + ny * max;
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.85;
          b.vy = (b.vy - 2 * dot * ny) * 0.85;
        }
      }
      for (let i = 0; i < inDome.length; i++) {
        for (let j = i + 1; j < inDome.length; j++) {
          const a = inDome[i];
          const c = inDome[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < BR * 2) {
            const nx = dx / d;
            const ny = dy / d;
            const push = (BR * 2 - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            c.x += nx * push;
            c.y += ny * push;
            const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rel < 0) {
              a.vx += rel * nx * 0.9;
              a.vy += rel * ny * 0.9;
              c.vx -= rel * nx * 0.9;
              c.vy -= rel * ny * 0.9;
            }
          }
        }
      }
    }

    function moveBall(b, now) {
      const k = Math.min(1, (now - b.t0) / b.dur);
      const e = ease(k);
      if (b.state === 'exit') {
        b.x = b.from.x + (CX - b.from.x) * e;
        b.y = b.from.y + (CY + R - BR - 6 - b.from.y) * e;
        b.rot += 0.25;
        if (k >= 1) Object.assign(b, { state: 'chute', t0: now, dur: CHUTE_MS, from: { x: b.x, y: b.y } });
      } else if (b.state === 'chute') {
        b.x = b.from.x + (OUT.x - b.from.x) * e;
        b.y = b.from.y + (OUT.y - b.from.y) * e;
        if (k >= 1) Object.assign(b, { state: 'pop', t0: now, dur: POP_MS, from: { x: OUT.x, y: OUT.y } });
      } else if (b.state === 'pop') {
        // 배출구에서 튀어나와 자기 칸으로 콩콩
        const tx = SLOTS[b.order];
        const ty = TRAY_Y;
        b.x = b.from.x + (tx - b.from.x) * k;
        const arc = Math.sin(Math.min(1, k * 1.35) * Math.PI) * 46; // 큰 점프
        const bounce = k > 0.74 ? Math.abs(Math.sin(((k - 0.74) / 0.26) * Math.PI)) * 10 : 0; // 작은 통
        b.y = b.from.y + (ty - b.from.y) * Math.min(1, k * 1.35) - arc - bounce;
        b.rot += 0.3;
        if (k >= 1) {
          b.x = tx;
          b.y = ty;
          b.state = 'slot';
          b.landAt = now;
        }
      }
    }

    function frame(now) {
      const t = now - start;
      const mixing = next < N_PICK;
      if (mixing && now >= nextAt && pickBalls[next].state === 'dome') {
        const b = pickBalls[next];
        Object.assign(b, { state: 'exit', t0: now, dur: EXIT_MS, from: { x: b.x, y: b.y } });
        next += 1;
        nextAt = now + GAP_MS;
      }
      const blow = mixing ? Math.min(1, t / 300) * (1.3 + 0.35 * Math.sin(t / 130)) : 0.25;
      physics(blow);
      for (const b of pickBalls) if (['exit', 'chute', 'pop'].includes(b.state)) moveBall(b, now);

      const shake = mixing ? Math.sin(t / 45) * 2.2 : 0;
      ctx.clearRect(0, 0, W, H);
      for (const b of pickBalls) if (b.state === 'chute') drawBall(b); // 몸통 뒤로 지나감
      drawBody(t, mixing);
      drawDome(shake);
      ctx.save();
      ctx.translate(shake, 0);
      for (const b of balls) if (b.state === 'dome' || b.state === 'exit') drawBall(b);
      ctx.restore();
      drawDomeFront(shake);
      for (const b of pickBalls) {
        if (b.state === 'pop') drawBall(b);
        if (b.state === 'slot') {
          const k = Math.min(1, (now - b.landAt) / 220);
          drawBall(b, 1 + Math.sin(k * Math.PI) * 0.18); // 착지하면 뿅
        }
      }

      if (!finished && pickBalls.every((b) => b.state === 'slot')) {
        finished = true;
        setTimeout(() => setPhase('reveal'), 180);
      }
      if (!finished || now - Math.max(...pickBalls.map((b) => b.landAt || 0)) < 300) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reveal = phase === 'reveal';

  return (
    <div className="lotto" role="dialog" aria-modal="true" aria-label="오늘 뭐 먹지? 랜덤 뽑기">
      <button className="lotto-close" onClick={onClose} aria-label="닫기">✕</button>
      <p className="lotto-title">{reveal ? '오늘의 후보 3!' : '두구두구…'}</p>

      <canvas ref={canvas} className="lotto-canvas" style={{ width: W, height: H, display: reveal ? 'none' : 'block' }} />

      {reveal && (
        <div className="lotto-reveal">
          <p className="lotto-sub">하나 골라봐요!</p>
          <ul className="lotto-cards">
            {picks.map((p, i) => (
              <li key={p.id} style={{ '--ball': GROUP_PASTEL[p.group] || '#ddd', '--d': `${i * 90}ms` }}>
                <button className="lotto-card" onClick={() => onDone(picks, p.id)}>
                  <span className="lotto-num">{i + 1}</span>
                  <span className="lotto-ball" aria-hidden="true">{GROUP_ICON[p.group]}</span>
                  <b>{p.name}</b>
                  <span className="lotto-stats">
                    <span className="stat stat--walk">🚶 {p.walk}분</span>
                    {p.blogCount != null && <span className="stat stat--blog">💬 후기 {p.blogCount >= 1000 ? `${(p.blogCount / 1000).toFixed(1)}천` : p.blogCount}</span>}
                  </span>
                  <span className="lotto-meta">{p.group} · {p.distance}m</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="lotto-actions">
            <button className="lotto-again" onClick={() => setRound((r) => r + 1)}>🔄 다시 뽑기</button>
            <button className="lotto-go" onClick={() => onDone(picks, null)}>🗺️ 3곳 다 지도에서 보기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
