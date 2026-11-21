interface LogoProps {
  light?: boolean;
  size?: number;
  variant?: 'auto' | 'icon' | 'full';
}

export default function Logo({
  light = false,
  size = 40,
  variant = 'auto',
}: LogoProps) {
  if ((variant === 'full' || (variant === 'auto' && !light)) && !light) {
    return (
      <span className="logo logo--official">
        <img
          src="/assets/kolab-logo.png"
          alt="Kolab"
          style={{ height: size, width: 'auto', display: 'block', objectFit: 'contain' }}
        />
      </span>
    );
  }

  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <span
        className="logo__badge"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.25),
          background: light ? 'rgba(255, 255, 255, 0.12)' : '#e5f6ff',
          padding: Math.max(4, Math.round(size * 0.14)),
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <img
          src="/assets/kolab-icon.png"
          alt="Kolab"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </span>
      {variant !== 'icon' && <span>Kolab</span>}
    </span>
  );
}
