// 카카오 로컬 API - 카테고리로 장소 검색 (FD6 = 음식점)
// 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide
// 주의: 카카오 운영정책상 검색 결과를 DB에 저장하거나 쿼터 절약용으로 캐싱하면 안 됨 → 매번 실시간 호출
//
// 한 번 검색에 최대 45곳(15개 × 3페이지)까지만 주기 때문에,
// 검색 범위를 사각형으로 잡고 결과가 45곳을 넘으면 4등분해서 다시 검색함 (쿼드트리 방식).

const BASE = 'https://dapi.kakao.com/v2/local/search/category.json';
const PAGE_LIMIT = 45; // 한 검색에서 받을 수 있는 최대 개수
const MAX_DEPTH = 4; // 최대 4번까지 쪼갬 (3km 범위 → 약 190m 칸)
const MAX_CALLS = Number(process.env.KAKAO_MAX_CALLS) || 120; // 한 번 불러올 때 쓸 최대 호출 수

const M_PER_DEG_LAT = 111000;

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

async function callPage(rect, page, budget) {
  if (budget.used >= MAX_CALLS) {
    budget.capped = true;
    return null;
  }
  budget.used++;
  const params = new URLSearchParams({
    category_group_code: 'FD6',
    rect: rect.join(','), // 왼쪽 경도, 아래 위도, 오른쪽 경도, 위 위도
    size: '15',
    page: String(page),
  });
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`카카오 로컬 API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

function split([x1, y1, x2, y2]) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return [
    [x1, y1, mx, my],
    [mx, y1, x2, my],
    [x1, my, mx, y2],
    [mx, my, x2, y2],
  ];
}

async function searchRect(rect, depth, budget, out) {
  const first = await callPage(rect, 1, budget);
  if (!first) return;
  first.documents.forEach((d) => out.set(d.id, d));

  // 이 구역에 45곳보다 많으면 4등분해서 다시 검색
  if (first.meta.total_count > PAGE_LIMIT && depth < MAX_DEPTH) {
    await Promise.all(split(rect).map((r) => searchRect(r, depth + 1, budget, out)));
    return;
  }

  let meta = first.meta;
  for (let page = 2; page <= 3 && !meta.is_end; page++) {
    const next = await callPage(rect, page, budget);
    if (!next) return;
    next.documents.forEach((d) => out.set(d.id, d));
    meta = next.meta;
  }
  if (first.meta.total_count > PAGE_LIMIT) budget.capped = true; // 더 못 쪼개서 일부 누락
}

export async function searchRestaurants({ lat, lng, radius }) {
  const dLat = radius / M_PER_DEG_LAT;
  const dLng = radius / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const rect = [lng - dLng, lat - dLat, lng + dLng, lat + dLat];

  const out = new Map(); // id로 중복 제거
  const budget = { used: 0, capped: false };
  await searchRect(rect, 0, budget, out);

  const places = [...out.values()]
    .map((d) => {
      const p = { lat: Number(d.y), lng: Number(d.x) };
      return {
        id: d.id,
        name: d.place_name,
        category: d.category_name, // 예: "음식점 > 한식 > 국밥"
        address: d.road_address_name || d.address_name,
        jibun: d.address_name,
        phone: d.phone,
        url: d.place_url,
        distance: distanceM({ lat, lng }, p),
        ...p,
      };
    })
    .filter((p) => p.distance <= radius) // 사각형 모서리 부분 제거 → 원형 반경
    .sort((a, b) => a.distance - b.distance);

  return { places, calls: budget.used, capped: budget.capped };
}
