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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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
    <div className="stitch-login-page">
      <header className="stitch-topbar">
        <div className="stitch-topbar__help">
          <span>¿Necesitas ayuda?</span>
          <a className="stitch-topbar__link" href="#soporte" onClick={(e) => { e.preventDefault(); switchMode('forgot'); }}>
            Soporte
          </a>
        </div>
      </header>

      <main className="stitch-main">
        <div className="stitch-card">
          {/* Panel Izquierdo (Escritorio) */}
          <aside className="stitch-hero">
            <div>
              <div className="stitch-hero__pill">
                <span className="stitch-hero__dot" aria-hidden="true" />
              </div>

              <div className="stitch-hero__brand">
                <Logo light size={46} />
                <h2 className="stitch-hero__title">
                  Conecta, colabora y haz avanzar tus proyectos en equipo.
                </h2>
                <p className="stitch-hero__desc">
                  La plataforma todo en uno para equipos modernos. Gestiona tareas, comparte recursos y sincroniza tu trabajo en tiempo real.
                </p>
              </div>
            </div>

            <div className="stitch-hero__foot">
              Proyecto KOLAB · UTVT · 2026
            </div>
          </aside>

          {/* Panel Derecho (Formulario) */}
          <section className="stitch-form-panel">
            <div className="stitch-form-wrap">
              {/* Header móvil con logo oficial */}
              <div className="stitch-mobile-brand">
                <Logo size={42} variant="full" />
              </div>

              {/* Header escritorio con logo oficial */}
              <div className="stitch-form-brand">
                <Logo size={38} variant="full" />
              </div>

              <h1 className="stitch-heading">
                {mode === 'login' && 'Bienvenido a Kolab'}
                {mode === 'register' && 'Crea tu cuenta en Kolab'}
                {mode === 'verify' && 'Verifica tu correo'}
                {mode === 'forgot' && 'Recuperar contraseña'}
                {mode === 'reset' && 'Nueva contraseña'}
              </h1>
              <p className="stitch-subheading">
                {mode === 'login' && 'Ingresa tus credenciales para acceder a tus salas de trabajo y proyectos compartidos.'}
                {mode === 'register' && 'Regístrate con tu correo real para recibir tu verificación por Brevo.'}
                {mode === 'verify' && 'Ingresa el código de verificación enviado a tu correo para activar tu cuenta.'}
                {mode === 'forgot' && 'Te enviaremos un enlace temporal para restablecer tu contraseña.'}
                {mode === 'reset' && 'Ingresa el token recibido y define tu nueva contraseña segura.'}
              </p>

              {mode === 'login' && (
                <>
                  <button
                    type="button"
                    className="stitch-google-btn"
                    onClick={() => setError('El inicio de sesión con Google requiere configurar OAuth. Usa tu correo institucional abajo.')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z" fill="#4285F4" />
                      <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z" fill="#34A853" />
                      <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
                      <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
                    </svg>
                    <span>Continuar con Google</span>
                  </button>

                  <div className="stitch-divider">
                    <span>o inicia sesión con tu correo</span>
                  </div>
                </>
              )}

              <form className="stitch-form" onSubmit={onSubmit} noValidate>
                {mode === 'register' && (
                  <div className="stitch-name-grid">
                    <div>
                      <label className="stitch-label" htmlFor="nombre">Nombre</label>
                      <input
                        className="stitch-input stitch-input--no-icon"
                        id="nombre"
                        name="nombre"
                        value={form.nombre}
                        onChange={onChange}
                        placeholder="Ana"
                      />
                    </div>
                    <div>
                      <label className="stitch-label" htmlFor="apellidos">Apellidos</label>
                      <input
                        className="stitch-input stitch-input--no-icon"
                        id="apellidos"
                        name="apellidos"
                        value={form.apellidos}
                        onChange={onChange}
                        placeholder="Pérez"
                      />
                    </div>
                  </div>
                )}

                {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                  <div>
                    <label className="stitch-label" htmlFor="email">Correo electrónico o usuario</label>
                    <div className="stitch-input-wrap">
                      <span className="stitch-input-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </span>
                      <input
                        className="stitch-input"
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        value={form.email}
                        onChange={onChange}
                        placeholder="nombre@tuorganizacion.com"
                      />
                    </div>
                  </div>
                )}

                {(mode === 'login' || mode === 'register') && (
                  <div>
                    <div className="stitch-label-row">
                      <label className="stitch-label" htmlFor="password">Contraseña</label>
                      {mode === 'login' && (
                        <button type="button" className="stitch-link-sm" onClick={() => switchMode('forgot')}>
                          ¿Olvidaste tu contraseña?
                        </button>
                      )}
                    </div>
                    <div className="stitch-input-wrap">
                      <span className="stitch-input-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <input
                        className="stitch-input stitch-input--pwd"
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={form.password}
                        onChange={onChange}
                        placeholder={mode === 'register' ? 'Mín. 8 chars, Mayús, Núm y Símbolo' : '••••••••••••'}
                      />
                      <button
                        type="button"
                        className="stitch-eye-btn"
                        onClick={() => setShowPassword((v) => !v)}
                        title="Mostrar u ocultar contraseña"
                        aria-label="Mostrar u ocultar contraseña"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showPassword ? (
                            <>
                              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                              <line x1="2" y1="2" x2="22" y2="22" />
                            </>
                          ) : (
                            <>
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'login' && (
                  <label className="stitch-check-row">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Recordar mi cuenta en este equipo</span>
                  </label>
                )}

                {mode === 'register' && (
                  <label className="stitch-check-row">
                    <input
                      type="checkbox"
                      name="aceptoPrivacidad"
                      checked={form.aceptoPrivacidad}
                      onChange={onChange}
                    />
                    <span>Acepto los Términos de Servicio y la Política de Privacidad</span>
                  </label>
                )}

                {mode === 'verify' && (
                  <div>
                    <label className="stitch-label" htmlFor="token">Token de verificación</label>
                    <input
                      className="stitch-input stitch-input--no-icon"
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
                    <div>
                      <label className="stitch-label" htmlFor="reset-token">Token de recuperación</label>
                      <input
                        className="stitch-input stitch-input--no-icon"
                        id="reset-token"
                        name="token"
                        value={form.token}
                        onChange={onChange}
                        placeholder="Pega el token recibido por correo"
                      />
                    </div>
                    <div>
                      <label className="stitch-label" htmlFor="nuevaContrasena">Nueva contraseña</label>
                      <input
                        className="stitch-input stitch-input--no-icon"
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
                {success && <p className="form-ok" role="status">{success}</p>}

                <button className="stitch-submit-btn" type="submit" disabled={loading}>
                  <span>
                    {loading
                      ? 'Procesando…'
                      : mode === 'login'
                        ? 'Iniciar Sesión'
                        : mode === 'register'
                          ? 'Registrarme gratis'
                          : mode === 'verify'
                            ? 'Verificar correo'
                            : mode === 'reset'
                              ? 'Guardar nueva contraseña'
                              : 'Enviar enlace'}
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </form>

              <div className="stitch-signup-prompt">
                {mode === 'login' ? (
                  <>
                    <span>¿No tienes una cuenta aún?</span>
                    <button type="button" className="stitch-signup-btn" onClick={() => switchMode('register')}>
                      Regístrate gratis
                    </button>
                    <div style={{ marginTop: '0.4rem' }}>
                      <button type="button" className="stitch-link-sm" onClick={() => switchMode('verify')}>
                        ¿Ya tienes token de verificación?
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>¿Ya tienes cuenta?</span>
                    <button type="button" className="stitch-signup-btn" onClick={() => switchMode('login')}>
                      Iniciar sesión
                    </button>
                  </>
                )}
              </div>

              {USE_MOCK && mode === 'login' && (
                <p className="demo-box" style={{ marginTop: '0.9rem' }}>
                  Modo demo: <b>estudiante@</b>, <b>docente@</b>, <b>admin@</b> o <b>moderador@</b>utvt.edu.mx · contraseña <b>kolab123</b>
                </p>
              )}
            </div>

            <div className="stitch-trust-bar">
              <span>Conexión segura · Protección anti-scripts y verificación Brevo</span>
              <span className="stitch-trust-dot" aria-hidden="true" />
            </div>
          </section>
        </div>
      </main>

      <footer className="stitch-footer">
        <span>© 2026 Kolab Technologies Inc.</span>
        <div className="stitch-footer__links">
          <a href="#privacidad" onClick={(e) => e.preventDefault()}>Política de Privacidad</a>
          <a href="#terminos" onClick={(e) => e.preventDefault()}>Términos de Servicio</a>
          <a href="#estado" onClick={(e) => e.preventDefault()}>Estado del Sistema</a>
        </div>
      </footer>
    </div>
  );
}
