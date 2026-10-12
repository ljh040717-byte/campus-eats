// 카카오 장소 ↔ 공공데이터 인허가 정보 매칭
// 좌표계가 달라서(공공데이터는 EPSG:5174) 좌표 대신 "가게 이름 + 도로명 주소"로 맞춤

export function normName(s = '') {
  return s
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

// "서울 노원구 공릉로 232" → "공릉로232"
export function roadKey(addr = '') {
  const m = addr.match(/([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function buildIndex(records) {
  const byRoad = new Map();
  const byName = new Map();
  for (const r of records) {
    const rk = roadKey(r.road);
    if (rk) {
      if (!byRoad.has(rk)) byRoad.set(rk, []);
      byRoad.get(rk).push(r);
    }
    const nk = normName(r.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push(r);
  }
  return { byRoad, byName };
}

function namesMatch(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)));
}

// 같은 이름이 여러 번 인허가된 경우(이전 폐업 후 재개업 등) 영업 중인 최신 기록을 우선
function best(list) {
  return [...list].sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    return (b.permitDate || '').localeCompare(a.permitDate || '');
  })[0];
}

export function matchPlace(place, index) {
  const rk = roadKey(place.address);
  if (rk && index.byRoad.has(rk)) {
    const sameBuilding = index.byRoad.get(rk).filter((r) => namesMatch(r.name, place.name));
    if (sameBuilding.length) return best(sameBuilding);
  }
  // 주소가 안 맞으면 이름이 정확히 같고 같은 동인 경우만 인정
  const sameName = index.byName.get(normName(place.name)) || [];
  const dong = (place.jibun || '').split(' ').find((t) => /동$/.test(t));
  const sameDong = sameName.filter((r) => dong && `${r.jibun} ${r.road}`.includes(dong));
  return sameDong.length ? best(sameDong) : null;
}
