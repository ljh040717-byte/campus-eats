// GET /api/places?lat=..&lng=..&radius=..
// 브라우저 대신 서버가 API를 호출 → API 키가 사용자에게 노출되지 않음

import { searchRestaurants } from '@/lib/kakao';
import { attachBlogCounts } from '@/lib/naver';
import { loadPublicRestaurants } from '@/lib/publicData';
import { buildIndex, matchPlace } from '@/lib/match';
import { mockPlaces } from '@/lib/mock';
import { searchOsmRestaurants } from '@/lib/osm';
import { loadClosedList, isListedClosed } from '@/lib/closedList';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const radius = Math.min(Math.max(Number(sp.get('radius')) || 1000, 100), 20000);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: '위치(lat, lng)가 필요합니다.' }, { status: 400 });
  }

  const mock = () =>
    Response.json({
      places: mockPlaces({ lat, lng, radius }),
      sources: { places: 'mock', blog: 'mock', license: 'mock' },
      warnings,
    });

  const warnings = [];
  const sources = { places: 'kakao', blog: 'off', license: 'off' };

  // .env.local 에 USE_MOCK=1 이면 발표 시연용 예시 데이터로 고정
  if (process.env.USE_MOCK === '1') return mock();

  // 1) 주변 음식점: 카카오 키가 있으면 카카오, 없으면 OpenStreetMap(키 불필요), 둘 다 실패하면 예시 데이터
  let places;
  if (process.env.KAKAO_REST_API_KEY) {
    try {
      const result = await searchRestaurants({ lat, lng, radius });
      places = result.places;
      if (result.capped) warnings.push('식당이 너무 많아 일부만 불러왔어요.');
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  } else {
    try {
      places = await searchOsmRestaurants({ lat, lng, radius });
      sources.places = 'osm';
    } catch (e) {
      warnings.push(`OpenStreetMap에 연결하지 못해 예시 데이터를 보여드려요 (${e.message})`);
      return mock();
    }
  }

  // 2) 직접 적어둔 폐업 목록(data/closed.json)에 있는 가게 제외
  const closedList = loadClosedList();
  const before = places.length;
  places = places.filter((p) => !isListedClosed(p, closedList));
  const hiddenCount = before - places.length;

  // 3) 네이버 블로그 후기 수 (키가 있을 때만)
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    // 하루 호출 한도(25,000회)를 지키기 위해 가까운 순으로 최대 N곳까지만 후기 수 조회
    const limit = Number(process.env.NAVER_MAX_LOOKUPS) || 100;
    const { places: withBlog, failed } = await attachBlogCounts(places.slice(0, limit));
    places = [...withBlog, ...places.slice(limit).map((p) => ({ ...p, blogCount: null }))];
    sources.blog = 'naver';
    if (failed) warnings.push(`네이버 후기 수 ${failed}건 조회 실패`);
  } else {
    places = places.map((p) => ({ ...p, blogCount: null }));
  }

  // 4) 공공데이터 인허가 정보 (CSV 또는 API가 설정돼 있을 때만)
  try {
    const pub = await loadPublicRestaurants();
    sources.license = pub.source;
    if (pub.records.length) {
      const index = buildIndex(pub.records);
      places = places.map((p) => {
        const r = matchPlace(p, index);
        return { ...p, license: r ? { permitDate: r.permitDate, status: r.status, closed: r.closed } : null };
      });
    } else if (pub.source !== 'off') {
      warnings.push('공공데이터에서 해당 지역 음식점을 찾지 못했어요. PUBLIC_DATA_SGG 값을 확인하세요.');
    }
  } catch (e) {
    warnings.push(`공공데이터 불러오기 실패: ${e.message}`);
  }

  return Response.json({ places, sources, warnings, hiddenCount });
}
