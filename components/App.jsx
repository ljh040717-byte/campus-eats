'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView';
import LottoDraw, { GROUP_PASTEL } from './LottoDraw';
import Mascot from './Mascot';
import { sfx, isMuted, setMuted } from '@/lib/sfx';
import { filterAndScore, isNew, isOld, subCategory, foodGroup, foodColors, FOOD_GROUPS, FOOD_COLORS, WALK_M_PER_MIN, DETOUR } from '@/lib/score';

const RADII = [300, 500, 1000, 1500];
const SORTS = [
  ['score', '👍 추천순'],
  ['distance', '👟 가까운 순'],
  ['blog', '💬 후기순'],
];

// 후기 수 보기 좋게 (1529 → 1.5천)
const fmtCount = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : `${n}`);

// 걸리는 시간·후기 수를 눈에 띄는 알약으로
function Stats({ p, showBlog }) {
  return (
    <span className="stats">
      <span className="stat stat--walk">🚶 {p.walk}분</span>
      {showBlog && p.blogCount != null && <span className="stat stat--blog">💬 후기 {fmtCount(p.blogCount)}</span>}
      <span className="stat stat--dist">{p.distance}m</span>
    </span>
  );
}

const SOURCE_LABEL = {
  places: { kakao: '카카오 로컬', osm: 'OpenStreetMap', mock: '예시 데이터' },
  blog: { naver: '네이버 블로그', mock: '예시 데이터', off: '미연결' },
  license: { csv: '공공데이터(CSV)', api: '공공데이터(API)', mock: '예시 데이터', off: '미연결' },
};

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text, disabled]) => (
        <button key={v} role="radio" aria-checked={value === v} disabled={disabled} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children, disabled, title, icon }) {
  return (
    <button className={`chip${on ? ' on' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-pressed={on}>
      {icon && <span className="chip-icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

const GROUP_ICON = Object.fromEntries(FOOD_GROUPS.map((g) => [g.key, g.icon]));
const COLOR_BY_KEY = Object.fromEntries(FOOD_COLORS.map((c) => [c.key, c]));
const COLOR_ICON = { red: '🌶️', white: '🍲', brown: '🍖', green: '🥗' };

// 시간대별 인사말
function mealWord(h) {
  if (h < 5) return '야식';
  if (h < 10) return '아침';
  if (h < 15) return '점심';
  if (h < 17) return '간식';
  if (h < 22) return '저녁';
  return '야식';
}

function NumberField({ label, value, onChange, unit }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" min="0" inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <em>{unit}</em>
    </label>
  );
}

export default function App({ defaultCenter, centerName, edition = '공릉편' }) {
  const [center, setCenter] = useState(defaultCenter);
  const [where, setWhere] = useState(centerName);
  const [radius, setRadius] = useState(1000);
  const [sort, setSort] = useState('score');
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [newOnly, setNewOnly] = useState(false);
  const [oldOnly, setOldOnly] = useState(false);
  const [hideClosed, setHideClosed] = useState(true);
  const [weatherOn, setWeatherOn] = useState(false);
  const [gongang, setGongang] = useState({ on: false, left: 50, eat: 20, wait: 5 });
  const [quick, setQuick] = useState(false); // 🚨 빠밥 버튼 (공강 시간과 상관없이 급한 모드)

  // 공강 모드가 켜지면 위에서 고른 반경 대신, 남은 시간으로 걸어갈 수 있는 거리가 반경이 됨
  //   편도 시간 = (다음 수업까지 − 식사 − 주문·대기) ÷ 2  →  거리 = 편도 시간 × 보행 속도 ÷ 돌아가는 길 보정
  const walkBudget = (gongang.left - gongang.eat - gongang.wait) / 2; // 편도로 걸을 수 있는 분
  const gongRadius = Math.max(0, Math.min(Math.max(...RADII), Math.floor((walkBudget * WALK_M_PER_MIN) / DETOUR)));
  const effRadius = gongang.on ? Math.max(gongRadius, 1) : radius;

  const [data, setData] = useState({ places: [], sources: null, warnings: [] });
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [picks, setPicks] = useState([]); // 랜덤 뽑기 후보 3곳
  const [drawing, setDrawing] = useState(false);
  const [blogProgress, setBlogProgress] = useState(null);
  const [blogQuota, setBlogQuota] = useState(false); // 오늘 네이버 무료 한도를 다 썼는지
  const [meal, setMeal] = useState('오늘');
  const [mute, setMute] = useState(false);

  useEffect(() => {
    setMeal(mealWord(new Date().getHours()));
    setMute(isMuted());
  }, []);

  // 버튼·아이콘을 누를 때마다 귀여운 효과음 (눌린 것 종류에 따라 다른 소리)
  useEffect(() => {
    const onClick = (e) => {
      const el = e.target.closest?.('button, a, .dot');
      if (!el || el.disabled || el.matches('.mute, .rush-strip')) return;
      if (el.matches('.roulette, .lotto-again')) return sfx.start();
      if (el.matches('.lotto-card, .lotto-go')) return sfx.pick();
      if (el.matches('.pin, .pin-mini, .dot, .pick-chip, .locate')) return sfx.pin();
      if (el.matches('.card-main')) return sfx.open();
      if (el.matches('.switch, .chip, .circle')) {
        const wasOn = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true';
        return wasOn ? sfx.off() : sfx.on();
      }
      sfx.pop();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // 반경 최대치(1500m)로 한 번 불러오고, 작은 반경은 화면에서 거름 → API 호출 절약
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetch(`/api/places?lat=${center.lat}&lng=${center.lng}&radius=${Math.max(...RADII)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '불러오기 실패');
        return j;
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
        setBlogQuota(false);
        if (j.sources?.blog === 'naver') loadBlogCounts(j, () => alive);
        if (j.sources?.blog === 'quota') setBlogQuota(true);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // 목록을 먼저 보여준 뒤, 가까운 가게부터 20곳씩 후기 수를 받아서 채워 넣음
  async function loadBlogCounts(j, isAlive) {
    const targets = j.places.slice(0, j.blogLimit || 40);
    const chunks = [];
    for (let i = 0; i < targets.length; i += 20) chunks.push(targets.slice(i, i + 20));
    setBlogProgress({ done: 0, total: targets.length });

    let done = 0;
    let failed = 0;
    let stop = false;
    async function run(chunk) {
      try {
        const r = await fetch('/api/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ places: chunk.map(({ id, name, jibun }) => ({ id, name, jibun })) }),
        });
        const res = await r.json();
        if (!r.ok) throw new Error(res.error);
        failed += res.failed || 0;
        if (res.quota) stop = true; // 오늘 네이버 한도 소진 → 남은 묶음은 요청하지 않음
        if (!isAlive()) return;
        setData((d) => ({
          ...d,
          places: d.places.map((p) => (p.id in res.counts ? { ...p, blogCount: res.counts[p.id] } : p)),
        }));
      } catch {
        failed += chunk.length;
      }
      done += chunk.length;
      if (isAlive()) setBlogProgress({ done, total: targets.length });
    }

    // 동시에 2묶음씩 요청
    for (let i = 0; i < chunks.length && !stop; i += 2) {
      await Promise.all(chunks.slice(i, i + 2).map(run));
      if (!isAlive()) return;
    }
    if (stop) {
      setBlogQuota(true);
      setBlogProgress(null);
      return;
    }
    if (failed && isAlive()) {
      setData((d) => ({ ...d, warnings: [...(d.warnings || []), `네이버 후기 수 ${failed}건 조회 실패`] }));
    }
  }

  // 날씨 카드에 항상 보여주기 위해 위치가 바뀔 때마다 받아 옴 (무료, 키 불필요)
  useEffect(() => {
    let alive = true;
    fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then((w) => alive && setWeather(w))
      .catch(() => alive && setWeather({ source: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [center]);

  // 반경 안의 가게 수를 음식 종류별·색깔별로 셈 (타일에 숫자로 표시)
  const counts = useMemo(() => {
    const group = {};
    const color = {};
    data.places.forEach((p) => {
      if (p.distance > effRadius) return;
      const g = foodGroup(p);
      group[g] = (group[g] || 0) + 1;
      foodColors(p).forEach((c) => (color[c] = (color[c] || 0) + 1));
    });
    return { group, color };
  }, [data.places, effRadius]);

  // 후기 수가 하나라도 있어야 추천순·후기순이 의미가 있음 (0개도 데이터로 인정)
  const hasBlog = data.places.some((p) => p.blogCount != null);

  const list = useMemo(
    () =>
      filterAndScore(data.places, {
        radius: effRadius, categories, colors, newOnly, oldOnly, hideClosed, gongang, weatherOn, weather,
        sort: hasBlog ? sort : 'distance',
      }),
    [data.places, effRadius, categories, colors, newOnly, oldOnly, hideClosed, gongang, weatherOn, weather, sort, hasBlog]
  );

  const hasLicense = data.places.some((p) => p.license);
  const isMock = data.sources?.places === 'mock';

  const select = useCallback((id) => {
    setSelectedId(id);
    setOpenId(id);
    document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  function toggleCategory(c) {
    setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }

  function toggleColor(c) {
    setColors((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }

  function roulette() {
    if (!list.length) return;
    setDrawing(true);
  }

  // 추첨이 끝나면: 화면을 닫고 지도에 후보 3곳을 모두 표시
  //  chosenId가 있으면 그 집을 강조, 없으면(3곳 다 보기) 강조 없이 3곳만
  const finishDraw = useCallback((ps, chosenId) => {
    setDrawing(false);
    setPicks(ps);
    setSelectedId(chosenId);
    setOpenId(chosenId);
    if (window.innerWidth < 900) {
      window.scrollTo({ top: 0, behavior: 'smooth' }); // 휴대폰: 위쪽 지도로 올라감
    } else {
      setTimeout(() => document.querySelector('.picks')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }, []);

  const pickIds = picks.filter((p) => list.some((x) => x.id === p.id)).map((p) => p.id);
  const pickList = pickIds.map((id) => list.find((x) => x.id === id));

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setWhere('내 위치');
        setWeather(null);
      },
      () => setError('위치 권한이 없어 학교 기준으로 보여드려요.')
    );
  }

  function resetLocation() {
    setCenter(defaultCenter);
    setWhere(centerName);
    setWeather(null);
  }

  const weatherOk = weather?.source === 'open-meteo';
  const weatherIcon = !weatherOk ? '🌡️' : weather.label === '눈' ? '❄️' : weather.label === '비' ? '🌧️' : weather.label === '구름' ? '⛅' : weather.label === '안개' ? '🌫️' : '☀️';
  let weatherTip = '';
  if (weatherOk) {
    if (weather.wet) weatherTip = '비 오는 날엔 가깝고 매콤한 곳';
    else if (weather.temp <= 10) weatherTip = '쌀쌀해요, 뜨끈한 국물 어때요?';
    else if (weather.temp >= 27) weatherTip = '더워요, 시원하고 프레시하게';
    else weatherTip = '어디든 걷기 좋은 날씨';
  }

  const blogLoading = blogProgress && blogProgress.done < blogProgress.total;

  // 🚨 빠밥 모드: 공강 모드에서 다음 수업까지 1시간 이내면 화면이 빨개지고 사이렌이 울림
  const rush = quick || (gongang.on && gongang.left <= 60);
  const [siren, setSiren] = useState(false);
  const alerted = useRef(false);
  useEffect(() => {
    if (!rush) {
      const t = setTimeout(() => { alerted.current = false; }, 800);
      return () => clearTimeout(t);
    }
    if (alerted.current) return undefined;
    // 숫자를 입력하는 도중에는 울리지 않게 잠깐 기다렸다가 한 번만 울림
    const t = setTimeout(() => { alerted.current = true; setSiren(true); sfx.siren(); }, 450);
    return () => clearTimeout(t);
  }, [rush]);
  useEffect(() => {
    if (!siren) return undefined;
    const t = setTimeout(() => setSiren(false), 1200);
    return () => clearTimeout(t);
  }, [siren]);

  return (
    <div className={`app${rush ? ' app--rush' : ''}`}>
      {siren && (
        <div className="rush" role="alertdialog" aria-label="빠밥하자" onClick={() => setSiren(false)}>
          <span className="rush-light" aria-hidden="true">🚨</span>
          <p className="rush-title" aria-hidden="true"><i>빠</i><i>밥</i><i>하</i><i>자</i></p>
          <p className="rush-sub">{gongang.on ? <>다음 수업까지 <b>{gongang.left}분</b>!</> : <>얼른 먹고 오자!</>}</p>
        </div>
      )}
      {drawing && <LottoDraw candidates={list} rush={rush} onDone={finishDraw} onClose={() => setDrawing(false)} />}
      {/* ── 전체 화면 지도 ── */}
      <div className="map-layer">
        <MapView center={center} radius={gongang.on ? Math.max(effRadius, 50) : radius} places={list} selectedId={selectedId} onSelect={select} pickIds={pickIds} />
      </div>

      {/* ── 지도 위 음식 종류 알약 버튼 ── */}
      <nav className="pills" aria-label="음식 종류">
        <button className={`pill${categories.length === 0 ? ' on' : ''}`} onClick={() => setCategories([])}><span aria-hidden="true">🍴</span> 전체</button>
        {FOOD_GROUPS.map((g) => (
          <button key={g.key} className={`pill${categories.includes(g.key) ? ' on' : ''}`} title={g.hint}
            aria-pressed={categories.includes(g.key)} onClick={() => toggleCategory(g.key)}>
            <span aria-hidden="true">{g.icon}</span> {g.key}
            <em>{counts.group[g.key] || 0}</em>
          </button>
        ))}
      </nav>

      {/* ── 지도 위 날씨 카드 ── */}
      <div className="weather-card">
        <span className="weather-icon" aria-hidden="true">{weatherIcon}</span>
        <div className="weather-body">
          <b>{weatherOk ? `${Math.round(weather.temp)}°` : '--°'}<small>{weatherOk ? weather.label : '날씨'}</small></b>
          <span>{weatherOk ? weatherTip : '날씨 정보를 불러오는 중'}</span>
        </div>
        <button className={`switch${weatherOn ? ' on' : ''}`} role="switch" aria-checked={weatherOn} disabled={!weatherOk}
          onClick={() => setWeatherOn(!weatherOn)} title="날씨에 맞는 메뉴에 가산점">
          <span className="switch-label">날씨 반영</span><span className="switch-knob" aria-hidden="true" />
        </button>
      </div>

      {/* ── 내 위치 / 학교로 ── */}
      <button className="locate" onClick={where === centerName ? useMyLocation : resetLocation}
        title={where === centerName ? '내 위치로' : '학교로'} aria-label={where === centerName ? '내 위치로' : '학교로'}>
        {where === centerName ? '📍' : '🏫'}
      </button>

      {/* ── 왼쪽 패널 ── */}
      <aside className="panel">
        <header className="brand">
          <div className="brand-row">
            <Mascot />
            <div className="brand-text">
              <h1 className="title" aria-label={`골라밥 ${edition}`}>
                <span className="title-main" aria-hidden="true"><i>골</i><i>라</i><i>밥</i></span>
                <span className="title-sub" aria-hidden="true">-{edition}-</span>
              </h1>
              <p>{where} 근처, {meal} 뭐 먹지?</p>
            </div>
            <button className="mute" onClick={() => { setMuted(!mute); setMute(!mute); }}
              aria-pressed={!mute} aria-label={mute ? '효과음 켜기' : '효과음 끄기'} title={mute ? '효과음 켜기' : '효과음 끄기'}>
              {mute ? '🔇' : '🔊'}
            </button>
          </div>
        </header>
        {rush && (
          <button className="rush-strip" onClick={() => { setSiren(true); sfx.siren(); }} title="사이렌 다시 울리기">
            <span className="rush-strip-light" aria-hidden="true">🚨</span>
            <b>빠 밥 하 자</b>
            <em>{gongang.on ? `${gongang.left}분 남았어요!` : '얼른 먹고 오자!'}</em>
          </button>
        )}

        <div className="panel-scroll">
          {isMock && (
            <div className="banner">
              지금은 <b>예시 데이터</b>로 동작 중이에요. 가게 이름은 모두 가상이에요.
            </div>
          )}
          {data.sources?.places === 'osm' && !data.sources?.limited && (
            <div className="banner">키 없이 <b>OpenStreetMap</b> 데이터를 쓰고 있어요. 빠진 가게가 있을 수 있어요.</div>
          )}
          {data.warnings?.map((w) => (
            <div key={w} className="banner banner--warn">{w}</div>
          ))}
          {blogQuota && (
            <div className="banner banner--warn">😴 오늘 블로그 후기 수 무료 한도를 다 써서 후기 수는 쉬는 중이에요. 내일 자동으로 돌아와요!</div>
          )}

          <section className="block">
            <h2>📏 얼마나 멀리?</h2>
            <Segmented label="반경" value={gongang.on ? null : radius} onChange={setRadius}
              options={RADII.map((r) => [r, r >= 1000 ? `${r / 1000}km` : `${r}m`, gongang.on])} />
            {gongang.on && (
              <p className="hint hint--gong">
                ⏱️ 공강 모드가 거리를 정하고 있어요 · {gongRadius <= 0 ? <b>시간이 부족해요</b> : gongRadius >= Math.max(...RADII) ? <b>시간 넉넉! 1.5km 전부</b> : <b>약 {Math.round(gongRadius / 10) * 10}m (편도 {Math.floor(walkBudget)}분)</b>}
              </p>
            )}
            <h2>↕️ 어떤 순서로?</h2>
            <Segmented
              label="정렬"
              value={hasBlog ? sort : 'distance'}
              onChange={setSort}
              options={SORTS.map(([v, t]) => [v, t, !hasBlog && v !== 'distance'])}
            />
            {blogLoading && <p className="hint">후기 수 불러오는 중… {blogProgress.done}/{blogProgress.total}곳</p>}
            {!hasBlog && !loading && !blogLoading && <p className="hint">{blogQuota ? '후기 수가 쉬는 중이라 가까운 순으로 보여드려요.' : '네이버 키를 넣으면 추천순과 후기 많은 순이 켜져요.'}</p>}
          </section>

          <section className="block">
            <h2>
              🎨 색깔로 고르기 {colors.length > 0 && <button className="link" onClick={() => setColors([])}>해제</button>}
            </h2>
            <div className="circles">
              {FOOD_COLORS.map((c) => (
                <button key={c.key} className={`circle${colors.includes(c.key) ? ' on' : ''}`} aria-pressed={colors.includes(c.key)}
                  onClick={() => toggleColor(c.key)} disabled={!counts.color[c.key]} title={c.label}>
                  <span className="circle-dot" style={{ background: c.swatch }} aria-hidden="true">{COLOR_ICON[c.key]}</span>
                  <b>{c.desc}</b>
                  <em>{counts.color[c.key] || 0}곳</em>
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <h2>✨ 특별 필터</h2>
            <div className="chips">
              <Chip icon="⏱️" on={gongang.on} onClick={() => setGongang({ ...gongang, on: !gongang.on })}>공강 모드</Chip>
              <Chip icon="🚨" on={quick} title="급하게 먹어야 할 때!" onClick={() => setQuick(!quick)}>빠밥</Chip>
            </div>
            {gongang.on && (
              <div className="gongang">
                <NumberField label="다음 수업까지" unit="분" value={gongang.left} onChange={(v) => setGongang({ ...gongang, left: v })} />
                <NumberField label="식사 시간" unit="분" value={gongang.eat} onChange={(v) => setGongang({ ...gongang, eat: v })} />
                <NumberField label="주문·대기" unit="분" value={gongang.wait} onChange={(v) => setGongang({ ...gongang, wait: v })} />
                <p className="hint">왕복 도보 + 식사 + 대기 시간이 남은 시간 안에 들어오는 곳만 보여줘요. 위에서 고른 거리보다 이 시간이 먼저예요.</p>
              </div>
            )}
            <button className="roulette" onClick={roulette} disabled={!list.length}>
              <span className="dice" aria-hidden="true">🎲</span> 오늘 뭐 먹지? 뽑기!
            </button>
            {pickList.length > 0 && (
              <div className="picks">
                <p className="picks-head">
                  🎲 오늘의 후보 {pickList.length}곳
                  <button onClick={() => setPicks([])}>지우기</button>
                </p>
                <ol>
                  {pickList.map((p, i) => (
                    <li key={p.id}>
                      <button className={`pick-chip${p.id === selectedId ? ' on' : ''}`} style={{ '--pick': GROUP_PASTEL[p.group] }}
                        onClick={() => { setSelectedId(p.id); setOpenId(p.id); }}>
                        <i>{i + 1}</i>
                        <span className="ic" aria-hidden="true">{GROUP_ICON[p.group]}</span>
                        <span className="pick-text">
                          <b>{p.name}</b>
                          <Stats p={p} showBlog={hasBlog} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <div className="list-head">
            <h2>{loading ? '맛집 찾는 중… 🍚' : error ? <span className="err">{error}</span> : <>🍽️ 근처 맛집 <b>{list.length}</b>곳</>}</h2>
          </div>

          <ol className="cards">
            {list.map((p, i) => {
              const open = openId === p.id;
              return (
                <li key={p.id} id={`card-${p.id}`} className={`card${p.id === selectedId ? ' card--on' : ''}`}>
                  <button className="card-main" onClick={() => { setSelectedId(p.id); setOpenId(open ? null : p.id); }} aria-expanded={open}>
                    <span className="food-icon" aria-hidden="true" title={p.group} style={{ '--pick': GROUP_PASTEL[p.group] }}>
                      {GROUP_ICON[p.group]}
                      <span className="rank">{i + 1}</span>
                    </span>
                    <span className="card-body">
                      <span className="name">
                        {p.name}
                        {isNew(p) && <span className="tag tag--new">신상</span>}
                        {isOld(p) && <span className="tag tag--old">노포</span>}
                      </span>
                      <span className="meta">
                        {p.colors.map((c) => (
                          <span key={c} className="cdot" style={{ background: COLOR_BY_KEY[c].swatch }} title={COLOR_BY_KEY[c].desc} />
                        ))}
                        {p.group} · {subCategory(p.category)}
                      </span>
                      <Stats p={p} showBlog={hasBlog} />
                    </span>
                  </button>
                  {open && (
                    <div className="detail">
                      <p>📍 {p.address}</p>
                      {p.phone && <p>📞 {p.phone}</p>}
                      {p.license?.permitDate && <p>📅 {p.license.permitDate.slice(0, 4)}년부터 영업 중</p>}
                      {gongang.on && <p>⏱️ 왕복하고 먹고 오면 총 {p.tripMinutes}분</p>}
                      {p.url && !p.id.startsWith('osm-') && (
                        <a href={p.url} target="_blank" rel="noreferrer">카카오맵에서 메뉴·리뷰 보기 →</a>
                      )}
                      {p.id.startsWith('osm-') && (
                        <a href={`https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`} target="_blank" rel="noreferrer">
                          카카오맵에서 검색 →
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {!loading && !error && list.length === 0 && <p className="empty">{gongang.on && gongRadius <= 0 ? <>⏰ 시간이 부족해요!<br />남은 시간을 늘리거나 식사 시간을 줄여보세요.</> : <>🥲 조건에 맞는 곳이 없어요.<br />필터를 조금 풀어보세요!</>}</p>}

          {data.sources && (
            <dl className="sources">
              <div><dt>장소</dt><dd>{SOURCE_LABEL.places[data.sources.places]}</dd></div>
              <div><dt>후기 수</dt><dd>{SOURCE_LABEL.blog[data.sources.blog]}</dd></div>
              <div><dt>날씨</dt><dd>Open-Meteo</dd></div>
              {data.hiddenCount > 0 && <div><dt>폐업 목록으로 숨김</dt><dd>{data.hiddenCount}곳</dd></div>}
              {data.sources.places === 'osm' && <div><dt>지도 데이터</dt><dd>© OpenStreetMap contributors</dd></div>}
            </dl>
          )}
        </div>
      </aside>
    </div>
  );
}
