import { useState } from 'react';
import { Topbar } from './components/Topbar';
import { KOLAB_MODULES, Sidebar } from './components/Sidebar';
import { Modulo5Asistente } from './components/Modulo5Asistente';
import { Modulo6Comunidades } from './components/Modulo6Comunidades';
import { Modulo7Tutorias } from './components/Modulo7Tutorias';
import { Modulo8Radar } from './components/Modulo8Radar';

export function App() {
  const [activeModule, setActiveModule] = useState<number>(8);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [xp, setXp] = useState<number>(120);

  const nivel = Math.floor(xp / 100) + 1;
  const currentModule = KOLAB_MODULES.find((m) => m.id === activeModule);

  function handleEarnXp(amount: number) {
    setXp((prev) => prev + amount);
  }

  return (
    <div className="kolab-shell">
      <Topbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        xp={xp}
        nivel={nivel}
      />

      <div className="kolab-body">
        <Sidebar
          activeModule={activeModule}
          onSelectModule={setActiveModule}
        />

        <main className="kolab-main">
          {activeModule === 5 ? (
            <Modulo5Asistente onEarnXp={handleEarnXp} />
          ) : activeModule === 6 ? (
            <Modulo6Comunidades xp={xp} onEarnXp={handleEarnXp} />
          ) : activeModule === 7 ? (
            <Modulo7Tutorias onEarnXp={handleEarnXp} />
          ) : activeModule === 8 ? (
            <Modulo8Radar />
          ) : (
            <section className="kolab-card placeholder-card">
              <span
                className="placeholder-pill"
                style={{ backgroundColor: currentModule?.color ?? '#157F3C' }}
              >
                Módulo {activeModule}
              </span>
              <h1 className="placeholder-title">{currentModule?.label}</h1>
              <p className="placeholder-desc">
                Este módulo aún está en construcción. Por ahora puedes probar el
                Asistente con IA (RAG) y autoevaluación en el Módulo 5.
              </p>
              <button
                type="button"
                className="btn-indigo"
                onClick={() => setActiveModule(5)}
              >
                Ir al Módulo 5
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
