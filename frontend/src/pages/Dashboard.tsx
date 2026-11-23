import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Flame, Snowflake, Sparkles, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Skeleton, { CardListSkeleton, RowListSkeleton } from '../components/Skeleton';
import AdminDashboard from './AdminDashboard';
import DocenteDashboard from './DocenteDashboard';

const ROLE_LABELS: Record<string, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administrador',
};

interface AsignaturaItem {
  _id: string;
  nombre: string;
  cuatrimestre?: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
}

interface RecursoValidado {
  _id: string;
  titulo: string;
  nombreAutor?: string;
  tipoArchivo: string;
  promedioCalificacion: number;
  esMaterialOficial: boolean;
  idTema: string;
  createdAt: string;
}

interface EventoCalendario {
  _id: string;
  titulo: string;
  tipo: string;
  fecha: string;
  idAsignatura: string;
}

interface PlanRepasoItem {
  idEvento: string;
  tituloEvento: string;
  fechaEvento: string;
  prioridad: string;
  recomendacion: string;
  conceptosClave: string[];
}

interface PreguntaDia {
  idTema: string;
  tituloTema: string;
  pregunta: string;
  dificultad: string;
  motivoPrioridad: string;
  fuenteTitulo?: string;
}

interface NotificacionReciente {
  _id: string;
  titulo: string;
  mensaje: string;
  createdAt: string;
}

