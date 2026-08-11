/**
 * Ascending bars (campaign performance) + a pulse and broadcast arcs
 * (monitoring/automation) - drawn in white so it stays crisp inside the
 * indigo gradient badge (.brand-mark) regardless of what's behind the
 * badge itself (dark sidebar, light or dark login card).
 */
export default function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="13" width="3" height="7.5" rx="1" fill="white" />
      <rect x="9" y="9" width="3" height="11.5" rx="1" fill="white" />
      <rect x="14.5" y="5.5" width="3" height="15" rx="1" fill="white" />
      <circle cx="16" cy="4" r="1.7" fill="white" />
      <path d="M19 1.3a4.2 4.2 0 0 1 0 5.4" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M21 -0.5a7 7 0 0 1 0 8.4" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
