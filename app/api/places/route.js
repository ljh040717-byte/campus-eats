// GET /api/places?lat=..&lng=..&radius=..
// 브라우저 대신 서버가 API를 호출 → API 키가 사용자에게 노출되지 않음

import { searchRestaurants } from '@/lib/kakao';
import { naverEnabled } from '@/lib/naver';
import { loadPublicRestaurants } from '@/lib/publicData';
import { buildIndex, matchPlace } from '@/lib/match';
import { mockPlaces } from '@/lib/mock';
import { searchOsmRestaurants } from '@/lib/osm';
import { loadClosedList, isListedClosed } from '@/lib/closedList';
import { isBlocked } from '@/lib/quota';

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
  //    카카오가 한도 초과·오류면 OpenStreetMap으로 대신 보여줌 (사이트가 멈추지 않게)
  let places;
  let kakaoDown = null;
  if (process.env.KAKAO_REST_API_KEY && !isBlocked('kakao')) {
    try {
      const result = await searchRestaurants({ lat, lng, radius });
      places = result.places;
      if (result.capped) warnings.push('식당이 너무 많아 일부만 불러왔어요.');
    } catch (e) {
      kakaoDown = e.quota ? 'quota' : 'error';
    }
  } else if (process.env.KAKAO_REST_API_KEY) {
    kakaoDown = 'quota';
  }
  if (kakaoDown) {
    try {
      places = await searchOsmRestaurants({ lat, lng, radius });
      sources.places = 'osm';
      sources.limited = kakaoDown === 'quota' ? 'kakao-quota' : 'kakao-error';
      warnings.push(
        kakaoDown === 'quota'
          ? '😴 오늘 카카오 무료 한도를 다 써서 OpenStreetMap 지도 데이터로 보여드려요. 빠진 가게가 있을 수 있고, 내일 자동으로 돌아와요.'
          : '카카오에 잠깐 연결이 안 돼서 OpenStreetMap 지도 데이터로 보여드려요.'
      );
    } catch {
      return Response.json(
        { error: kakaoDown === 'quota' ? '오늘 가게 검색 한도를 다 썼어요. 내일 다시 와 주세요!' : '가게 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' },
        { status: 503 }
      );
    }
  } else if (!places) {
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

  // 3) 네이버 블로그 후기 수는 여기서 기다리지 않음 → 화면이 /api/blog 로 나중에 따로 받아 감
  //    (가게 목록과 지도를 먼저 빠르게 보여주기 위해)
  places = places.map((p) => ({ ...p, blogCount: null }));
  if (naverEnabled()) sources.blog = isBlocked('naver') ? 'quota' : 'naver';
  // 한 번 방문할 때 후기 수를 조회할 가게 수 (가까운 순). 네이버 하루 한도를 아끼려고 40곳으로 제한
  const blogLimit = Number(process.env.NAVER_MAX_LOOKUPS) || 40;

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

  return Response.json({ places, sources, warnings, hiddenCount, blogLimit });
}
