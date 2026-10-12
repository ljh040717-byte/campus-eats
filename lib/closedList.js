// 직접 관리하는 "폐업·숨김 가게" 목록 (data/closed.json)
// 지도 데이터가 늦게 갱신돼서 이미 문 닫은 가게가 남아 있을 때, 여기에 이름을 적으면 목록에서 빠짐.
//
// data/closed.json 예시:
// [
//   "부어치킨",              ← 이름에 "부어치킨"이 들어간 가게는 모두 숨김
//   "OO식당 공릉점"          ← 지점까지 적으면 그 지점만 숨김
// ]

import fs from 'fs';
import path from 'path';
import { normName } from './match.js';

export function loadClosedList() {
  const file = path.join(process.cwd(), 'data', 'closed.json');
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.map((s) => normName(String(s))).filter(Boolean) : [];
  } catch {
    return []; // 파일이 없거나 형식이 틀리면 아무것도 숨기지 않음
  }
}

export function isListedClosed(place, list) {
  const n = normName(place.name);
  return list.some((entry) => n.includes(entry));
}
