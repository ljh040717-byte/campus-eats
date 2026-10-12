'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import { filterAndScore, isNew, isOld, mainCategory } from '@/lib/score';

const RADII = [300, 500, 1000, 1500];
const SORTS = [
  ['score', '추천순'],
  ['distance', '거리순'],
  ['blog', '후기 많은 순'],
];

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

function Chip({ on, onClick, children, disabled, title }) {
  return (
    <button className={`chip${on ? ' on' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-pressed={on}>
      {children}
    </button>
  );
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

export default function App({ defaultCenter, centerName }) {
  const [center, setCenter] = useState(defaultCenter);
  const [where, setWhere] = useState(centerName);
  const [radius, setRadius] = useState(1000);
  const [sort, setSort] = useState('score');
  const [categories, setCategories] = useState([]);
  const [newOnly, setNewOnly] = useState(false);
  const [oldOnly, setOldOnly] = useState(false);
  const [hideClosed, setHideClosed] = useState(true);
  const [weatherOn, setWeatherOn] = useState(false);
  const [gongang, setGongang] = useState({ on: false, left: 50, eat: 20, wait: 5 });

  const [data, setData] = useState({ places: [], sources: null, warnings: [] });
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState(null);

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
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [center]);

  useEffect(() => {
    if (!weatherOn || weather) return;
    fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then(setWeather)
      .catch(() => setWeather({ source: 'unavailable' }));
  }, [weatherOn, weather, center]);

  const allCategories = useMemo(() => {
    const counts = new Map();
    data.places.forEach((p) => counts.set(mainCategory(p.category), (counts.get(mainCategory(p.category)) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [data.places]);

  // 후기 수가 하나라도 있어야 추천순·후기순이 의미가 있음 (0개도 데이터로 인정)
  const hasBlog = data.places.some((p) => p.blogCount != null);

  const list = useMemo(
    () =>
      filterAndScore(data.places, {
        radius, categories, newOnly, oldOnly, hideClosed, gongang, weatherOn, weather,
        sort: hasBlog ? sort : 'distance',
      }),
    [data.places, radius, categories, newOnly, oldOnly, hideClosed, gongang, weatherOn, weather, sort, hasBlog]
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

  function roulette() {
    if (!list.length) return;
    const p = list[Math.floor(Math.random() * list.length)];
    setPicked(p);
    select(p.id);
  }

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

  let weatherNote = '';
  if (weatherOn && weather?.source === 'open-meteo') {
    const tips = [];
    if (weather.wet) tips.push('가까운 곳 우선');
    if (weather.temp <= 10) tips.push('국물 메뉴 가산점');
    if (weather.temp >= 27) tips.push('시원한 메뉴 가산점');
    weatherNote = `지금 ${Math.round(weather.temp)}°C · ${weather.label}${tips.length ? ` → ${tips.join(', ')}` : ''}`;
  } else if (weatherOn && weather?.source === 'unavailable') {
    weatherNote = '날씨 정보를 불러오지 못했어요';
  } else if (weatherOn) {
    weatherNote = '날씨 불러오는 중…';
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <p className="eyebrow">{where} 기준</p>
          <h1>공릉 밥지도</h1>
        </div>
        <div className="loc">
          {where === centerName ? (
            <button className="ghost" onClick={useMyLocation}>내 위치로</button>
          ) : (
            <button className="ghost" onClick={resetLocation}>학교로</button>
          )}
        </div>
      </header>

      {isMock && (
        <div className="banner">
          지금은 <b>예시 데이터</b>로 동작 중이에요. 가게 이름은 모두 가상이에요. <code>.env.local</code>에 API 키를 넣으면 실제 데이터로 바뀌어요.
        </div>
      )}
      {data.sources?.places === 'osm' && (
        <div className="banner">
          키 없이 <b>OpenStreetMap</b>의 실제 식당 데이터를 쓰고 있어요. 등록 안 된 가게가 있을 수 있어요. 카카오 키를 넣으면 더 많은 가게가 나와요.
        </div>
      )}
      {data.warnings?.map((w) => (
        <div key={w} className="banner banner--warn">{w}</div>
      ))}

      <div className="layout">
        <section className="panel">
          <div className="group">
            <h2>반경</h2>
            <Segmented label="반경" value={radius} onChange={setRadius} options={RADII.map((r) => [r, r >= 1000 ? `${r / 1000}km` : `${r}m`])} />
          </div>

          <div className="group">
            <h2>정렬</h2>
            <Segmented
              label="정렬"
              value={hasBlog ? sort : 'distance'}
              onChange={setSort}
              options={SORTS.map(([v, t]) => [v, t, !hasBlog && v !== 'distance'])}
            />
            {!hasBlog && !loading && (
              <p className="hint">
                후기 수 데이터가 없어서 지금은 거리순으로만 정렬돼요. 네이버 검색 API 키를 넣으면 추천순과 후기 많은 순이 켜져요.
              </p>
            )}
          </div>

          {allCategories.length > 0 && (
            <div className="group">
              <h2>
                음식 종류 {categories.length > 0 && <button className="link" onClick={() => setCategories([])}>전체</button>}
              </h2>
              <div className="chips">
                {allCategories.map((c) => (
                  <Chip key={c} on={categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</Chip>
                ))}
              </div>
            </div>
          )}

          <div className="group">
            <h2>특별 필터</h2>
            <div className="chips">
              <Chip on={newOnly} disabled={!hasLicense} title={hasLicense ? '' : '공공데이터 연결 필요'} onClick={() => { setNewOnly(!newOnly); setOldOnly(false); }}>
                신상 (개업 1년 이내)
              </Chip>
              <Chip on={oldOnly} disabled={!hasLicense} title={hasLicense ? '' : '공공데이터 연결 필요'} onClick={() => { setOldOnly(!oldOnly); setNewOnly(false); }}>
                노포 (10년 이상)
              </Chip>
              <Chip on={hideClosed} disabled={!hasLicense} onClick={() => setHideClosed(!hideClosed)}>폐업 제외</Chip>
              <Chip on={weatherOn} onClick={() => setWeatherOn(!weatherOn)}>날씨 반영</Chip>
              <Chip on={gongang.on} onClick={() => setGongang({ ...gongang, on: !gongang.on })}>공강 모드</Chip>
            </div>
            {weatherNote && <p className="hint">{weatherNote}</p>}
            {gongang.on && (
              <div className="gongang">
                <NumberField label="다음 수업까지" unit="분" value={gongang.left} onChange={(v) => setGongang({ ...gongang, left: v })} />
                <NumberField label="식사 시간" unit="분" value={gongang.eat} onChange={(v) => setGongang({ ...gongang, eat: v })} />
                <NumberField label="주문·대기" unit="분" value={gongang.wait} onChange={(v) => setGongang({ ...gongang, wait: v })} />
                <p className="hint">왕복 도보 + 식사 + 대기 시간이 남은 시간 안에 들어오는 곳만 보여줘요.</p>
              </div>
            )}
          </div>

          <button className="roulette" onClick={roulette} disabled={!list.length}>
            오늘 뭐 먹지? 랜덤 뽑기
          </button>
          {picked && list.some((p) => p.id === picked.id) && (
            <p className="picked">
              오늘은 <b>{picked.name}</b> 어때요? 도보 {picked.walk}분
            </p>
          )}

          {data.sources && (
            <dl className="sources">
              <div><dt>장소</dt><dd>{SOURCE_LABEL.places[data.sources.places]}</dd></div>
              <div><dt>후기 수</dt><dd>{SOURCE_LABEL.blog[data.sources.blog]}</dd></div>
              <div><dt>인허가</dt><dd>{SOURCE_LABEL.license[data.sources.license]}</dd></div>
              {data.hiddenCount > 0 && <div><dt>폐업 목록으로 숨김</dt><dd>{data.hiddenCount}곳</dd></div>}
              {data.sources.places === 'osm' && <div><dt>지도 데이터</dt><dd>© OpenStreetMap contributors</dd></div>}
            </dl>
          )}
        </section>

        <section className="results">
          <MapView center={center} radius={radius} places={list} selectedId={selectedId} onSelect={select} />

          <div className="count">
            {loading ? '불러오는 중…' : error ? <span className="err">{error}</span> : `${list.length}곳`}
          </div>

          <ol className="cards">
            {list.map((p, i) => {
              const open = openId === p.id;
              return (
                <li key={p.id} id={`card-${p.id}`} className={`card${p.id === selectedId ? ' card--on' : ''}`}>
                  <button className="card-main" onClick={() => { setSelectedId(p.id); setOpenId(open ? null : p.id); }} aria-expanded={open}>
                    <span className="rank">{i + 1}</span>
                    <span className="card-body">
                      <span className="name">
                        {p.name}
                        {isNew(p) && <span className="tag tag--new">신상</span>}
                        {isOld(p) && <span className="tag tag--old">노포</span>}
                        {p.license?.closed && <span className="tag tag--closed">폐업</span>}
                      </span>
                      <span className="meta">
                        {mainCategory(p.category)} · {p.distance}m · 도보 {p.walk}분
                        {hasBlog && ` · 후기 ${p.blogCount ?? '?'}개`}
                      </span>
                      <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, p.score * 100)}%` }} /></span>
                    </span>
                  </button>
                  {open && (
                    <div className="detail">
                      <p className="cat">{p.category}</p>
                      <p>{p.address}</p>
                      {p.phone && <p>{p.phone}</p>}
                      {p.license?.permitDate && <p>인허가일 {p.license.permitDate} · {p.license.status}</p>}
                      {gongang.on && <p>왕복 포함 총 {p.tripMinutes}분</p>}
                      <p className="formula">
                        추천 점수 {p.score.toFixed(2)} = {p.parts.wd}×거리 {p.parts.D.toFixed(2)} + {p.parts.wb.toFixed(1)}×후기 {p.parts.B.toFixed(2)}
                        {p.parts.W > 0 && ` + 날씨 ${p.parts.W}`}
                      </p>
                      {p.url && !p.id.startsWith('osm-') && (
                        <a href={p.url} target="_blank" rel="noreferrer">카카오맵에서 메뉴·리뷰 보기 ↗</a>
                      )}
                      {p.id.startsWith('osm-') && (
                        <a href={`https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`} target="_blank" rel="noreferrer">
                          카카오맵에서 검색 ↗
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {!loading && !error && list.length === 0 && <p className="empty">조건에 맞는 곳이 없어요. 필터를 조금 풀어보세요.</p>}
        </section>
      </div>
    </div>
  );
}
