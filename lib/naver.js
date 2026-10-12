// 네이버 검색 API - 블로그 검색으로 "후기 글 수"를 인기도 지표로 사용
// 응답의 total 값 = 검색어에 해당하는 블로그 글 수
//
// 두 가지 발급 방식을 지원:
//  - NAVER_API_MODE=developers (기본): developers.naver.com 에서 발급한 Client ID/Secret
//  - NAVER_API_MODE=hub: 네이버 클라우드 플랫폼 NAVER API HUB 에서 발급한 키

export function naverEnabled() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

const SAMPLE = 100; // 정확도 보정용으로 받아 보는 글 수 (1회 호출로 받을 수 있는 최대치)

function endpoint(query) {
  const q = encodeURIComponent(query);
  if (process.env.NAVER_API_MODE === 'hub') {
    return {
      url: `https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${q}&display=${SAMPLE}&format=json`,
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
      },
    };
  }
  return {
    url: `https://openapi.naver.com/v1/search/blog.json?query=${q}&display=${SAMPLE}`,
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  };
}

const squash = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, '').replace(/\s+/g, '').toLowerCase();

// 네이버 검색은 단어가 일부만 맞아도 결과에 포함되기 때문에 total(전체 글 수)이 부풀려짐
// → 받은 글 100개 중 "가게 이름이 그대로 들어간 글"의 비율을 구해 total에 곱해서 보정
//   예) total 83,735건 중 샘플 100개에 '하계식당'이 2개 → 약 1,675건
async function blogCount(query, name, area) {
  const { url, headers } = endpoint(query);
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (${res.status})`);
  const json = await res.json();
  const total = Number(json.total) || 0;
  const items = Array.isArray(json.items) ? json.items : [];
  if (!items.length) return 0;

  // "기린", "중국집"처럼 3글자 이하의 흔한 이름은 지역명(공릉 등)까지 함께 나온 글만 인정
  const key = squash(name);
  const needArea = key.length <= 3 && area;
  const hits = items.filter((it) => {
    const text = squash(`${it.title} ${it.description}`);
    return text.includes(key) && (!needArea || text.includes(area));
  }).length;
  if (total <= items.length) return hits; // 글이 100개 이하면 직접 센 값이 정확함
  return Math.round(total * (hits / items.length));
}

// "서울 노원구 공릉동 123" → "공릉" (동 이름에서 숫자·'동'을 뗀 지역명)
function areaOf(jibun = '') {
  const dong = jibun.split(' ').find((t) => /[가-힣]+\d*동$/.test(t));
  return dong ? dong.replace(/\d*동$/, '') : '';
}

// 검색어 만들기: 가게 이름 + 지역명
//   하계식당              → 하계식당 공릉
//   교촌치킨 공릉2호점    → 교촌치킨 공릉2호점
// 이름 일치 여부 판단에는 브랜드 부분(첫 단어)을 씀 → 체인점은 "교촌치킨"이 들어간 글을 셈
export function buildQuery(place) {
  const name = (place.name || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  const area = areaOf(place.jibun);
  const query = area && !name.includes(area) ? `${name} ${area}` : name;
  const matchName = name.split(' ')[0];
  return { query, matchName, area };
}

// 동시에 5개씩만 호출 (과도한 요청 방지)
export async function fetchBlogCounts(places) {
  const out = {};
  let idx = 0;
  let failed = 0;

  async function worker() {
    while (idx < places.length) {
      const p = places[idx++];
      try {
        const { query, matchName, area } = buildQuery(p);
        out[p.id] = await blogCount(query, matchName, area);
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, worker));
  return { counts: out, failed };
}