export default function Dashboard() {
  const { user, token, refreshUser } = useAuth();

  // DOCENTE entra directo al Panel Docente; ADMIN entra al Panel Admin y puede alternar vistas
  const [adminView, setAdminView] = useState<'admin' | 'docente' | 'estudiante'>('admin');

  const [badgesCount, setBadgesCount] = useState(user?.insignias ?? 0);
  const [retosCount, setRetosCount] = useState(user?.retos ?? 0);
  const [loadingStats, setLoadingStats] = useState(!USE_MOCK && Boolean(token));
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<string[]>(user?.asignaturasInscritas ?? []);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [validatedResources, setValidatedResources] = useState<RecursoValidado[]>([]);
  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [planRepaso, setPlanRepaso] = useState<PlanRepasoItem[]>([]);
  const [preguntaDia, setPreguntaDia] = useState<PreguntaDia | null>(null);
  const [actividad, setActividad] = useState<NotificacionReciente[]>([]);

  // RF-09: Cuadro de diálogo rápido para preguntar desde el Dashboard
  const [quickTemaId, setQuickTemaId] = useState('');
  const [quickQuestion, setQuickQuestion] = useState('');
  const [quickMsg, setQuickMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sendingQuick, setSendingQuick] = useState(false);

  // RF-38: Congelar racha
  const [streakMsg, setStreakMsg] = useState<string | null>(null);

  const loadStudentDashboard = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoadingStats(false);
      return;
    }
    setLoadingStats(true);
    try {
      const data = await gqlRequest<{
        miPerfil: {
          asignaturasInscritas: string[];
          rachaActual: number;
          rachaMasLarga: number;
          comodinesMes: number;
        };
        misInsignias: Array<{ _id: string }>;
        retosComunitarios: Array<{ _id: string; completado: boolean }>;
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
        recursos: RecursoValidado[];
        calendarioEventos: EventoCalendario[];
        planDeRepaso: PlanRepasoItem[];
        preguntaDelDia: PreguntaDia | null;
        misNotificaciones: NotificacionReciente[];
      }>(
        `query StudentDashboardFull {
          miPerfil { asignaturasInscritas rachaActual rachaMasLarga comodinesMes }
          misInsignias { _id }
          retosComunitarios { _id completado }
          asignaturas { _id nombre cuatrimestre }
          temas { _id titulo }
          recursos(filtros: { estadoValidacion: REVISADO_DOCENTE }) {
            _id titulo nombreAutor tipoArchivo promedioCalificacion esMaterialOficial idTema createdAt
          }
          calendarioEventos { _id titulo tipo fecha idAsignatura }
          planDeRepaso { idEvento tituloEvento fechaEvento prioridad recomendacion conceptosClave }
          preguntaDelDia { idTema tituloTema pregunta dificultad motivoPrioridad fuenteTitulo }
          misNotificaciones { _id titulo mensaje createdAt }
        }`,
        {},
        token,
      );

      setBadgesCount(data.misInsignias?.length ?? 0);
      setRetosCount(data.retosComunitarios?.length ?? 0);
      setAsignaturas(data.asignaturas ?? []);
      setEnrolledIds(data.miPerfil?.asignaturasInscritas ?? []);
      const temaList = data.temas ?? [];
      setTemas(temaList);
      if (temaList.length > 0 && !quickTemaId) {
        setQuickTemaId(temaList[0]._id);
      }
      setValidatedResources((data.recursos ?? []).slice(0, 5));
      setEventos((data.calendarioEventos ?? []).slice(0, 5));
      setPlanRepaso((data.planDeRepaso ?? []).slice(0, 4));
      setPreguntaDia(data.preguntaDelDia ?? null);
      setActividad((data.misNotificaciones ?? []).slice(0, 5));
    } catch {
      // Mantener valores base si falla alguna consulta
    } finally {
      setLoadingStats(false);
    }
  }, [token, quickTemaId]);

  useEffect(() => {
    if (user?.rol === 'docente') return;
    if (user?.rol === 'admin' && adminView === 'docente') return;
    loadStudentDashboard();
  }, [user?.rol, adminView, loadStudentDashboard]);

  const mySubjects = useMemo(() => {
    const enrolled = asignaturas.filter((a) => enrolledIds.includes(a._id));
    return enrolled.length > 0 ? enrolled : asignaturas.slice(0, 4);
  }, [asignaturas, enrolledIds]);

  const topicMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const subjectMap = useMemo(() => new Map(asignaturas.map((a) => [a._id, a.nombre])), [asignaturas]);

  if (user?.rol === 'docente') {
    return <DocenteDashboard />;
  }

  if (user?.rol === 'admin' && adminView !== 'estudiante') {
    return (
      <div className="td-wrap">
        <div className="td-role-switch" role="tablist" aria-label="Cambiar vista de panel">
          <button
            type="button"
            className={adminView === 'admin' ? 'is-active' : ''}
            onClick={() => setAdminView('admin')}
          >
            Panel Admin
          </button>
          <button
            type="button"
            className={adminView === 'docente' ? 'is-active' : ''}
            onClick={() => setAdminView('docente')}
          >
            Panel Docente
          </button>
          <button type="button" onClick={() => setAdminView('estudiante')}>
            Vista Estudiante
          </button>
        </div>
        {adminView === 'admin' ? <AdminDashboard /> : <DocenteDashboard />}
      </div>
    );
  }

  const xp = user?.xp ?? 0;
  const pct = Math.round(((xp % 200) / 200) * 100);
  const rachaActual = user?.rachaActual ?? 0;
  const rachaMasLarga = user?.rachaMasLarga ?? 0;
  const comodines = user?.comodinesMes ?? 2;

  async function handleQuickQuestion(e: FormEvent) {
    e.preventDefault();
    if (!token || !quickTemaId || quickQuestion.trim().length < 8) {
      setQuickMsg({ type: 'err', text: 'Escribe una duda de al menos 8 caracteres y elige un tema.' });
      return;
    }
    try {
      assertNoScriptInjection(quickQuestion, 'pregunta');
      setSendingQuick(true);
      await gqlRequest(
        `mutation QuickAsk($idTema: ID!, $texto: String!) {
          crearPregunta(idTema: $idTema, texto: $texto) { _id }
        }`,
        { idTema: quickTemaId, texto: quickQuestion.trim() },
        token,
      );
      setQuickQuestion('');
      setQuickMsg({ type: 'ok', text: 'Tu pregunta se publicó en el foro correctamente.' });
    } catch (err: any) {
      setQuickMsg({ type: 'err', text: err.message || 'No se pudo publicar la pregunta.' });
    } finally {
      setSendingQuick(false);
    }
  }

  async function handleFreezeStreak() {
    if (!token) return;
    try {
      await gqlRequest(`mutation CongelarRacha { congelarMiRacha { _id comodinesMes } }`, {}, token);
      setStreakMsg('¡Racha congelada hasta mañana usando 1 comodín!');
      await refreshUser();
    } catch (err: any) {
      setStreakMsg(err.message || 'No se pudo congelar tu racha.');
    }
  }

  return (
    <div className="dashboard">
      {user?.rol === 'admin' && (
        <div className="td-role-switch" role="tablist" aria-label="Cambiar vista de panel">
          <button type="button" onClick={() => setAdminView('admin')}>
            Panel Admin
          </button>
          <button type="button" onClick={() => setAdminView('docente')}>
            Panel Docente
          </button>
          <button type="button" className="is-active" onClick={() => setAdminView('estudiante')}>
            Vista Estudiante
          </button>
        </div>
      )}

      <section className="hero">
        <span className="chip chip--solid" style={{ alignSelf: 'flex-start' }}>
          {ROLE_LABELS[user?.rol ?? 'estudiante'] ?? 'Estudiante'}
        </span>
        <h1>Hola, {user?.nombre}</h1>
        <p className="muted">Comparte, busca y confía en materiales revisados.</p>
      </section>

      {/* RF-36 & RF-40: XP, Insignias, Retos y Rachas */}
      <section className="stats" aria-label="Tu progreso">
        <div className="stat stat--xp"><span>XP total</span><strong>{xp}</strong></div>
        <div className="stat stat--badges">
          <span>Insignias</span>
          {loadingStats ? <Skeleton width="44px" height="28px" /> : <strong>{badgesCount}</strong>}
        </div>
        <div className="stat stat--retos">
          <span>Retos · Racha</span>
          {loadingStats ? (
            <Skeleton width="84px" height="28px" />
          ) : (
            <strong className="inline-icon-row">
              <span>{retosCount} ·</span>
              <Flame size={20} className="icon-flame" aria-hidden="true" />
              <span>{rachaActual}d</span>
            </strong>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="card__title">Progreso al siguiente nivel · Racha máxima: {rachaMasLarga} día(s)</h2>
            <p className="muted">Comodines disponibles este mes: {comodines}</p>
          </div>
          <span className="chip chip--xp">{pct}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ '--p': `${pct}%` } as CSSProperties} />
        </div>
        <div className="row">
          <Link className="btn btn--primary btn--sm" to="/foro">Ir al foro</Link>
          <Link className="btn btn--ghost btn--sm" to="/perfil">Mi perfil</Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleFreezeStreak} disabled={comodines <= 0}>
            <Snowflake size={14} aria-hidden="true" />
            <span>Congelar racha ({comodines})</span>
          </button>
        </div>
        {streakMsg && <p className="form-ok" role="status">{streakMsg}</p>}
      </section>

      {/* RF-09 (Cuadro de pregunta rápida) + RF-43/RF-45 (Pregunta del día espaciada) */}
      <div className="td-grid-2">
        <form className="card" onSubmit={handleQuickQuestion}>
          <h2 className="card__title">Pregunta rápida a la comunidad</h2>
          <div className="field">
            <label htmlFor="dash-tema">Tema</label>
            <select id="dash-tema" value={quickTemaId} onChange={(e) => setQuickTemaId(e.target.value)}>
              {temas.length === 0 && <option value="">Sin temas aún</option>}
              {temas.map((t) => <option key={t._id} value={t._id}>{t.titulo}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dash-q">¿Qué duda tienes hoy?</label>
            <input
              id="dash-q"
              value={quickQuestion}
              onChange={(e) => setQuickQuestion(e.target.value)}
              placeholder="Ej. ¿Cómo aplico la 3FN en una tabla con llave compuesta?"
            />
          </div>
          {quickMsg && <p className={quickMsg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">{quickMsg.text}</p>}
          <div className="row">
            <button type="submit" className="btn btn--primary btn--sm" disabled={sendingQuick || !quickTemaId}>
              {sendingQuick ? 'Publicando…' : 'Publicar duda'}
            </button>
            <Link className="btn btn--ghost btn--sm" to="/asistente">Preguntar a la IA</Link>
          </div>
        </form>

        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card__title">Pregunta del día · Repaso espaciado</h2>
            {preguntaDia && <span className="chip chip--xp">{preguntaDia.dificultad}</span>}
          </div>
          {loadingStats ? (
            <CardListSkeleton count={1} />
          ) : preguntaDia ? (
            <>
              <span className="chip chip--soft" style={{ alignSelf: 'flex-start' }}>{preguntaDia.tituloTema}</span>
              <p><strong>{preguntaDia.pregunta}</strong></p>
              <p className="muted" style={{ fontSize: '0.84rem' }}>{preguntaDia.motivoPrioridad}</p>
              <div className="row">
                <Link className="btn btn--primary btn--sm" to="/asistente">Practicar con IA</Link>
                <Link className="btn btn--ghost btn--sm" to="/foro">Debatir en foro</Link>
              </div>
            </>
          ) : (
            <p className="empty">Cuando haya temas y materiales autorizados aparecerá tu reto diario aquí.</p>
          )}
        </section>
      </div>

      {/* RF-07 (Tira de materias) + RF-08 (Recursos validados) */}
      <div className="td-grid-2">
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card__title">Mi tira de materias</h2>
            <Link className="btn btn--ghost btn--sm" to="/curricular">Administrar</Link>
          </div>
          {loadingStats ? (
            <RowListSkeleton count={3} />
          ) : mySubjects.length === 0 ? (
            <p className="empty">Aún no has inscrito materias. Visita Curricular para elegirlas.</p>
          ) : (
            <div className="skeleton-stack">
              {mySubjects.map((a) => (
                <div key={a._id} className="td-item">
                  <div className="td-item__head">
                    <strong>{a.nombre}</strong>
                    <span className="chip chip--soft">
                      {enrolledIds.includes(a._id) ? 'Inscrita' : 'Sugerida'}
                    </span>
                  </div>
                  <span className="muted">{a.cuatrimestre || 'Asignatura curricular'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card__title">Materiales validados por docente</h2>
            <Link className="btn btn--ghost btn--sm" to="/recursos">Ver todos</Link>
          </div>
          {loadingStats ? (
            <RowListSkeleton count={3} />
          ) : validatedResources.length === 0 ? (
            <p className="empty">Todavía no hay archivos validados disponibles.</p>
          ) : (
            <div className="skeleton-stack">
              {validatedResources.map((r) => (
                <div key={r._id} className="td-item">
                  <div className="td-item__head">
                    <strong>{r.titulo}</strong>
                    <span className="chip chip--soft">
                      {r.esMaterialOficial ? (
                        <><Sparkles size={12} aria-hidden="true" /> Oficial</>
                      ) : (
                        <><CheckCircle2 size={12} aria-hidden="true" /> Validado</>
                      )}
                    </span>
                  </div>
                  <span className="muted inline-icon-row">
                    <span>{topicMap.get(r.idTema) || 'Tema'} · {r.nombreAutor || 'Autor'} ·</span>
                    <Star size={12} fill="#eab308" color="#eab308" aria-hidden="true" />
                    <span>{r.promedioCalificacion.toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* RF-78/RF-79 (Calendario y Plan de Repaso) + RF-10 (Actividad Reciente) */}
      <div className="td-grid-2">
        <section className="card">
          <h2 className="card__title">Calendario de exámenes y plan de repaso</h2>
          {loadingStats ? (
            <RowListSkeleton count={2} />
          ) : planRepaso.length > 0 ? (
            <div className="skeleton-stack">
              {planRepaso.map((item) => (
                <div key={item.idEvento} className="td-item">
                  <div className="td-item__head">
                    <strong>{item.tituloEvento}</strong>
                    <span className={`chip ${item.prioridad === 'ALTA' ? 'chip--danger' : 'chip--xp'}`}>
                      Prioridad {item.prioridad} · {new Date(item.fechaEvento).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  <p className="muted">{item.recomendacion}</p>
                  {item.conceptosClave.length > 0 && (
                    <div className="td-tags">
                      {item.conceptosClave.map((c, idx) => <span key={idx} className="td-tag">{c}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : eventos.length > 0 ? (
            <div className="skeleton-stack">
              {eventos.map((ev) => (
                <div key={ev._id} className="td-item">
                  <div className="td-item__head">
                    <strong>{ev.titulo}</strong>
                    <span className="chip chip--xp">{ev.tipo} · {new Date(ev.fecha).toLocaleDateString('es-MX')}</span>
                  </div>
                  <span className="muted">{subjectMap.get(ev.idAsignatura) || 'Asignatura'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">No hay exámenes ni entregas próximas registradas por tus docentes.</p>
          )}
        </section>

        <section className="card">
          <h2 className="card__title">Actividad reciente</h2>
          {loadingStats ? (
            <RowListSkeleton count={3} />
          ) : actividad.length === 0 ? (
            <p className="empty">Cuando recibas respuestas o validaciones aparecerán aquí.</p>
          ) : (
            <div className="skeleton-stack">
              {actividad.map((act) => (
                <div key={act._id} className="td-item">
                  <div className="td-item__head">
                    <strong>{act.titulo}</strong>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {new Date(act.createdAt).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  <p className="muted">{act.mensaje}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
    </div>
  );
}
