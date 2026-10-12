// OpenStreetMap(Overpass API) - 키 없이 쓰는 무료 실제 음식점 데이터
// 누구나 편집하는 지도라 카카오보다 빠진 가게가 많을 수 있음
// 이용 조건: 화면에 "© OpenStreetMap contributors" 출처 표시 필요

// 공용 서버는 붐비면 504(시간 초과)를 자주 내므로 예비 서버를 차례로 시도
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

// OSM 데이터는 저장해도 되므로(ODbL), 같은 위치는 1시간 동안 재사용해 서버 부담을 줄임
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

// OSM의 cuisine 태그 → 우리 카테고리
const CUISINE = [
  [/korean|bibimbap|kimchi|soup|noodle/, '한식'],
  [/chinese|dumpling/, '중식'],
  [/japanese|sushi|ramen|udon|tonkatsu|donburi/, '일식'],
  [/italian|pizza|pasta|burger|steak|american|western|french|mexican/, '양식'],
  [/chicken|fried_chicken/, '치킨'],
  [/vietnamese|thai|indian|asian|pho/, '아시아음식'],
  [/tteokbokki|snack|kimbap/, '분식'],
];

function categoryOf(tags) {
  const c = (tags.cuisine || '').toLowerCase();
  for (const [re, name] of CUISINE) if (re.test(c)) return `음식점 > ${name}${c ? ` > ${c}` : ''}`;
  if (tags.amenity === 'fast_food') return '음식점 > 패스트푸드';
  return `음식점 > 기타${c ? ` > ${c}` : ''}`;
}

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function searchOsmRestaurants({ lat, lng, radius }) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places;

  const places = await fetchFromOverpass({ lat, lng, radius });
  cache.set(key, { at: Date.now(), places });
  return places;
}

async function fetchFromOverpass({ lat, lng, radius }) {
  const query = `[out:json][timeout:25];
(
  node["amenity"~"^(restaurant|fast_food)$"](around:${radius},${lat},${lng});
  way["amenity"~"^(restaurant|fast_food)$"](around:${radius},${lat},${lng});
);
out center tags;`;

  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'campus-eats-student-project/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Overpass 오류 (${res.status}, ${new URL(url).hostname})`);
      const json = await res.json();

      return json.elements
        .map((e) => {
          const t = e.tags || {};
          const p = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon };
          const name = t['name:ko'] || t.name;
          if (!name || p.lat == null) return null;
          const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
          return {
            id: `osm-${e.type}-${e.id}`,
            name,
            category: categoryOf(t),
            address: street ? `${t['addr:city'] || ''} ${street}`.trim() : '주소 정보 없음',
            jibun: '',
            phone: t.phone || t['contact:phone'] || '',
            url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
            distance: distanceM({ lat, lng }, p),
            ...p,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
