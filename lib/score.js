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

// 카카오 분류에서 가장 자세한 마지막 단계 (예: "음식점 > 한식 > 국밥" → "국밥")
export function subCategory(cat = '') {
  const parts = cat.split('>').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || '기타';
}

// ─── 음식 종류: 카카오의 세부 분류를 5가지로 묶음 ───────────────────────
export const FOOD_GROUPS = [
  { key: '한식', icon: '🍚', hint: '한식, 분식, 찌개, 백반' },
  { key: '중식', icon: '🥟', hint: '중국집, 마라탕 등' },
  { key: '일식', icon: '🍣', hint: '초밥, 라멘, 돈카츠 등' },
  { key: '양식', icon: '🍝', hint: '파스타, 피자, 햄버거, 샐러드 등' },
  { key: '기타', icon: '🍽️', hint: '아시안 음식, 치킨, 퓨전요리 등' },
];

const has = (text, words) => words.some((w) => text.includes(w));

export function foodGroup(p) {
  const main = mainCategory(p.category);
  const text = `${p.category} ${p.name}`;
  // 세부 메뉴가 먼저: 카카오가 '분식'이나 '패스트푸드'로 따로 분류한 것도 아래 규칙으로 맞춰 넣음
  if (has(text, ['마라', '중국요리', '짜장', '짬뽕', '양꼬치', '훠궈'])) return '중식';
  if (has(text, ['샐러드', '포케', '피자', '햄버거', '버거', '파스타', '스테이크', '이탈리안', '브런치', '샌드위치'])) return '양식';
  if (has(text, ['초밥', '스시', '라멘', '돈까스', '돈카츠', '우동', '규동', '덮밥', '이자카야', '오마카세', '일본'])) return '일식';
  if (['한식', '분식', '도시락', '구내식당'].includes(main)) return '한식';
  if (main === '중식') return '중식';
  if (main === '일식') return '일식';
  if (['양식', '패스트푸드', '패밀리레스토랑'].includes(main)) return '양식';
  return '기타'; // 아시아음식, 치킨, 퓨전요리, 술집, 간식, 뷔페 등
}

// ─── 색깔로 고르기: 음식 색 = 맛의 느낌 ──────────────────────────────
export const FOOD_COLORS = [
  {
    key: 'red', label: '빨간 음식', desc: '매콤한 거', swatch: '#E5452F',
    words: ['마라', '떡볶이', '짬뽕', '김치', '부대찌개', '닭갈비', '쭈꾸미', '주꾸미', '낙지', '육개장', '매운', '불닭', '닭볶음', '감자탕', '제육', '아구찜', '해물찜', '닭발', '순두부', '짬뽕', '양념', '고추'],
  },
  {
    key: 'white', label: '흰색 음식', desc: '뽀얀 국물', swatch: '#EFE9DD',
    words: ['곰탕', '설렁탕', '순대', '돼지국밥', '국밥', '칼국수', '갈비탕', '삼계탕', '수제비', '돈코츠', '라멘', '일본식라면', '사골', '만두국', '닭한마리', '샤브샤브'],
  },
  {
    key: 'brown', label: '갈색 음식', desc: '간장 베이스', swatch: '#9A6234',
    words: ['찜닭', '불고기', '간장', '규동', '덮밥', '장어', '갈비', '족발', '보쌈', '데리야끼', '돈까스', '돈카츠', '짜장', '함박', '카레', '소바'],
  },
  {
    key: 'green', label: '초록 음식', desc: '프레시', swatch: '#5FA34A',
    words: ['샐러드', '포케', '비건', '채식', '쌀국수', '월남쌈', '샌드위치', '브런치', '그릭', '쌈밥', '비빔'],
  },
];

export function foodColors(p) {
  const text = `${p.category} ${p.name}`;
  return FOOD_COLORS.filter((c) => has(text, c.words)).map((c) => c.key);
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
//  추우면(10°C 이하) 국물 메뉴·흰 국물, 비/눈이면 매콤한 빨간 음식, 더우면(27°C 이상) 시원한 메뉴·초록 음식
function weatherBonus(p, weather) {
  if (!weather || weather.source !== 'open-meteo') return 0;
  const c = `${p.category} ${p.name}`;
  const colors = foodColors(p);
  if (weather.temp <= 10 && (SOUP.some((k) => c.includes(k)) || colors.includes('white'))) return 0.15;
  if (weather.wet && colors.includes('red')) return 0.1;
  if (weather.temp >= 27 && (COLD.some((k) => c.includes(k)) || colors.includes('green'))) return 0.15;
  return 0;
}

export function filterAndScore(places, opts) {
  const { radius, categories, colors = [], newOnly, oldOnly, hideClosed, gongang, weatherOn, weather, sort } = opts;

  // 비/눈 오는 날엔 거리 가중치를 키움
  const wet = weatherOn && weather?.wet;
  const wd = wet ? 0.7 : 0.4;
  const wb = 1 - wd;

  // ① 필터링: 반드시 지켜야 하는 조건
  let list = places.filter((p) => {
    if (p.distance > radius) return false;
    if (categories.length && !categories.includes(foodGroup(p))) return false;
    if (colors.length && !foodColors(p).some((c) => colors.includes(c))) return false;
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
      group: foodGroup(p),
      colors: foodColors(p),
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

// ─── 🎲 랜덤 뽑기 가중치 ────────────────────────────────────────────
// 기본은 랜덤이지만, 가깝고 후기 많은 집의 공이 조금 더 잘 나오게 함
//   가중치 = 1 + DRAW_BOOST × (0.5·거리점수 + 0.5·후기점수)   (두 점수 모두 0~1)
//   DRAW_BOOST = 1 → 제일 좋은 집도 제일 안 좋은 집의 최대 2배까지만 잘 뽑힘
//   (확률을 바꾸고 싶으면 이 숫자만 조정: 0이면 완전 랜덤, 2면 최대 3배)
export const DRAW_BOOST = 1;

export function drawWeight(p) {
  const D = p.parts?.D ?? 0;
  const B = p.parts?.B ?? 0;
  return 1 + DRAW_BOOST * (0.5 * D + 0.5 * B);
}

// 가중치를 반영해 서로 다른 n곳을 뽑음 (한 번 뽑힌 집은 다시 안 나옴)
export function weightedPicks(list, n = 3, rand = Math.random) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + drawWeight(p), 0);
    let r = rand() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= drawWeight(pool[i]);
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
