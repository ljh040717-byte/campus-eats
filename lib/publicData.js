// 공공데이터 - 행정안전부 일반음식점 인허가 정보
// 공공데이터는 무료이고 저장해서 써도 되므로, 서버 메모리에 한 번 읽어 두고 재사용함.
//
// 두 가지 방식 지원 (둘 다 없으면 이 기능은 꺼짐):
//  1) 파일: 공공데이터포털에서 일반음식점 CSV를 내려받아 data/ 폴더에 넣기 (가장 확실)
//  2) API: DATA_GO_KR_KEY + DATA_GO_KR_URL 설정 (요청 주소는 활용신청 후 명세에서 확인)

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

// 데이터 출처마다 컬럼 이름이 달라서 후보를 여러 개 둠
const FIELDS = {
  name: ['사업장명', 'BPLC_NM', 'BPLCNM', 'bplc_nm', 'bplcNm'],
  permit: ['인허가일자', 'LCPMT_YMD', 'APVPERMYMD', 'lcpmt_ymd', 'apvPermYmd'],
  status: ['영업상태명', 'SALS_STTS_NM', 'TRDSTATENM', 'sals_stts_nm', 'trdStateNm'],
  detail: ['상세영업상태명', 'DTL_SALS_STTS_NM', 'DTLSTATENM', 'dtl_sals_stts_nm', 'dtlStateNm'],
  road: ['도로명전체주소', '도로명주소', 'ROAD_NM_ADDR', 'RDNWHLADDR', 'road_nm_addr', 'rdnWhlAddr'],
  jibun: ['소재지전체주소', '지번주소', 'LOTNO_ADDR', 'SITEWHLADDR', 'lotno_addr', 'siteWhlAddr'],
};

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return '';
}

function normalizeDate(s) {
  const digits = (s || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function toRecord(row) {
  const status = pick(row, FIELDS.status);
  const detail = pick(row, FIELDS.detail);
  return {
    name: pick(row, FIELDS.name),
    road: pick(row, FIELDS.road),
    jibun: pick(row, FIELDS.jibun),
    permitDate: normalizeDate(pick(row, FIELDS.permit)),
    status: detail || status,
    closed: /폐업|취소|말소/.test(`${status} ${detail}`),
  };
}

const SGG = () => process.env.PUBLIC_DATA_SGG || '노원구'; // 학교가 있는 구만 남김

function inArea(r) {
  return `${r.road} ${r.jibun}`.includes(SGG());
}

// 공공데이터 CSV는 CP949(EUC-KR)인 경우가 많아서 깨지면 다시 디코딩
function readCsv(file) {
  const buf = fs.readFileSync(file);
  let text = buf.toString('utf8');
  if ((text.match(/�/g) || []).length > 10) text = iconv.decode(buf, 'cp949');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

// 응답 JSON 안에서 "객체 배열"을 찾아냄 (API마다 감싸는 구조가 달라서)
function findRows(node) {
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object') return node;
    return null;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const found = findRows(v);
      if (found) return found;
    }
  }
  return null;
}

async function fetchFromApi() {
  const base = process.env.DATA_GO_KR_URL;
  const key = process.env.DATA_GO_KR_KEY;
  const extra = process.env.DATA_GO_KR_EXTRA || ''; // 예: cond[...]=노원구 (명세 확인)
  const rows = [];

  for (let page = 1; page <= 30; page++) {
    const url = `${base}?serviceKey=${key}&pageNo=${page}&numOfRows=1000&returnType=json${extra ? `&${extra}` : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`공공데이터 API 오류 (${res.status})`);
    const found = findRows(await res.json());
    if (!found || found.length === 0) break;
    rows.push(...found);
    if (found.length < 1000) break;
  }
  return rows;
}

let cache = null; // { source, records, loadedAt }

export async function loadPublicRestaurants() {
  // 공공데이터는 하루 단위로 갱신되므로 12시간마다 다시 읽음
  if (cache && Date.now() - cache.loadedAt < 12 * 3600 * 1000) return cache;

  const dir = path.join(process.cwd(), 'data');
  const csvs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')) : [];

  let rows = null;
  let source = 'off';

  if (csvs.length) {
    rows = csvs.flatMap((f) => readCsv(path.join(dir, f)));
    source = 'csv';
  } else if (process.env.DATA_GO_KR_KEY && process.env.DATA_GO_KR_URL) {
    rows = await fetchFromApi();
    source = 'api';
  }

  const records = rows ? rows.map(toRecord).filter((r) => r.name && inArea(r)) : [];
  cache = { source, records, loadedAt: Date.now() };
  return cache;
}
