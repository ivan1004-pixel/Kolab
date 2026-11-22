
import '../styles/skeleton.css';

interface SkeletonProps {
  variant?: 'text' | 'circle' | 'card' | 'title';
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}

export default function Skeleton({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-group ${className}`}
      aria-busy="true"
      aria-live="polite"
      aria-label="Cargando contenido"
    >

      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`skeleton skeleton--${variant}`}
          style={{ width, height }}
        />
      ))}
    </div>
  );
}

export function CardListSkeleton({
  count = 3,
  bare = false,
}: {
  count?: number;
  bare?: boolean;
}) {
  const cards = Array.from({ length: count }).map((_, index) => (
    <div key={index} className="skeleton-card-box" aria-busy="true" aria-label="Cargando tarjetas">
      <div className="skeleton skeleton--title" style={{ width: '58%', height: '20px' }} />
      <div className="skeleton skeleton--text" style={{ width: '92%' }} />
      <div className="skeleton skeleton--text" style={{ width: '74%' }} />
      <div className="skeleton skeleton--text" style={{ width: '32%', height: '22px', borderRadius: '999px' }} />
    </div>
  ));

  if (bare) {
    return <>{cards}</>;
  }

  return (
    <div className="skeleton-stack" aria-busy="true" aria-live="polite" aria-label="Cargando contenido">
      {cards}
    </div>
  );
}

export function RowListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stack" aria-busy="true" aria-live="polite" aria-label="Cargando lista">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <div className="skeleton skeleton--circle" style={{ width: '40px', height: '40px', flexShrink: 0 }} />
          <div className="skeleton-row__body">
            <div className="skeleton skeleton--text" style={{ width: '52%', height: '15px' }} />
            <div className="skeleton skeleton--text" style={{ width: '78%', height: '12px' }} />
          </div>
          <div className="skeleton skeleton--text" style={{ width: '74px', height: '26px', borderRadius: '999px', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ bars = 6 }: { bars?: number }) {
  const heights = ['55%', '82%', '42%', '94%', '66%', '48%'];
  return (
    <div className="skeleton-bars" aria-busy="true" aria-live="polite" aria-label="Cargando gráfica">
      {Array.from({ length: bars }).map((_, index) => (
        <div key={index} className="skeleton-bar-col">
          <div
            className="skeleton"
            style={{ width: '100%', maxWidth: '38px', height: heights[index % heights.length], borderRadius: '10px' }}
          />
          <div className="skeleton skeleton--text" style={{ width: '34px', height: '10px' }} />
        </div>
      ))}
    </div>
  );
}
