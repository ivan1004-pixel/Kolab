import { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { ROLES } from '../data/demoUsers';

export default function Dashboard() {
  const { user } = useAuth();
  const xp = user?.xp ?? 0;
  const pct = Math.round(((xp % 200) / 200) * 100);

  return (
        <div className="dashboard">
      <section className="hero">
        <span className="chip chip--solid" style={{ alignSelf: 'flex-start' }}>{ROLES[user?.rol ?? 'estudiante']}</span>
        <h1>Hola, {user?.nombre}</h1>
        <p className="muted">Comparte, busca y confía en materiales revisados.</p>
      </section>

      <section className="stats" aria-label="Tu progreso">
        <div className="stat stat--xp"><span>XP total</span><strong>{xp}</strong></div>
        <div className="stat stat--badges"><span>Insignias</span><strong>{user?.insignias ?? 0}</strong></div>
        <div className="stat stat--retos"><span>Retos</span><strong>{user?.retos ?? 0}</strong></div>
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
