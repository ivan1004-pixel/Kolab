import { KolabLogo } from './KolabLogo';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  xp: number;
  nivel: number;
}

export function Topbar({
  searchQuery,
  onSearchChange,
  xp,
  nivel,
}: TopbarProps) {
  return (
    <header className="kolab-topbar">
      <div className="topbar-brand">
        <KolabLogo />
      </div>

      <div className="topbar-search-wrap">
        <input
          type="search"
          className="topbar-search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar recursos, dudas, grupos..."
          aria-label="Buscar recursos, dudas, grupos"
        />
      </div>

      <div className="topbar-meta">
        <span className="pill-stat pill-xp" title="Nivel y experiencia acumulada">
          Nivel {nivel} · {xp} XP
        </span>
        <span className="pill-stat pill-school">UTVT</span>
        <button
          type="button"
          className="topbar-avatar"
          title="Perfil de estudiante"
          aria-label="Perfil de estudiante"
        >
          ES
        </button>
      </div>
    </header>
  );
}
