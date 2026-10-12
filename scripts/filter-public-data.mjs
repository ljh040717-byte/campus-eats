// 공공데이터포털에서 받은 "일반음식점" 전국 CSV에서 학교가 있는 구만 남겨 data/ 폴더에 저장
// 전국 파일은 너무 커서 GitHub에 올릴 수 없으므로, 이 스크립트로 작게 만든 뒤 올림.
//
// 사용법:  npm run filter-data -- "내려받은파일.csv"            (기본: 노원구)
//          npm run filter-data -- "내려받은파일.csv" 성북구     (다른 구)

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

const [input, sgg = '노원구'] = process.argv.slice(2);
if (!input || !fs.existsSync(input)) {
  console.error('사용법: npm run filter-data -- "내려받은파일.csv" [구 이름]');
  process.exit(1);
}

// 파일 앞부분을 보고 인코딩 판단 (공공데이터 CSV는 CP949인 경우가 많음)
const head = Buffer.alloc(65536);
const fd = fs.openSync(input, 'r');
const n = fs.readSync(fd, head, 0, head.length, 0);
fs.closeSync(fd);
const sample = head.subarray(0, n).toString('utf8');
const encoding = (sample.match(/�/g) || []).length > 5 ? 'cp949' : 'utf8';

// 우리 코드가 쓰는 컬럼만 남김 (이름이 다른 여러 형식 대응)
const KEEP = [
  '사업장명', 'BPLC_NM', 'BPLCNM',
  '인허가일자', 'LCPMT_YMD', 'APVPERMYMD',
  '영업상태명', 'SALS_STTS_NM', 'TRDSTATENM',
  '상세영업상태명', 'DTL_SALS_STTS_NM', 'DTLSTATENM',
  '도로명전체주소', '도로명주소', 'ROAD_NM_ADDR', 'RDNWHLADDR',
  '소재지전체주소', '지번주소', 'LOTNO_ADDR', 'SITEWHLADDR',
  '업태구분명', 'UPTAENM',
];

const rows = [];
let total = 0;
let fields = null;

const stream = fs.createReadStream(input).pipe(iconv.decodeStream(encoding));

Papa.parse(stream, {
  header: true,
  skipEmptyLines: true,
  step: ({ data, meta }) => {
    if (!fields) fields = meta.fields.filter((f) => KEEP.includes(f.replace(/^﻿/, '')));
    total++;
    const addr = Object.values(data).join(' ');
    if (!addr.includes(sgg)) return;
    const row = {};
    for (const f of fields) row[f.replace(/^﻿/, '')] = data[f];
    rows.push(row);
    if (total % 200000 === 0) console.log(`  ${total.toLocaleString()}줄 읽음…`);
  },
  complete: () => {
    if (!rows.length) {
      console.error(`"${sgg}"가 들어간 행을 찾지 못했어요. 파일과 구 이름을 확인하세요.`);
      process.exit(1);
    }
    const out = path.join(process.cwd(), 'data', `restaurants-${sgg}.csv`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, '﻿' + Papa.unparse(rows), 'utf8');
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`완료: 전체 ${total.toLocaleString()}줄 중 ${sgg} ${rows.length.toLocaleString()}곳 → ${out} (${kb}KB)`);
  },
  error: (e) => {
    console.error('읽기 실패:', e.message);
    process.exit(1);
  },
});
