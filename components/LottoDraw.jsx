'use client';

// 🎲 랜덤 뽑기 애니메이션 — 로또 추첨기
//  ① 유리 통 안에서 공(가게)들이 바람에 섞이며 튀어다님
//  ② 당첨 공 하나가 아래 출구로 빠져나와 관을 타고 굴러 떨어짐
//  ③ 공이 커지며 가게 이름 공개 → 잠시 후 자동으로 지도로 돌아가 위치를 보여줌

import { useEffect, useRef, useState } from 'react';
import { FOOD_GROUPS } from '@/lib/score';

const GROUP_ICON = Object.fromEntries(FOOD_GROUPS.map((g) => [g.key, g.icon]));
const GROUP_COLOR = { 한식: '#ff6b5a', 중식: '#ffb020', 일식: '#4f8cff', 양식: '#34c58a', 기타: '#a77bff' };

const W = 320; // 캔버스 너비
const H = 420; // 캔버스 높이 (통 + 관 + 받침)
const CX = W / 2;
const CY = 165;
const R = 135; // 통 반지름
const BR = 19; // 공 반지름
const MIX_MS = 2600; // 섞는 시간
const EXIT_MS = 600; // 당첨 공이 출구로 가는 시간
const AUTO_BACK_MS = 2600; // 이름 공개 후 지도로 돌아가기까지

