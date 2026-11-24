import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import ModuleBanner from '../components/ModuleBanner';
import { RowListSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { KolabModule } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const moduleInfo: KolabModule = {
  id: 2,
  path: '/curricular',
  short: 'Curricular',
  name: 'Gestión curricular y carga académica',
  desc: 'Carreras, asignaturas, temas y tus materias inscritas',
  c1: '#0f766e',
  c2: '#14b8a6',
};

interface CarreraItem {
  _id: string;
  nombre: string;
}

interface AsignaturaItem {
  _id: string;
  nombre: string;
  cuatrimestre?: string;
  descripcion?: string;
  idCarrera: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
  descripcion?: string;
  idAsignatura: string;
}

export default function Curricular() {
  const { user, token } = useAuth();
  const [carreras, setCarreras] = useState<CarreraItem[]>([]);
  const [courses, setCourses] = useState<AsignaturaItem[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [topics, setTopics] = useState<TemaItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [showCareerForm, setShowCareerForm] = useState(false);
  const [careerName, setCareerName] = useState('');
  const [name, setName] = useState('');
  const [cuatrimestre, setCuatrimestre] = useState('');
  const [careerId, setCareerId] = useState('');
  const [topic, setTopic] = useState('');
  const [secError, setSecError] = useState('');

  const isAdmin = user?.rol === 'admin';
  const canEditTopics = user?.rol === 'admin' || user?.rol === 'docente';

  const loadAcademic = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSecError('');
    try {
      const data = await gqlRequest<{
        carreras: CarreraItem[];
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
        miPerfil: { asignaturasInscritas: string[] };
      }>(
        `query CurricularData {
          carreras { _id nombre }
          asignaturas { _id nombre cuatrimestre descripcion idCarrera }
          temas { _id titulo descripcion idAsignatura }
          miPerfil { asignaturasInscritas }
        }`,
        {},
        token,
      );
      setCarreras(data.carreras ?? []);
      setCourses(data.asignaturas ?? []);
      setTopics(data.temas ?? []);
      setEnrolledIds(data.miPerfil?.asignaturasInscritas ?? []);
      if (data.carreras?.length && !careerId) {
        setCareerId(data.carreras[0]._id);
      }
      if (data.asignaturas?.length) {
        setSelected((prev) => prev ?? data.asignaturas[0]._id);
      }
    } catch (err: any) {
      setSecError(err.message || 'No se pudo cargar la información curricular.');
    } finally {
      setLoading(false);
    }
  }, [token, careerId]);

  useEffect(() => {
    loadAcademic();
  }, [loadAcademic]);

  const careerNameMap = useMemo(
    () => new Map(carreras.map((c) => [c._id, c.nombre])),
    [carreras],
  );

  const visible = useMemo(
    () =>
      courses.filter((c) => {
        const isEnrolled = enrolledIds.includes(c._id);
        return filter === 'Todas' || (filter === 'Inscritas' ? isEnrolled : !isEnrolled);
      }),
    [courses, enrolledIds, filter],
  );

  const current = courses.find((c) => c._id === selected) || visible[0] || null;
  const currentTopics = useMemo(
    () => (current ? topics.filter((t) => t.idAsignatura === current._id) : []),
    [topics, current],
  );

  async function addCareer(e: FormEvent) {
    e.preventDefault();
    if (!careerName.trim() || !token) return;
    try {
      assertNoScriptInjection(careerName, 'carrera');
      setSecError('');
      const res = await gqlRequest<{ crearCarrera: CarreraItem }>(
        `mutation CrearCarrera($input: CreateCarreraInput!) { crearCarrera(input: $input) { _id nombre } }`,
        { input: { nombre: careerName.trim() } },
        token,
      );
      setCarreras((prev) => [...prev, res.crearCarrera]);
      if (!careerId) setCareerId(res.crearCarrera._id);
      setCareerName('');
      setShowCareerForm(false);
    } catch (err: any) {
      setSecError(err.message || 'No se pudo registrar la carrera.');
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !careerId || !token) return;
    try {
      assertNoScriptInjection({ name, cuatrimestre }, 'asignatura');
      setSecError('');
      const res = await gqlRequest<{ crearAsignatura: AsignaturaItem }>(
        `mutation CrearAsignatura($input: CreateAsignaturaInput!) {
          crearAsignatura(input: $input) { _id nombre cuatrimestre descripcion idCarrera }
        }`,
        {
          input: {
            nombre: name.trim(),
            idCarrera: careerId,
            ...(cuatrimestre.trim() ? { cuatrimestre: cuatrimestre.trim() } : {}),
          },
        },
        token,
      );
      setCourses((prev) => [...prev, res.crearAsignatura]);
      setSelected(res.crearAsignatura._id);
      setName('');
      setCuatrimestre('');
      setShowForm(false);
    } catch (err: any) {
      setSecError(err.message || 'No se pudo registrar la asignatura.');
    }
  }

  async function deleteCourse(id: string) {
    if (!token || !window.confirm('¿Eliminar esta asignatura? (Solo permitido si no tiene temas ni recursos asociados)')) return;
    try {
      setSecError('');
      await gqlRequest(`mutation EliminarAsig($id: ID!) { eliminarAsignatura(id: $id) }`, { id }, token);
      setCourses((prev) => prev.filter((c) => c._id !== id));
    } catch (err: any) {
      setSecError(err.message || 'No se pudo eliminar la asignatura.');
    }
  }

  async function toggleEnroll(id: string) {
    if (!token) return;
    setSecError('');
    try {
      const res = await gqlRequest<{ inscribirAsignatura: { asignaturasInscritas: string[] } }>(
        `mutation InscribirAsignatura($id: ID!) {
          inscribirAsignatura(asignaturaId: $id) { asignaturasInscritas }
        }`,
        { id },
        token,
      );
      setEnrolledIds(res.inscribirAsignatura.asignaturasInscritas ?? []);
    } catch (err: any) {
      setSecError(err.message || 'No se pudo actualizar tu inscripción.');
    }
  }

  async function addTopic(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !current || !token) return;
    try {
      assertNoScriptInjection(topic, 'tema');
      setSecError('');
      const res = await gqlRequest<{ crearTema: TemaItem }>(
        `mutation CrearTema($input: CreateTemaInput!) {
          crearTema(input: $input) { _id titulo descripcion idAsignatura }
        }`,
        { input: { titulo: topic.trim(), idAsignatura: current._id } },
        token,
      );
      setTopics((prev) => [...prev, res.crearTema]);
      setTopic('');
    } catch (err: any) {
      setSecError(err.message || 'No se pudo agregar el tema.');
    }
  }

  return (
    <>
      <ModuleBanner module={moduleInfo} />
      <div className="kolab-module">
        <section className="km-toolbar">
          <div>
            <h2>Mis materias</h2>
            <p className="muted">Consulta tus asignaturas y los temas de cada unidad.</p>
          </div>
          {isAdmin && (
            <div className="row">
              <button className="btn btn--ghost btn--sm" onClick={() => setShowCareerForm((v) => !v)}>
                ＋ Nueva carrera
              </button>
              <button className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
                ＋ Nueva asignatura
              </button>
            </div>
          )}
        </section>

        {secError && <p className="form-error" role="alert">{secError}</p>}

        {showCareerForm && isAdmin && (
          <form className="card km-form" onSubmit={addCareer}>
            <h3>Registrar carrera</h3>
            <div className="km-inline-form">
              <input value={careerName} onChange={(e) => setCareerName(e.target.value)} required placeholder="Ej. Ingeniería en Desarrollo de Software" />
              <button className="btn btn--primary btn--sm">Guardar carrera</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowCareerForm(false)}>Cancelar</button>
            </div>
          </form>
        )}

        {showForm && isAdmin && (
          <form className="card km-form" onSubmit={addCourse}>
            <h3>Registrar asignatura</h3>
            <div className="form-grid">
              <div className="field">
                <label>Nombre de la asignatura</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej. Programación web"
                />
              </div>
              <div className="field">
                <label>Cuatrimestre</label>
                <input
                  value={cuatrimestre}
                  onChange={(e) => setCuatrimestre(e.target.value)}
                  placeholder="Ej. 5° Cuatrimestre"
                />
              </div>
              <div className="field">
                <label>Carrera</label>
                <select value={careerId} onChange={(e) => setCareerId(e.target.value)} required>
                  {carreras.length === 0 && <option value="">Sin carreras registradas</option>}
                  {carreras.map((c) => (
                    <option key={c._id} value={c._id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="km-actions">
              <button className="btn btn--primary" disabled={!careerId}>Guardar asignatura</button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        )}

        <div className="km-tabs">
          {['Todas', 'Inscritas', 'Disponibles'].map((x) => (
            <button key={x} className={`km-tab ${filter === x ? 'active' : ''}`} onClick={() => setFilter(x)}>
              {x}
            </button>
          ))}
        </div>

        <div className="km-grid">
          <section className="km-course-list">
            {loading ? (
              <RowListSkeleton count={4} />
            ) : visible.length === 0 ? (
              <p className="empty">
                {courses.length === 0
                  ? 'Aún no hay asignaturas registradas en la plataforma.'
                  : 'No hay asignaturas en esta categoría.'}
              </p>
            ) : (
              visible.map((c, i) => {
                const enrolled = enrolledIds.includes(c._id);
                return (
                  <article key={c._id} className={`km-course ${current?._id === c._id ? 'selected' : ''}`}>
                    <button className="km-course-main" onClick={() => setSelected(c._id)}>
                      <span className="km-course-icon">{String.fromCharCode(65 + (i % 26))}</span>
                      <span>
                        <strong>{c.nombre}</strong>
                        <small>{c.cuatrimestre || 'Asignatura'} · {careerNameMap.get(c.idCarrera) || 'Carrera'}</small>
                      </span>
                    </button>
                    <div className="km-course-foot">
                      <span className={`chip ${enrolled ? 'chip--soft' : 'chip--xp'}`}>
                        {enrolled ? 'Inscrita' : 'Disponible'}
                      </span>
                      <div className="row">
                        <button className="btn btn--ghost btn--sm" onClick={() => toggleEnroll(c._id)}>
                          {enrolled ? (
                            <><Check size={14} aria-hidden="true" /><span>Inscrita</span></>
                          ) : (
                            'Inscribirme'
                          )}
                        </button>
                        {isAdmin && (
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => deleteCourse(c._id)}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <section className="card km-topics">
            <div>
              <span className="chip chip--soft">Temas y unidades</span>
              <h2>{current?.nombre || 'Selecciona una asignatura'}</h2>
              <p className="muted">{current ? (careerNameMap.get(current.idCarrera) || '') : 'Explora el catálogo académico.'}</p>
            </div>
            {currentTopics.length > 0 ? (
              <ol className="km-topic-list">
                {currentTopics.map((t, i) => (
                  <li key={t._id}><span>{i + 1}</span>{t.titulo}</li>
                ))}
              </ol>
            ) : (
              <p className="empty">Todavía no hay temas registrados para esta asignatura.</p>
            )}
            {canEditTopics && current && (
              <form className="km-inline-form" onSubmit={addTopic}>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Nombre de unidad o tema"
                  required
                />
                <button className="btn btn--primary btn--sm">Agregar tema</button>
              </form>
            )}
            {!canEditTopics && (
              <p className="km-note">La administración curricular está disponible únicamente para Docentes y Administradores.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
