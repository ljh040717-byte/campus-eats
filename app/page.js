import App from '@/components/App';

// 검색 중심 좌표 (기본값: 서울과학기술대학교 근처). .env.local에서 바꿀 수 있음
const center = {
  lat: Number(process.env.NEXT_PUBLIC_CENTER_LAT) || 37.6318,
  lng: Number(process.env.NEXT_PUBLIC_CENTER_LNG) || 127.0773,
};
const centerName = process.env.NEXT_PUBLIC_CENTER_NAME || '서울과기대';

export default function Page() {
  return <App defaultCenter={center} centerName={centerName} />;
}
