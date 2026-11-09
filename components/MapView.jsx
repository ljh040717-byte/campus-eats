'use client';

// 지도: 카카오맵 JavaScript 키가 있으면 카카오맵, 없으면 간단한 반경 지도(SVG)로 표시

import { useEffect, useRef, useState } from 'react';
import { FOOD_GROUPS } from '@/lib/score';
import { GROUP_PASTEL } from './LottoDraw';

const GROUP_ICON = Object.fromEntries(FOOD_GROUPS.map((g) => [g.key, g.icon]));

const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.kakao?.maps?.LatLng) return resolve(window.kakao);
    const existing = document.getElementById('kakao-sdk');
    const onReady = () => window.kakao.maps.load(() => resolve(window.kakao));
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'kakao-sdk';
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
    s.async = true;
    s.onload = onReady;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function KakaoMap({ center, radius, places, selectedId, onSelect, onFail, pickIds = [] }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef([]);
  const [ready, setReady] = useState(false);
  const skipPan = useRef(0);
  const pickKey = pickIds.join(',');

  useEffect(() => {
    let alive = true;
    loadKakaoSdk()
      .then((kakao) => {
        if (!alive || !box.current) return;
        map.current = new kakao.maps.Map(box.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 4,
        });
        setReady(true);
      })
      .catch(() => onFail());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 큰 화면에서는 왼쪽 패널이 지도를 가리므로, 보이는 영역의 가운데로 맞춤
  function panelOffset() {
    return typeof window !== 'undefined' && window.innerWidth >= 900 ? 220 : 0;
  }

  // 위치나 반경이 바뀔 때만 지도 범위를 다시 맞춤 (가게를 고를 때마다 지도가 튀지 않게)
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !kakao) return;
    map.current.relayout();
    const level = radius <= 300 ? 3 : radius <= 600 ? 4 : radius <= 1100 ? 5 : 6;
    map.current.setLevel(level);
    map.current.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
    const dx = panelOffset();
    if (dx) map.current.panBy(-dx, 0);
  }, [ready, center, radius]);

  // 반경 원과 가게 핀 그리기
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !kakao) return;
    layers.current.forEach((l) => l.setMap(null));
    layers.current = [];

    layers.current.push(
      new kakao.maps.Circle({
        map: map.current,
        center: new kakao.maps.LatLng(center.lat, center.lng),
        radius,
        strokeWeight: 2,
        strokeColor: '#2251e0',
        strokeOpacity: 0.55,
        strokeStyle: 'shortdash',
        fillColor: '#2251e0',
        fillOpacity: 0.04,
      })
    );

    // 순위 상위 30곳만 아이콘 핀, 나머지는 작은 점으로 (핀이 너무 많으면 지도가 덮여서)
    const ICON_PINS = 30;
    places.forEach((p, i) => {
      const on = p.id === selectedId;
      const pickNo = pickIds.indexOf(p.id); // 랜덤 뽑기 후보면 0~2
      const el = document.createElement('button');
      el.title = p.name;
      el.onclick = () => onSelect(p.id);
      if (pickNo >= 0) {
        // 후보 3곳: 크고 귀여운 핀 + 번호 + 이름표
        el.className = `pin pin--pick${on ? ' pin--on' : ''}`;
        el.style.setProperty('--pick', GROUP_PASTEL[p.group] || '#fff');
        el.innerHTML = `<span class="pin-icon"></span><span class="pin-num">${pickNo + 1}</span><span class="pin-label"></span>`;
        el.querySelector('.pin-icon').textContent = GROUP_ICON[p.group] || '🍽️';
        el.querySelector('.pin-label').textContent = p.name;
        layers.current.push(
          new kakao.maps.CustomOverlay({ map: map.current, position: new kakao.maps.LatLng(p.lat, p.lng), content: el, yAnchor: 0.5, xAnchor: 0.2, zIndex: on ? 30 : 20 })
        );
        return;
      }
      if (i >= ICON_PINS && !on) {
        el.className = 'pin-mini';
        layers.current.push(
          new kakao.maps.CustomOverlay({ map: map.current, position: new kakao.maps.LatLng(p.lat, p.lng), content: el, yAnchor: 0.5, xAnchor: 0.5, zIndex: 0 })
        );
        return;
      }
      el.className = `pin${on ? ' pin--on' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'pin-icon';
      icon.textContent = GROUP_ICON[p.group] || '🍽️';
      el.appendChild(icon);
      if (on || (i < 3 && !pickIds.length)) {
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.textContent = p.name;
        el.appendChild(label);
      }
      layers.current.push(
        new kakao.maps.CustomOverlay({
          map: map.current,
          position: new kakao.maps.LatLng(p.lat, p.lng),
          content: el,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: on ? 10 : i < 3 ? 5 : 1,
        })
      );
    });
  }, [ready, center, radius, places, selectedId, onSelect, pickKey]);

  // 새로 뽑힌 후보 3곳이 한눈에 보이도록 지도 범위를 맞춤
  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !kakao || !pickIds.length) return;
    const bounds = new kakao.maps.LatLngBounds();
    pickIds.forEach((id) => {
      const p = places.find((x) => x.id === id);
      if (p) bounds.extend(new kakao.maps.LatLng(p.lat, p.lng));
    });
    bounds.extend(new kakao.maps.LatLng(center.lat, center.lng)); // 학교(출발점)도 같이 보이게
    const left = panelOffset() ? 460 : 40;
    map.current.setBounds(bounds, 90, 80, 110, left);
    skipPan.current = Date.now(); // 같은 순간의 '선택 가게로 이동'은 건너뜀
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickKey]);

  // 가게를 고르면 그 위치로 부드럽게 이동
  useEffect(() => {
    const kakao = window.kakao;
    if (Date.now() - skipPan.current < 150) return;
    if (!ready || !kakao || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (!p) return;
    const proj = map.current.getProjection();
    const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lng));
    const dx = panelOffset();
    const target = proj.coordsFromContainerPoint(new kakao.maps.Point(pt.x - dx, pt.y));
    map.current.panTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId]);

  return <div ref={box} className="map" />;
}

// 키가 없을 때: 학교를 중심으로 한 반경 지도
function RadarMap({ center, radius, places, selectedId, onSelect, pickIds = [] }) {
  const mLat = 111000;
  const mLng = 111000 * Math.cos((center.lat * Math.PI) / 180);
  const R = radius * 1.08;
  return (
    <div className="map map--radar">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label="학교 주변 식당 위치">
        {[1, 0.5].map((f) => (
          <circle key={f} cx="0" cy="0" r={radius * f} className="ring" />
        ))}
        <text x={radius * 0.5 + radius * 0.02} y={-radius * 0.02} className="ring-label" fontSize={R * 0.045}>
          {Math.round(radius / 2)}m
        </text>
        <text x={radius + radius * 0.02} y={-radius * 0.02} className="ring-label" fontSize={R * 0.045}>
          {radius}m
        </text>
        <rect x={-R * 0.025} y={-R * 0.025} width={R * 0.05} height={R * 0.05} className="school" />
        {[...places].reverse().map((p) => {
          const i = places.indexOf(p);
          const x = (p.lng - center.lng) * mLng;
          const y = -(p.lat - center.lat) * mLat;
          const on = p.id === selectedId || pickIds.includes(p.id);
          const r = R * (on ? 0.05 : 0.035);
          return (
            <g key={p.id} onClick={() => onSelect(p.id)} className={`dot${on ? ' dot--on' : ''}`}>
              <circle cx={x} cy={y} r={r} />
              {i < 9 && (
                <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={r * 1.15}>
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="map-note">카카오맵 키를 넣으면 실제 지도로 바뀌어요</p>
    </div>
  );
}

export default function MapView(props) {
  const [failed, setFailed] = useState(false);
  if (JS_KEY && !failed) return <KakaoMap {...props} onFail={() => setFailed(true)} />;
  return <RadarMap {...props} />;
}
