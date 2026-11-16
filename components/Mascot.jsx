// 골라밥 마스코트: 웃는 밥그릇 (직접 그린 SVG)
export default function Mascot({ size = 60 }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {/* 김 모락모락 */}
      <path className="steam steam-1" d="M24 12c-3-3 3-5 0-8" fill="none" stroke="#2B2A4C" strokeWidth="2.6" strokeLinecap="round" />
      <path className="steam steam-2" d="M38 11c-3-3 3-5 0-8" fill="none" stroke="#2B2A4C" strokeWidth="2.6" strokeLinecap="round" />
      {/* 밥 */}
      <path d="M11 33c0-11 9-17 21-17s21 6 21 17z" fill="#fff" stroke="#2B2A4C" strokeWidth="3" strokeLinejoin="round" />
      {/* 그릇 */}
      <path d="M6 32h52c0 15-10 25-26 25S6 47 6 32z" fill="#FF7A6B" stroke="#2B2A4C" strokeWidth="3" strokeLinejoin="round" />
      <rect x="22" y="56" width="20" height="5" rx="2.5" fill="#FF7A6B" stroke="#2B2A4C" strokeWidth="3" />
      {/* 얼굴 */}
      <circle cx="24" cy="42" r="2.6" fill="#2B2A4C" />
      <circle cx="40" cy="42" r="2.6" fill="#2B2A4C" />
      <path d="M28 46c2 3 6 3 8 0" fill="none" stroke="#2B2A4C" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="17" cy="46" rx="3.2" ry="2" fill="#FFC94D" />
      <ellipse cx="47" cy="46" rx="3.2" ry="2" fill="#FFC94D" />
    </svg>
  );
}
