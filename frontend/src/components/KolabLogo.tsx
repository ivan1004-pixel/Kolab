interface KolabLogoProps {
  compact?: boolean;
}

export function KolabLogo({ compact = false }: KolabLogoProps) {
  return (
    <div className="kolab-logo" aria-label="Kolab">
      <svg
        className="kolab-isotipo"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="kolab-q1" x1="4" y1="4" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="kolab-q2" x1="34" y1="4" x2="60" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FACC15" />
          </linearGradient>
          <linearGradient id="kolab-q3" x1="4" y1="34" x2="30" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
          <linearGradient id="kolab-q4" x1="34" y1="34" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
          <clipPath id="kolab-rounded-box">
            <rect x="2" y="2" width="60" height="60" rx="16" />
          </clipPath>
        </defs>

        <rect x="2" y="2" width="60" height="60" rx="16" fill="#FFFFFF" />
        <g clipPath="url(#kolab-rounded-box)">
          {/* Cuadrante superior izquierdo */}
          <path d="M2 2H30.5C30.5 18 18 30.5 2 30.5V2Z" fill="url(#kolab-q1)" />
          {/* Cuadrante superior derecho */}
          <path d="M62 2V30.5C46 30.5 33.5 18 33.5 2H62Z" fill="url(#kolab-q2)" />
          {/* Cuadrante inferior izquierdo */}
          <path d="M2 62V33.5C18 33.5 30.5 46 30.5 62H2Z" fill="url(#kolab-q3)" />
          {/* Cuadrante inferior derecho */}
          <path d="M62 62H33.5C33.5 46 46 33.5 62 33.5V62Z" fill="url(#kolab-q4)" />
        </g>
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="16"
          stroke="#E5E7EB"
          strokeWidth="1.5"
        />
      </svg>
      {!compact && <span className="kolab-wordmark">Kolab</span>}
    </div>
  );
}
