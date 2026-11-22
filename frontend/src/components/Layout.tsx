
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  House,
  UserRound,
  GraduationCap,
  FolderOpen,
  MessagesSquare,
  Bot,
  UsersRound,
  Handshake,
  Radar,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import Logo from './Logo';
import NotificationBell from './NotificationBell';

export default function Layout() {
  const { user, logout } = useAuth();

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('kolab.theme') === 'dark'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('kolab.theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [open, setOpen] = useState(false);

  const nivel = Math.floor((user?.xp ?? 0) / 200) + 1;
  const close = () => setOpen(false);

  function getModuleIcon(id: number) {
    switch (id) {
      case 2: return GraduationCap;
      case 3: return FolderOpen;
      case 4: return MessagesSquare;
      case 5: return Bot;
      case 6: return UsersRound;
      case 7: return Handshake;
      case 8: return Radar;
      default: return FolderOpen;
    }
  }

  return (
    <div className="shell sidebar-collapsed">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar__header">
          <Logo light />
        </div>

        <nav className="nav" aria-label="Módulos">
          <NavLink
            to="/"
            end
            className="nav__link"
            onClick={close}
            title="Inicio"
          >
            <span className="nav__num nav__num--home">
              <House size={21} />
            </span>
            <span className="nav__label">Inicio</span>
          </NavLink>

          {(user?.rol === 'docente' || user?.rol === 'admin') && (
            <NavLink
              to="/docente"
              className="nav__link"
              onClick={close}
              title="Panel Docente"
            >
              <span className="nav__num" style={{ background: '#b45309' }}>
                <GraduationCap size={20} />
              </span>
              <span className="nav__label">Panel Docente</span>
            </NavLink>
          )}

          {MODULES.filter((m) => m.id !== 1).map((m) => {
            const Icon = getModuleIcon(m.id);

            return (
              <NavLink
                key={m.id}
                to={m.path}
                className="nav__link"
                onClick={close}
                title={m.short}
              >
                <span
                  className={`nav__num ${m.ink ? 'nav__num--ink' : ''}`}
                  style={{ background: m.c1 }}
                >
                  <Icon size={21} />
                </span>

                <span className="nav__label">{m.short}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <NavLink
            to="/perfil"
            className="nav__link"
            onClick={close}
            title="Mi perfil"
          >
            <span className="nav__num nav__num--profile">
              {user?.foto_url ? (
                <img src={user.foto_url} alt="" />
              ) : (
                <UserRound size={21} />
              )}
            </span>

            <span className="nav__label">Mi perfil</span>
          </NavLink>
        </div>
      </aside>

      <div
        className={`scrim ${open ? 'is-open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <div className="main">
        <div className="topbar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Abrir menú"
            onClick={() => setOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <span className="topbar__spacer" />

          <button
            type="button"
            className={`theme-switch ${darkMode ? 'theme-switch--dark' : ''}`}
            onClick={() => setDarkMode((current) => !current)}
            role="switch"
            aria-checked={darkMode}
            aria-label="Cambiar modo de color"
            title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
          >
            <span className="theme-switch__icon theme-switch__sun">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            </span>

            <span className="theme-switch__icon theme-switch__moon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6.5 6.5 0 0 0 8.268 8.268c.344-.215.825-.003.803.401" />
              </svg>
            </span>
          </button>

          <span className="chip chip--xp xp-chip">
            Nivel {nivel} · {user?.xp ?? 0} XP
          </span>

          <NotificationBell />

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={logout}
          >
            Salir
          </button>
        </div>

                <main className="content">
          <Outlet />
        </main>

        <footer className="kolab-footer kolab-footer--global">
          © {new Date().getFullYear()} Kolab. Todos los derechos reservados.
        </footer>
      </div>
    </div>
  );
}