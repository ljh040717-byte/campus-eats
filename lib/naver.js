// 네이버 검색 API - 블로그 검색으로 "후기 글 수"를 인기도 지표로 사용
// 응답의 total 값 = 검색어에 해당하는 블로그 글 수
//
// 두 가지 발급 방식을 지원:
//  - NAVER_API_MODE=developers (기본): developers.naver.com 에서 발급한 Client ID/Secret
//  - NAVER_API_MODE=hub: 네이버 클라우드 플랫폼 NAVER API HUB 에서 발급한 키

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
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (${res.status})`);
  const json = await res.json();
  return Number(json.total) || 0;
}

// 주소에서 "공릉동" 같은 동 이름을 뽑아 검색어에 붙임 → 동명 가게 섞임 방지
function dongOf(jibun = '') {
  const token = jibun.split(' ').find((t) => /[가-힣0-9]+동$/.test(t));
  return token || '';
}

// 동시에 5개씩만 호출 (과도한 요청 방지)
export async function attachBlogCounts(places) {
  const out = places.map((p) => ({ ...p, blogCount: null }));
  let idx = 0;
  let failed = 0;

  async function worker() {
    while (idx < out.length) {
      const i = idx++;
      const p = out[i];
      try {
        out[i].blogCount = await blogCount(`${p.name} ${dongOf(p.jibun)}`.trim());
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, worker));
  return { places: out, failed };
}
