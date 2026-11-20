import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Logo from '../components/Logo';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function Login() {
  const { user, login, register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    password: '',
    aceptoPrivacidad: true,
    token: '',
    nuevaContrasena: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (location.pathname === '/reset-password') {
      setMode('reset');
      if (urlToken) {
        setForm((f) => ({ ...f, token: urlToken }));
      }
      return;
    }

    if (!urlToken) return;

    setMode('verify');
    setForm((f) => ({ ...f, token: urlToken }));
    setError('');
    setLoading(true);

    verifyEmail(urlToken)
      .then((res) => {
        setSuccess(res.message || 'Correo verificado. Ya puedes iniciar sesión.');
        setMode('login');
      })
      .catch((err: any) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location.pathname, searchParams, verifyEmail]);

  if (user) return <Navigate to="/" replace />;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!form.email.trim() || !form.password) {
          throw new Error('Escribe tu correo y contraseña');
        }
        assertNoScriptInjection(form.email, 'correo');
        await login(form.email, form.password);
        navigate((location.state as any)?.from?.pathname ?? '/', { replace: true });
      } else if (mode === 'register') {
        if (!form.nombre.trim() || !form.apellidos.trim() || !form.email.trim() || !form.password) {
          throw new Error('Completa todos tus datos para registrarte');
        }
        if (!form.aceptoPrivacidad) {
          throw new Error('Debes aceptar el aviso de privacidad');
        }
        assertNoScriptInjection({ nombre: form.nombre, apellidos: form.apellidos, email: form.email }, 'registro');
        const res = await register({
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          correo: form.email.trim(),
          contrasena: form.password,
          aceptoPrivacidad: form.aceptoPrivacidad,
        });
        setSuccess(res.message);
        if (res.requiereVerificacion) {
          setMode('verify');
        }
      } else if (mode === 'verify') {
        if (!form.token.trim()) {
          throw new Error('Pega el token de verificación enviado a tu correo');
        }
        assertNoScriptInjection(form.token, 'token');
        const res = await verifyEmail(form.token);
        setSuccess(res.message || 'Correo verificado. Ya puedes iniciar sesión.');
        setMode('login');
      } else if (mode === 'forgot') {
        if (!form.email.trim()) {
          throw new Error('Escribe tu correo para enviarte el enlace');
        }
        assertNoScriptInjection(form.email, 'correo');
        if (USE_MOCK) {
          setSuccess('En modo demo no se envían correos. Activa VITE_USE_MOCK=false para usar Brevo.');
        } else {
          const data = await gqlRequest(
            `mutation ForgotPassword($correo: String!) {
              forgotPassword(correo: $correo) { success message }
            }`,
            { correo: form.email.trim() },
          );
          setSuccess(data.forgotPassword.message);
        }
      } else if (mode === 'reset') {
        if (!form.token.trim() || !form.nuevaContrasena) {
          throw new Error('Ingresa el token y tu nueva contraseña');
        }
        assertNoScriptInjection(form.token, 'token');
        if (USE_MOCK) {
          setSuccess('Contraseña actualizada (modo demo).');
          setMode('login');
        } else {
          const data = await gqlRequest(
            `mutation ResetPassword($input: ResetPasswordInput!) {
              resetPassword(input: $input) { success message }
            }`,
            {
              input: {
                token: form.token.trim(),
                nuevaContrasena: form.nuevaContrasena,
              },
            },
          );
          setSuccess(data.resetPassword.message || 'Contraseña restablecida. Ya puedes iniciar sesión.');
          setForm((f) => ({ ...f, password: '', nuevaContrasena: '', token: '' }));
          setMode('login');
        }
      }
    } catch (err: any) {
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
          <div className="login-tabs" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`login-tab ${mode === 'login' ? 'is-active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`login-tab ${mode === 'register' ? 'is-active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'verify'}
              className={`login-tab ${mode === 'verify' ? 'is-active' : ''}`}
              onClick={() => switchMode('verify')}
            >
              Verificar
            </button>
          </div>

          <h2 style={{ fontSize: '1.85rem', fontWeight: 800 }}>
            {mode === 'login' && 'Iniciar sesión'}
            {mode === 'register' && 'Únete a KOLAB'}
            {mode === 'verify' && 'Verifica tu correo'}
            {mode === 'forgot' && 'Recuperar contraseña'}
            {mode === 'reset' && 'Nueva contraseña'}
          </h2>

          {mode === 'register' && (
            <div className="login-name-grid">
              <div className="field">
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" name="nombre" value={form.nombre} onChange={onChange} placeholder="Ana" />
              </div>
              <div className="field">
                <label htmlFor="apellidos">Apellidos</label>
                <input id="apellidos" name="apellidos" value={form.apellidos} onChange={onChange} placeholder="Pérez" />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div className="field">
              <label htmlFor="email">Correo institucional</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={form.email}
                onChange={onChange}
                placeholder="tu.nombre@utvt.edu.mx"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={onChange}
                placeholder={mode === 'register' ? 'Mín. 8 chars, Mayús, Núm y Símbolo' : ''}
              />
            </div>
          )}

          {mode === 'register' && (
            <label className="login-check">
              <input
                type="checkbox"
                name="aceptoPrivacidad"
                checked={form.aceptoPrivacidad}
                onChange={onChange}
              />
              <span>Acepto el aviso de privacidad</span>
            </label>
          )}

          {mode === 'verify' && (
            <div className="field">
              <label htmlFor="token">Token de verificación</label>
              <input
                id="token"
                name="token"
                value={form.token}
                onChange={onChange}
                placeholder="Pega el código recibido por correo"
              />
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div className="field">
                <label htmlFor="reset-token">Token de recuperación</label>
                <input
                  id="reset-token"
                  name="token"
                  value={form.token}
                  onChange={onChange}
                  placeholder="Pega el token recibido por correo"
                />
              </div>
              <div className="field">
                <label htmlFor="nuevaContrasena">Nueva contraseña</label>
                <input
                  id="nuevaContrasena"
                  name="nuevaContrasena"
                  type="password"
                  autoComplete="new-password"
                  value={form.nuevaContrasena}
                  onChange={onChange}
                  placeholder="Mín. 8 chars, Mayús, Núm y Símbolo"
                />
              </div>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}

          <button className="btn btn--action" disabled={loading}>
            {loading
              ? 'Procesando…'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'register'
                  ? 'Registrarme'
                  : mode === 'verify'
                    ? 'Verificar correo'
                    : mode === 'reset'
                      ? 'Guardar nueva contraseña'
                      : 'Enviar enlace'}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              className="login-link"
              onClick={() => switchMode('forgot')}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          {mode === 'forgot' && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('reset')}
              >
                Ya tengo mi token
              </button>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('login')}
              >
                Volver a iniciar sesión
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              className="login-link"
              onClick={() => switchMode('login')}
            >
              Volver a iniciar sesión
            </button>
          )}

          {USE_MOCK && mode === 'login' && (
            <p className="demo-box">
              Modo demo: <b>estudiante@</b>, <b>docente@</b>, <b>admin@</b> o <b>moderador@</b>utvt.edu.mx · contraseña <b>kolab123</b>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
