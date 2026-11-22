
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
