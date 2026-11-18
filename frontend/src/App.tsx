import { FormEvent, useEffect, useState } from 'react';
import { gqlRequest } from './graphql/client';

interface StatusMsg {
  type: 'success' | 'error';
  text: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
}

export function App() {
  // --- Estado Brevo (Registro y Verificación) ---
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [aceptoPrivacidad, setAceptoPrivacidad] = useState(true);
  const [tokenVerificacion, setTokenVerificacion] = useState('');
  const [emailStatus, setEmailStatus] = useState<StatusMsg | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);

  // --- Estado Login + Gemini AI ---
  const [loginCorreo, setLoginCorreo] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [idTema, setIdTema] = useState('');
  const [promptPregunta, setPromptPregunta] = useState('');
  const [aiStatus, setAiStatus] = useState<StatusMsg | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    gqlRequest<{ temas: TemaItem[] }>(`query { temas { _id titulo } }`)
      .then((res) => {
        setTemas(res.temas);
        if (res.temas.length > 0) {
          setIdTema(res.temas[0]._id);
        }
      })
      .catch(() => {
        // Si el backend aún no está encendido, se mantiene vacío
      });
  }, []);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setLoadingEmail(true);
    setEmailStatus(null);
    try {
      const data = await gqlRequest<{
        register: { message: string; correo: string };
      }>(
        `mutation Register($input: RegisterInput!) {
          register(input: $input) {
            message
            correo
            requiereVerificacion
          }
        }`,
        {
          input: {
            nombre,
            apellidos,
            correo,
            contrasena,
            aceptoPrivacidad,
          },
        },
      );
      setEmailStatus({
        type: 'success',
        text: `${data.register.message} (${data.register.correo})`,
      });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al registrar',
      });
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleVerifyEmail(e: FormEvent) {
    e.preventDefault();
    setLoadingEmail(true);
    setEmailStatus(null);
    try {
      const data = await gqlRequest<{
        verifyEmail: { success: boolean; message: string };
      }>(
        `mutation VerifyEmail($token: String!) {
          verifyEmail(token: $token) {
            success
            message
          }
        }`,
        { token: tokenVerificacion.trim() },
      );
      setEmailStatus({ type: 'success', text: data.verifyEmail.message });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al verificar token',
      });
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoadingAi(true);
    setAiStatus(null);
    try {
      const data = await gqlRequest<{
        login: { accessToken: string; usuario: { nombre: string; rol: string } };
      }>(
        `mutation Login($input: LoginInput!) {
          login(input: $input) {
            accessToken
            usuario { nombre rol }
          }
        }`,
        { input: { correo: loginCorreo, contrasena: loginPassword } },
      );
      setJwtToken(data.login.accessToken);
      setAiStatus({
        type: 'success',
        text: `Sesión iniciada como ${data.login.usuario.nombre} (${data.login.usuario.rol}).`,
      });
    } catch (err) {
      setAiStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error en login',
      });
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleAskGemini(e: FormEvent) {
    e.preventDefault();
    setLoadingAi(true);
    setAiStatus(null);
    try {
      const data = await gqlRequest<{
        consultarIa: {
          respuestaIa: string;
          fuentesCitadas: { tituloRecurso: string }[];
        };
      }>(
        `mutation ConsultarIa($idTema: ID!, $promptPregunta: String!) {
          consultarIa(idTema: $idTema, promptPregunta: $promptPregunta) {
            respuestaIa
            fuentesCitadas { tituloRecurso }
          }
        }`,
        { idTema: idTema.trim(), promptPregunta },
        jwtToken,
      );
      const fuentes = data.consultarIa.fuentesCitadas
        .map((f) => f.tituloRecurso)
        .join(', ');
      setAiStatus({
        type: 'success',
        text: `${data.consultarIa.respuestaIa}${
          fuentes ? `\n\nFuentes: ${fuentes}` : ''
        }`,
      });
    } catch (err) {
      setAiStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error consultando Gemini',
      });
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Kolab — Panel de Pruebas</h1>
        <p>Validación de correos con Brevo y consultas con Gemini AI</p>
      </header>

      <div className="grid">
        {/* Tarjeta 1: Brevo */}
        <section className="card">
          <h2>1. Prueba de Correos (Brevo)</h2>
          <p className="subtitle">
            Primero valida que el correo exista (MX + código) y luego envía la
            bienvenida.
          </p>

          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Iván"
              />
            </div>
            <div className="form-group">
              <label>Apellidos</label>
              <input
                required
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Ej. Pérez"
              />
            </div>
            <div className="form-group">
              <label>Correo real</label>
              <input
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tucorreo@gmail.com"
              />
            </div>
            <div className="form-group">
              <label>Contraseña (8+ chars, Mayús, Minús, Núm, Símbolo)</label>
              <input
                type="password"
                required
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Kolab2026!"
              />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={aceptoPrivacidad}
                onChange={(e) => setAceptoPrivacidad(e.target.checked)}
              />
              Acepto el aviso de privacidad
            </label>
            <button className="btn" type="submit" disabled={loadingEmail}>
              {loadingEmail ? 'Enviando...' : 'Registrar y enviar verificación'}
            </button>
          </form>

          <hr className="divider" />

          <form onSubmit={handleVerifyEmail}>
            <div className="form-group">
              <label>Token de verificación recibido por correo</label>
              <input
                required
                value={tokenVerificacion}
                onChange={(e) => setTokenVerificacion(e.target.value)}
                placeholder="Pega aquí el token del correo"
              />
            </div>
            <button
              className="btn btn-secondary"
              type="submit"
              disabled={loadingEmail}
            >
              Verificar correo y recibir bienvenida
            </button>
          </form>

          {emailStatus && (
            <div
              className={`alert ${
                emailStatus.type === 'success' ? 'alert-success' : 'alert-error'
              }`}
            >
              {emailStatus.text}
            </div>
          )}
        </section>

        {/* Tarjeta 2: Gemini AI */}
        <section className="card">
          <h2>2. Prueba de Gemini AI</h2>
          <p className="subtitle">
            Inicia sesión con tu usuario verificado y prueba una consulta de IA.
          </p>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Correo</label>
              <input
                type="email"
                required
                value={loginCorreo}
                onChange={(e) => setLoginCorreo(e.target.value)}
                placeholder="tucorreo@gmail.com"
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Kolab2026!"
              />
            </div>
            <button className="btn" type="submit" disabled={loadingAi}>
              Iniciar sesión (Obtener JWT)
            </button>
          </form>

          <hr className="divider" />

          <form onSubmit={handleAskGemini}>
            <div className="form-group">
              <label>Tema</label>
              {temas.length > 0 ? (
                <select
                  value={idTema}
                  onChange={(e) => setIdTema(e.target.value)}
                  required
                >
                  {temas.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.titulo} ({t._id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  value={idTema}
                  onChange={(e) => setIdTema(e.target.value)}
                  placeholder="ObjectId de 24 caracteres"
                />
              )}
            </div>
            <div className="form-group">
              <label>Pregunta para Gemini</label>
              <textarea
                rows={3}
                required
                value={promptPregunta}
                onChange={(e) => setPromptPregunta(e.target.value)}
                placeholder="Explícame el tema con base en los apuntes autorizados..."
              />
            </div>
            <button
              className="btn btn-secondary"
              type="submit"
              disabled={loadingAi || !jwtToken}
            >
              Consultar a Gemini AI
            </button>
          </form>

          {aiStatus && (
            <div
              className={`alert ${
                aiStatus.type === 'success' ? 'alert-success' : 'alert-error'
              }`}
            >
              {aiStatus.text}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
