// POST /api/blog   body: { places: [{ id, name, jibun }] }
// 가게 목록을 먼저 보여준 뒤, 화면이 이 주소로 후기 수를 나눠서(한 번에 최대 20곳) 받아 감
// → 첫 화면이 빨리 뜨고, 후기 수는 뒤따라 채워짐

import { fetchBlogCounts, naverEnabled } from '@/lib/naver';

export const dynamic = 'force-dynamic';

const MAX_PER_REQUEST = 20;

export async function POST(req) {
  if (!naverEnabled()) {
    return Response.json({ error: '네이버 키가 설정되지 않았어요.' }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }

  const places = (Array.isArray(body?.places) ? body.places : [])
    .slice(0, MAX_PER_REQUEST)
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= 60)
    .map((p) => ({ id: p.id, name: p.name, jibun: typeof p.jibun === 'string' ? p.jibun.slice(0, 100) : '' }));

  const { counts, failed } = await fetchBlogCounts(places);
  return Response.json({ counts, failed });
}
