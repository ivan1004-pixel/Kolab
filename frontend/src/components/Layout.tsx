import { FormEvent, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Logo from './Logo';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nivel = Math.floor((user?.xp ?? 0) / 200) + 1;
  const close = () => setOpen(false);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    try {
      assertNoScriptInjection(q, 'búsqueda');
      navigate(`/foro?q=${encodeURIComponent(q.trim())}`);
    } catch {
      setQ('');
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <Logo light />
        <nav className="nav" aria-label="Módulos">
          <NavLink to="/" end className="nav__link" onClick={close}>
            <span className="nav__num">★</span> Inicio
          </NavLink>
          {MODULES.map((m) => (
            <NavLink key={m.id} to={m.path} className="nav__link" onClick={close}>
              <span className={`nav__num ${m.ink ? 'nav__num--ink' : ''}`} style={{ background: m.c1 }}>{m.id}</span>
              {m.short}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={close} aria-hidden="true" />

      <div className="main">
        <div className="topbar">
          <button type="button" className="icon-btn" aria-label="Abrir menú" onClick={() => setOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <form className="search" role="search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="q">Buscar</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar recursos, dudas, grupos…" />
          </form>
          <span className="topbar__spacer" />
          <span className="chip chip--xp xp-chip">Nivel {nivel} · {user?.xp ?? 0} XP</span>
          <NavLink to="/perfil" className="avatar" aria-label="Mi perfil">
            {user?.foto_url ? <img src={user.foto_url} alt="" /> : (user?.nombre?.[0] ?? 'K')}
          </NavLink>
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>Salir</button>
        </div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
