// GET /api/weather?lat=..&lng=..
// Open-Meteo: 키 없이 쓰는 무료 날씨 API (비상업적 이용 무료)
// 정식 서비스로 운영한다면 기상청 단기예보 API(공공데이터포털)로 교체 권장

export const dynamic = 'force-dynamic';

// WMO 날씨 코드 → 비/눈 여부
function describe(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '눈', wet: true };
  if (code >= 51 && code <= 99) return { label: '비', wet: true };
  if (code >= 45 && code <= 48) return { label: '안개', wet: false };
  if (code >= 1 && code <= 3) return { label: '구름', wet: false };
  return { label: '맑음', wet: false };
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const lat = sp.get('lat');
  const lng = sp.get('lng');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code&timezone=Asia%2FSeoul`;

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    const { current } = await res.json();
    const d = describe(current.weather_code);
    return Response.json({
      source: 'open-meteo',
      temp: current.temperature_2m,
      precipitation: current.precipitation,
      label: d.label,
      wet: d.wet || current.precipitation > 0,
    });
  } catch {
    return Response.json({ source: 'unavailable' });
  }
}
