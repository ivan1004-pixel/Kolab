// PLACEHOLDER. Reemplazar por el logotipo oficial del manual (SVG/PNG):
// el wordmark "Kolab" no se reescribe con tipografía.
export default function Logo({ light = false, size = 40 }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <defs>
          <clipPath id="kolab-clip"><rect width="48" height="48" rx="12" /></clipPath>
          <linearGradient id="kg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#3b4cb8" /></linearGradient>
          <linearGradient id="kg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fb7c2c" /><stop offset="1" stopColor="#f6d012" /></linearGradient>
          <linearGradient id="kg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbbf0e" /><stop offset="1" stopColor="#2cc4b4" /></linearGradient>
          <linearGradient id="kg4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ef6a72" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
        </defs>
        <g clipPath="url(#kolab-clip)">
          <rect width="48" height="48" fill="#fff" />
          <circle cx="6" cy="6" r="22" fill="url(#kg1)" />
          <circle cx="42" cy="6" r="22" fill="url(#kg2)" />
          <circle cx="6" cy="42" r="22" fill="url(#kg3)" />
          <circle cx="42" cy="42" r="22" fill="url(#kg4)" />
          <path d="M24 8C25 19 29 23 40 24C29 25 25 29 24 40C23 29 19 25 8 24C19 23 23 19 24 8Z" fill="#fff" />
        </g>
      </svg>
      Kolab
    </span>
  );
}
