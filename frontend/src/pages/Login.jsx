import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { USE_MOCK } from '../services/api.js';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.password) return setError('Escribe tu correo y contraseña');
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login__brand">
        <Logo light size={48} />
        <div>
          <h1>Aprender juntos, con confianza.</h1>
          <p>Comparte apuntes, pregunta justo donde no entendiste y valida con quien enseña.</p>
        </div>
        <small>Proyecto KOLAB · UTVT · 2026</small>
      </section>

      <section className="login__panel">
        <form className="login__form" onSubmit={onSubmit} noValidate>
          <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Iniciar sesión</h2>
          <div className="field">
            <label htmlFor="email">Correo institucional</label>
            <input id="email" name="email" type="email" autoComplete="username" value={form.email} onChange={onChange} placeholder="tu.nombre@utvt.edu.mx" />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={onChange} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--action" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
          {USE_MOCK && (
            <p className="demo-box">
              Modo demo: <b>estudiante@</b>, <b>docente@</b>, <b>admin@</b> o <b>moderador@</b>utvt.edu.mx · contraseña <b>kolab123</b>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