function sample(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export default function LottoDraw({ candidates, onDone, onClose }) {
  const canvas = useRef(null);
  const [winner, setWinner] = useState(null);
  const [phase, setPhase] = useState('mix'); // mix → reveal
  const [round, setRound] = useState(0);

  // 한 판 시작: 당첨 가게를 정하고, 같이 섞일 공들을 고름
  useEffect(() => {
    if (!candidates.length) return;
    const win = candidates[Math.floor(Math.random() * candidates.length)];
    const others = sample(candidates.filter((p) => p.id !== win.id), 21);
    const pool = sample([win, ...others], others.length + 1);
    setWinner(win);
    setPhase('mix');

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
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
      const d = 30 + Math.random() * 60;
      return {
        p,
        win: p.id === win.id,
        x: CX + Math.cos(a) * d,
        y: CY + 40 + Math.sin(a) * d * 0.6,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        rot: Math.random() * Math.PI,
      };
    });
    const wb = balls.find((b) => b.win);

    let start = performance.now();
    let raf;
    let exitFrom = null;
    let stage = 'mix'; // mix → exit → fall → done

    function drawBall(b, scale = 1) {
      const r = BR * scale;
      const col = GROUP_COLOR[b.p.group] || '#999';
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.15, b.x, b.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, col);
      g.addColorStop(1, shade(col, -28));
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // 가운데 흰 원 + 음식 아이콘 (로또 공 숫자 자리)
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fill();
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(b.rot) * 0.5);
      ctx.font = `${Math.round(r * 0.75)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GROUP_ICON[b.p.group] || '🍽️', 0, 1);
      ctx.restore();
    }

    function drawMachine() {
      // 받침대
      ctx.fillStyle = '#1a3fb4';
      roundRect(ctx, CX - 70, H - 46, 140, 30, 10);
      ctx.fill();
      // 관 (통 아래 → 받침)
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 2;
      roundRect(ctx, CX - BR - 5, CY + R - 6, (BR + 5) * 2, H - 46 - (CY + R - 6), 8);
      ctx.fill();
      ctx.stroke();
      // 통 (유리)
      const glass = ctx.createRadialGradient(CX - 50, CY - 60, 10, CX, CY, R);
      glass.addColorStop(0, 'rgba(255,255,255,.55)');
      glass.addColorStop(1, 'rgba(255,255,255,.12)');
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.fillStyle = glass;
      ctx.fill();
    }

    function drawGlassFront() {
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.stroke();
      // 반사광
      ctx.beginPath();
      ctx.arc(CX, CY, R - 14, Math.PI * 1.1, Math.PI * 1.45);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    function physics(t, blow) {
      for (const b of balls) {
        if (b.win && stage !== 'mix') continue;
        b.vy += 0.32; // 중력
        // 아래쪽에서 바람이 불어 공을 띄움
        if (b.y > CY + 20) {
          b.vy -= blow * (0.6 + Math.random() * 0.9);
          b.vx += (Math.random() - 0.5) * blow * 1.6;
        }
        b.vx *= 0.995;
        b.vy *= 0.995;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vx * 0.05;
        // 통 벽에 튕김
        const dx = b.x - CX;
        const dy = b.y - CY;
        const dist = Math.hypot(dx, dy);
        const max = R - BR - 3;
        if (dist > max) {
          const nx = dx / dist;
          const ny = dy / dist;
          b.x = CX + nx * max;
          b.y = CY + ny * max;
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.86;
          b.vy = (b.vy - 2 * dot * ny) * 0.86;
        }
      }
      // 공끼리 부딪힘
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const c = balls[j];
          if ((a.win || c.win) && stage !== 'mix') continue;
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

    function frame(now) {
      const t = now - start;
      if (stage === 'mix' && t > MIX_MS) {
        stage = 'exit';
        exitFrom = { x: wb.x, y: wb.y, t: now };
      }
      const blow = stage === 'mix' ? (t < 300 ? t / 300 : 1) * (1.35 + 0.35 * Math.sin(t / 140)) : 0.35;
      physics(t, blow);

      if (stage === 'exit') {
        const k = Math.min(1, (now - exitFrom.t) / EXIT_MS);
        const e = k * k * (3 - 2 * k);
        wb.x = exitFrom.x + (CX - exitFrom.x) * e;
        wb.y = exitFrom.y + (CY + R - BR - 4 - exitFrom.y) * e;
        wb.rot += 0.3;
        if (k >= 1) {
          stage = 'fall';
          wb.vy = 2;
        }
      } else if (stage === 'fall') {
        wb.vy += 0.6;
        wb.y += wb.vy;
        wb.rot += 0.35;
        const floor = H - 46 - BR - 2;
        if (wb.y >= floor) {
          wb.y = floor;
          stage = 'done';
          setTimeout(() => setPhase('reveal'), 350);
        }
      }

      ctx.clearRect(0, 0, W, H);
      drawMachine();
      for (const b of balls) if (!(b.win && stage !== 'mix')) drawBall(b);
      drawGlassFront();
      if (stage !== 'mix') drawBall(wb, stage === 'done' ? 1.15 : 1);

      if (stage !== 'done') raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  // 이름 공개 후 자동으로 지도로 돌아감
  useEffect(() => {
    if (phase !== 'reveal' || !winner) return;
    const t = setTimeout(() => onDone(winner), AUTO_BACK_MS);
    return () => clearTimeout(t);
  }, [phase, winner, onDone]);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const col = winner ? GROUP_COLOR[winner.group] || '#999' : '#999';

  return (
    <div className="lotto" role="dialog" aria-modal="true" aria-label="오늘 뭐 먹지? 랜덤 뽑기">
      <button className="lotto-close" onClick={onClose} aria-label="닫기">✕</button>
      <p className="lotto-title">{phase === 'mix' ? '오늘 뭐 먹지? 추첨 중…' : '오늘의 맛집 당첨!'}</p>

      <div className="lotto-stage">
        <canvas ref={canvas} className={`lotto-canvas${phase === 'reveal' ? ' dim' : ''}`} style={{ width: W, height: H }} />

        {phase === 'reveal' && winner && (
          <div className="lotto-reveal">
            <div className="lotto-ball" style={{ '--ball': col }}>
              <span>{GROUP_ICON[winner.group]}</span>
            </div>
            <h2>{winner.name}</h2>
            <p>{winner.group} · 도보 {winner.walk}분 · {winner.distance}m</p>
            <div className="lotto-actions">
              <button className="lotto-again" onClick={() => setRound((r) => r + 1)}>🔄 다시 뽑기</button>
              <button className="lotto-go" onClick={() => onDone(winner)}>지도에서 보기 →</button>
            </div>
            <div className="lotto-timer" aria-hidden="true"><span style={{ animationDuration: `${AUTO_BACK_MS}ms` }} /></div>
          </div>
        )}
      </div>
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

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
