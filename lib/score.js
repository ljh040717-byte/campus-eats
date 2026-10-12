// 필터링 + 추천 점수 계산 (브라우저에서 실행 → 필터를 바꾸면 즉시 반영)
//
// 추천 점수:  S = w_d·D + w_b·B + 날씨 보너스
//   D = 1 - 거리/반경             (가까울수록 1)
//   B = log(1+n) / log(1+n_max)   (n = 블로그 후기 수, 로그로 체인점 쏠림 완화)

export const WALK_M_PER_MIN = 67; // 보행 속도 약 4km/h
export const DETOUR = 1.3; // 직선거리 → 실제 걷는 거리 보정 계수

const SOUP = ['국밥', '찌개', '탕', '칼국수', '순대', '라면', '전골', '짬뽕', '쌀국수', '마라'];
const COLD = ['냉면', '초밥', '샐러드', '회', '밀면', '물회'];

export function mainCategory(cat = '') {
  const parts = cat.split('>').map((s) => s.trim());
  return parts[1] || '기타';
}

export function walkMinutes(distance) {
  return Math.max(1, Math.round((distance * DETOUR) / WALK_M_PER_MIN));
}

function yearsSince(dateStr) {
  if (!dateStr) return null;
  return (Date.now() - new Date(dateStr).getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function isNew(p) {
  const y = yearsSince(p.license?.permitDate);
  return y !== null && y <= 1;
}

export function isOld(p) {
  const y = yearsSince(p.license?.permitDate);
  return y !== null && y >= 10;
}

// 날씨에 맞는 메뉴면 보너스
function weatherBonus(p, weather) {
  if (!weather || weather.source !== 'open-meteo') return 0;
  const c = p.category;
  if (weather.temp <= 10 && SOUP.some((k) => c.includes(k))) return 0.15;
  if (weather.temp >= 27 && COLD.some((k) => c.includes(k))) return 0.15;
  return 0;
}

export function filterAndScore(places, opts) {
  const { radius, categories, newOnly, oldOnly, hideClosed, gongang, weatherOn, weather, sort } = opts;

  // 비/눈 오는 날엔 거리 가중치를 키움
  const wet = weatherOn && weather?.wet;
  const wd = wet ? 0.7 : 0.4;
  const wb = 1 - wd;

  // ① 필터링: 반드시 지켜야 하는 조건
  let list = places.filter((p) => {
    if (p.distance > radius) return false;
    if (categories.length && !categories.includes(mainCategory(p.category))) return false;
    if (hideClosed && p.license?.closed) return false;
    if (newOnly && !isNew(p)) return false;
    if (oldOnly && !isOld(p)) return false;
    if (gongang.on) {
      const total = walkMinutes(p.distance) * 2 + gongang.eat + gongang.wait;
      if (total > gongang.left) return false;
    }
    return true;
  });

  // ② 점수 계산
  // 후기 수 상한: 상위 5%를 넘는 값은 상위 5% 값으로 잘라서 계산
  // (이름이 흔한 가게가 엉뚱하게 수만 건으로 잡혀 1등을 독차지하는 것을 막음)
  const counts = list.map((p) => p.blogCount).filter((n) => n != null).sort((a, b) => a - b);
  const cap = counts.length ? counts[Math.min(counts.length - 1, Math.floor(counts.length * 0.95))] : 0;
  const nMax = cap;
  list = list.map((p) => {
    const D = Math.max(0, 1 - p.distance / radius);
    const n = p.blogCount == null ? null : Math.min(p.blogCount, cap);
    const B = nMax > 0 && n != null ? Math.log(1 + n) / Math.log(1 + nMax) : 0;
    const W = weatherOn ? weatherBonus(p, weather) : 0;
    const score = wd * D + wb * B + W;
    return {
      ...p,
      walk: walkMinutes(p.distance),
      tripMinutes: walkMinutes(p.distance) * 2 + gongang.eat + gongang.wait,
      score,
      parts: { D, B, W, wd, wb },
    };
  });

  const sorters = {
    score: (a, b) => b.score - a.score,
    distance: (a, b) => a.distance - b.distance,
    // 후기 수가 같으면 가까운 순
    blog: (a, b) => (b.blogCount || 0) - (a.blogCount || 0) || a.distance - b.distance,
  };
  return list.sort(sorters[sort] || sorters.score);
}
