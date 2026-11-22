import { CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';

const ROLE_LABELS: Record<string, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administrador',
};

export default function Dashboard() {
  const { user, token } = useAuth();
  const [badgesCount, setBadgesCount] = useState(user?.insignias ?? 0);
  const [retosCount, setRetosCount] = useState(user?.retos ?? 0);

  useEffect(() => {
    if (USE_MOCK || !token) return;
    let active = true;
    gqlRequest<{
      misInsignias: Array<{ _id: string }>;
      retosComunitarios: Array<{ _id: string; completado: boolean }>;
    }>(
      `query DashboardStats {
        misInsignias { _id }
        retosComunitarios { _id completado }
      }`,
      {},
      token,
    )
      .then((data) => {
        if (!active) return;
        setBadgesCount(data.misInsignias?.length ?? 0);
        setRetosCount(data.retosComunitarios?.length ?? 0);
      })
      .catch(() => {
        // Mantener valores base si falla la consulta
      });
    return () => {
      active = false;
    };
  }, [token]);

  const xp = user?.xp ?? 0;
  const pct = Math.round(((xp % 200) / 200) * 100);

  return (
        <div className="dashboard">
      <section className="hero">
        <span className="chip chip--solid" style={{ alignSelf: 'flex-start' }}>
          {ROLE_LABELS[user?.rol ?? 'estudiante'] ?? 'Estudiante'}
        </span>
        <h1>Hola, {user?.nombre}</h1>
        <p className="muted">Comparte, busca y confía en materiales revisados.</p>
      </section>

      <section className="stats" aria-label="Tu progreso">
        <div className="stat stat--xp"><span>XP total</span><strong>{xp}</strong></div>
        <div className="stat stat--badges"><span>Insignias</span><strong>{badgesCount}</strong></div>
        <div className="stat stat--retos"><span>Retos</span><strong>{retosCount}</strong></div>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="card__title">Progreso al siguiente nivel</h2>
          <span className="chip chip--xp">{pct}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ '--p': `${pct}%` } as CSSProperties} />
        </div>
        <div className="row">
          <Link className="btn btn--primary" to="/foro">Hacer una pregunta</Link>
          <Link className="btn btn--ghost" to="/perfil">Mi perfil</Link>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: '1rem' }}>Módulos</h2>
        <div className="module-grid">
          {MODULES.map((m) => (
            <Link key={m.id} to={m.path} className="module-card" style={{ '--c1': m.c1, '--c2': m.c2 } as CSSProperties}>
              <span className={`module-card__num ${m.ink ? 'module-card__num--ink' : ''}`}>{m.id}</span>
              <h3>{m.name}</h3>
              <p className="muted">{m.desc}</p>
            </Link>
          ))}
                </div>
      </section>

      <footer className="kolab-footer">
        © {new Date().getFullYear()} Kolab. Todos los derechos reservados.
      </footer>
        </div>
  );
}
