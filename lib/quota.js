// API 무료 한도 관리
//  - 카카오·네이버는 한도를 넘기면 429 같은 오류를 돌려줌 → 그때부터 그 API는 "오늘 쉬는 중"으로 표시
//  - 쉬는 동안은 API를 아예 부르지 않고, API 없이 되는 기능만 씀 (카카오 → OpenStreetMap, 네이버 → 후기 수 없이)
//  - 한국 시간 자정이 지나면 자동으로 다시 사용 (두 서비스 모두 하루 단위로 한도가 다시 참)
//  ※ 검색 결과 자체는 저장하지 않음 (카카오·네이버 약관상 결과 저장·캐싱 금지). 여기엔 "쉬는 중인지"만 기억함

const blockedUntil = { kakao: 0, naver: 0 };

// 다음 한국 시간 자정 (UTC+9)
function nextKstMidnight(now = Date.now()) {
  const kst = new Date(now + 9 * 3600 * 1000);
  kst.setUTCHours(24, 0, 0, 0);
  return kst.getTime() - 9 * 3600 * 1000;
}

export function isBlocked(api) {
  return Date.now() < blockedUntil[api];
}

export function block(api) {
  blockedUntil[api] = nextKstMidnight();
}

// 한도 초과로 보이는 오류인지 판단
export function isQuotaError(status, text = '') {
  if (status === 429) return true;
  return /limit|quota|exceed|한도|초과/i.test(text) && [400, 403, 429].includes(status);
}

export class QuotaError extends Error {
  constructor(api, message) {
    super(message);
    this.api = api;
    this.quota = true;
  }
}
