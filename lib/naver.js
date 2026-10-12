// 네이버 검색 API - 블로그 검색으로 "후기 글 수"를 인기도 지표로 사용
// 응답의 total 값 = 검색어에 해당하는 블로그 글 수
//
// 두 가지 발급 방식을 지원:
//  - NAVER_API_MODE=developers (기본): developers.naver.com 에서 발급한 Client ID/Secret
//  - NAVER_API_MODE=hub: 네이버 클라우드 플랫폼 NAVER API HUB 에서 발급한 키

export function naverEnabled() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function endpoint(query) {
  const q = encodeURIComponent(query);
  if (process.env.NAVER_API_MODE === 'hub') {
    return {
      url: `https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${q}&display=1&format=json`,
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
      },
    };
  }
  return {
    url: `https://openapi.naver.com/v1/search/blog.json?query=${q}&display=1`,
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  };
}

async function blogCount(query) {
  const { url, headers } = endpoint(query);
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (${res.status})`);
  const json = await res.json();
  return Number(json.total) || 0;
}

// "서울 노원구 공릉동 123" → "공릉" (동 이름에서 숫자·'동'을 뗀 지역명)
function areaOf(jibun = '') {
  const dong = jibun.split(' ').find((t) => /[가-힣]+\d*동$/.test(t));
  return dong ? dong.replace(/\d*동$/, '') : '';
}

// 검색어 만들기: 가게 이름은 따옴표로 묶어 "정확히 그 이름"이 들어간 글만 세고, 지역명을 붙임
//   하계식당              → "하계식당" 공릉
//   교촌치킨 공릉2호점    → "교촌치킨" 공릉2호점 공릉   (체인점은 브랜드만 묶고 지점명은 그대로)
export function buildQuery(place) {
  const name = (place.name || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  const [brand, ...rest] = name.split(' ');
  const area = areaOf(place.jibun);
  const parts = [`"${brand}"`, ...rest];
  if (area && !name.includes(area)) parts.push(area);
  return parts.join(' ');
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
        out[p.id] = await blogCount(buildQuery(p));
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, worker));
  return { counts: out, failed };
}
