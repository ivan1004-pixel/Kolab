export interface NavModule {
  id: number;
  label: string;
  color: string;
}

export const KOLAB_MODULES: NavModule[] = [
  { id: 1, label: 'Identidad y perfiles', color: '#157F3C' },
  { id: 2, label: 'Gestión curricular', color: '#0F766E' },
  { id: 3, label: 'Repositorio de recursos', color: '#4D7C0F' },
  { id: 4, label: 'Foro de dudas', color: '#2563EB' },
  { id: 5, label: 'Asistente IA y cuestionarios', color: '#4338CA' },
  { id: 6, label: 'Comunidades y retos', color: '#B45309' },
  { id: 7, label: 'Tutorías, duelos y moderación', color: '#9F1239' },
  { id: 8, label: 'Radar y PWA', color: '#157F3C' },
];

interface SidebarProps {
  activeModule: number;
  onSelectModule: (id: number) => void;
}

export function Sidebar({ activeModule, onSelectModule }: SidebarProps) {
  return (
    <aside className="kolab-sidebar" aria-label="Módulos de Kolab">
      <nav className="sidebar-nav">
        {KOLAB_MODULES.map((mod) => {
          const isActive = mod.id === activeModule;
          return (
            <button
              key={mod.id}
              type="button"
              className={`sidebar-item ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelectModule(mod.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className="sidebar-badge"
                style={{ backgroundColor: mod.color }}
              >
                {mod.id}
              </span>
              <span className="sidebar-label">{mod.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
