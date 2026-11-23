import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, GraduationCap, Layers, Pencil, Trash2, X } from 'lucide-react';
import ModuleBanner from '../components/ModuleBanner';
import { RowListSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { KolabModule } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';

function parseSemesterNumber(raw?: string): number {
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const match = raw.match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER - 1;
}

function normalizeSemesterKey(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return 'Sin semestre asignado';
  if (/^\d+$/.test(trimmed)) return `${trimmed}° Semestre`;
  return trimmed;
}

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
  const [topicsModalOpen, setTopicsModalOpen] = useState(false);
  const [selectedCareerId, setSelectedCareerId] = useState<string>('TODAS');
  const [selectedSemester, setSelectedSemester] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSemesters, setCollapsedSemesters] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [showCareerForm, setShowCareerForm] = useState(false);
  const [careerName, setCareerName] = useState('');
  const [name, setName] = useState('');
  const [cuatrimestre, setCuatrimestre] = useState('');
  const [careerId, setCareerId] = useState('');
  const [topic, setTopic] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editingCareer, setEditingCareer] = useState<{ id: string; nombre: string } | null>(null);
  const [editingCourse, setEditingCourse] = useState<{
    id: string;
    nombre: string;
    cuatrimestre: string;
    idCarrera: string;
    descripcion: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'career' | 'course';
    id: string;
    name: string;
  } | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const isAdmin = user?.rol === 'admin';
  const canEditTopics = user?.rol === 'admin' || user?.rol === 'docente';

  const loadAcademic = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFeedback(null);
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
      setFeedback({ type: 'err', text: err.message || 'No se pudo cargar la información curricular.' });
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

  const careerCourseCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of courses) {
      map.set(c.idCarrera, (map.get(c.idCarrera) ?? 0) + 1);
    }
    return map;
  }, [courses]);

  const topicCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of topics) {
      map.set(t.idAsignatura, (map.get(t.idAsignatura) ?? 0) + 1);
    }
    return map;
  }, [topics]);

  const coursesInCareer = useMemo(
    () =>
      selectedCareerId === 'TODAS'
        ? courses
        : courses.filter((c) => c.idCarrera === selectedCareerId),
    [courses, selectedCareerId],
  );

  const availableSemesters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of coursesInCareer) {
      const key = normalizeSemesterKey(c.cuatrimestre);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => parseSemesterNumber(a.label) - parseSemesterNumber(b.label) || a.label.localeCompare(b.label));
  }, [coursesInCareer]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return coursesInCareer.filter((c) => {
      const isEnrolled = enrolledIds.includes(c._id);
      if (filter === 'Inscritas' && !isEnrolled) return false;
      if (filter === 'Disponibles' && isEnrolled) return false;
      if (selectedSemester !== 'TODOS' && normalizeSemesterKey(c.cuatrimestre) !== selectedSemester) {
        return false;
      }
      if (q && !c.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [coursesInCareer, enrolledIds, filter, selectedSemester, searchQuery]);

  const groupedBySemester = useMemo(() => {
    const groups = new Map<string, AsignaturaItem[]>();
    for (const course of visible) {
      const key = normalizeSemesterKey(course.cuatrimestre);
      const list = groups.get(key) ?? [];
      list.push(course);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(
      ([a], [b]) => parseSemesterNumber(a) - parseSemesterNumber(b) || a.localeCompare(b),
    );
  }, [visible]);

  const toggleSemesterCollapse = (key: string) => {
    setCollapsedSemesters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectCareer = (id: string) => {
    setSelectedCareerId(id);
    setSelectedSemester('TODOS');
    if (id !== 'TODAS') {
      setCareerId(id);
    }
  };

  const current = courses.find((c) => c._id === selected) || visible[0] || null;
  const currentTopics = useMemo(
    () => (current ? topics.filter((t) => t.idAsignatura === current._id) : []),
    [topics, current],
  );

  async function addCareer(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!careerName.trim()) {
      setFeedback({ type: 'err', text: 'Escribe el nombre de la carrera antes de guardar.' });
      return;
    }
    try {
      assertNoScriptInjection(careerName, 'carrera');
      setFeedback(null);
      const res = await gqlRequest<{ crearCarrera: CarreraItem }>(
        `mutation CrearCarrera($input: CreateCarreraInput!) { crearCarrera(input: $input) { _id nombre } }`,
        { input: { nombre: careerName.trim() } },
        token,
      );
      setCarreras((prev) => [...prev, res.crearCarrera]);
      setCareerId(res.crearCarrera._id);
      setSelectedCareerId(res.crearCarrera._id);
      setSelectedSemester('TODOS');
      setCareerName('');
      setShowCareerForm(false);
      setFeedback({ type: 'ok', text: `Carrera «${res.crearCarrera.nombre}» registrada correctamente.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo registrar la carrera.' });
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!name.trim() || !careerId) {
      setFeedback({ type: 'err', text: 'Completa el nombre de la asignatura y selecciona una carrera.' });
      return;
    }
    try {
      assertNoScriptInjection({ name, cuatrimestre }, 'asignatura');
      setFeedback(null);
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
      setFeedback({ type: 'ok', text: `Asignatura «${res.crearAsignatura.nombre}» registrada correctamente.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo registrar la asignatura.' });
    }
  }

  async function saveCareerEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editingCareer) return;
    if (!editingCareer.nombre.trim()) {
      setFeedback({ type: 'err', text: 'El nombre de la carrera no puede estar vacío.' });
      return;
    }
    try {
      assertNoScriptInjection(editingCareer.nombre, 'carrera');
      setFeedback(null);
      const res = await gqlRequest<{ actualizarCarrera: CarreraItem }>(
        `mutation ActualizarCarrera($id: ID!, $input: UpdateCarreraInput!) {
          actualizarCarrera(id: $id, input: $input) { _id nombre }
        }`,
        { id: editingCareer.id, input: { nombre: editingCareer.nombre.trim() } },
        token,
      );
      setCarreras((prev) =>
        prev.map((c) => (c._id === res.actualizarCarrera._id ? res.actualizarCarrera : c)),
      );
      setEditingCareer(null);
      setFeedback({ type: 'ok', text: `Carrera «${res.actualizarCarrera.nombre}» actualizada correctamente.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo actualizar la carrera.' });
    }
  }

  async function saveCourseEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editingCourse) return;
    if (!editingCourse.nombre.trim() || !editingCourse.idCarrera) {
      setFeedback({ type: 'err', text: 'Completa el nombre de la asignatura y selecciona una carrera.' });
      return;
    }
    try {
      assertNoScriptInjection(
        {
          nombre: editingCourse.nombre,
          cuatrimestre: editingCourse.cuatrimestre,
          descripcion: editingCourse.descripcion,
        },
        'asignatura',
      );
      setFeedback(null);
      const res = await gqlRequest<{ actualizarAsignatura: AsignaturaItem }>(
        `mutation ActualizarAsignatura($id: ID!, $input: UpdateAsignaturaInput!) {
          actualizarAsignatura(id: $id, input: $input) {
            _id nombre cuatrimestre descripcion idCarrera
          }
        }`,
        {
          id: editingCourse.id,
          input: {
            nombre: editingCourse.nombre.trim(),
            cuatrimestre: editingCourse.cuatrimestre.trim(),
            idCarrera: editingCourse.idCarrera,
            descripcion: editingCourse.descripcion.trim(),
          },
        },
        token,
      );
      setCourses((prev) =>
        prev.map((c) => (c._id === res.actualizarAsignatura._id ? res.actualizarAsignatura : c)),
      );
      setEditingCourse(null);
      setFeedback({
        type: 'ok',
        text: `Asignatura «${res.actualizarAsignatura.nombre}» actualizada correctamente.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo actualizar la asignatura.' });
    }
  }

  async function confirmAndDelete() {
    if (!token || !confirmDelete) return;
    setBusyDelete(true);
    setFeedback(null);
    try {
      if (confirmDelete.kind === 'career') {
        await gqlRequest(
          `mutation EliminarCarrera($id: ID!) { eliminarCarrera(id: $id) }`,
          { id: confirmDelete.id },
          token,
        );
        setCarreras((prev) => prev.filter((c) => c._id !== confirmDelete.id));
        if (selectedCareerId === confirmDelete.id) {
          setSelectedCareerId('TODAS');
          setSelectedSemester('TODOS');
        }
        if (careerId === confirmDelete.id) {
          setCareerId('');
        }
        setFeedback({ type: 'ok', text: `Carrera «${confirmDelete.name}» eliminada correctamente.` });
      } else {
        await gqlRequest(
          `mutation EliminarAsig($id: ID!) { eliminarAsignatura(id: $id) }`,
          { id: confirmDelete.id },
          token,
        );
        setCourses((prev) => prev.filter((c) => c._id !== confirmDelete.id));
        setSelected((prev) => (prev === confirmDelete.id ? null : prev));
        setFeedback({ type: 'ok', text: `Asignatura «${confirmDelete.name}» eliminada correctamente.` });
      }
      setConfirmDelete(null);
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text:
          err.message ||
          (confirmDelete.kind === 'career'
            ? 'No se pudo eliminar la carrera.'
            : 'No se pudo eliminar la asignatura.'),
      });
      setConfirmDelete(null);
    } finally {
      setBusyDelete(false);
    }
  }

  async function toggleEnroll(id: string) {
    if (!token) return;
    const wasEnrolled = enrolledIds.includes(id);
    const courseName = courses.find((c) => c._id === id)?.nombre;
    setFeedback(null);
    try {
      const res = await gqlRequest<{ inscribirAsignatura: { asignaturasInscritas: string[] } }>(
        `mutation InscribirAsignatura($id: ID!) {
          inscribirAsignatura(asignaturaId: $id) { asignaturasInscritas }
        }`,
        { id },
        token,
      );
      setEnrolledIds(res.inscribirAsignatura.asignaturasInscritas ?? []);
      setFeedback({
        type: 'ok',
        text: wasEnrolled
          ? `Se actualizó tu inscripción en «${courseName || 'la asignatura'}».`
          : `Te inscribiste correctamente a «${courseName || 'la asignatura'}».`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo actualizar tu inscripción.' });
    }
  }

  async function addTopic(e: FormEvent) {
    e.preventDefault();
    if (!current || !token) return;
    if (!topic.trim()) {
      setFeedback({ type: 'err', text: 'Escribe el nombre del tema o unidad.' });
      return;
    }
    try {
      assertNoScriptInjection(topic, 'tema');
      setFeedback(null);
      const res = await gqlRequest<{ crearTema: TemaItem }>(
        `mutation CrearTema($input: CreateTemaInput!) {
          crearTema(input: $input) { _id titulo descripcion idAsignatura }
        }`,
        { input: { titulo: topic.trim(), idAsignatura: current._id } },
        token,
      );
      setTopics((prev) => [...prev, res.crearTema]);
      setTopic('');
      setFeedback({ type: 'ok', text: `Tema «${res.crearTema.titulo}» agregado correctamente.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'No se pudo agregar el tema.' });
    }
  }

  return (
    <>
      <ModuleBanner module={moduleInfo}><span className="chip chip--soft">Módulo 2</span></ModuleBanner>
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

        {feedback && (
          <p
            className={feedback.type === 'ok' ? 'form-ok' : 'form-error'}
            role={feedback.type === 'ok' ? 'status' : 'alert'}
          >
            {feedback.text}
          </p>
        )}

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
                <label>Semestre / Cuatrimestre</label>
                <input
                  value={cuatrimestre}
                  onChange={(e) => setCuatrimestre(e.target.value)}
                  placeholder="Ej. 1° Semestre o 5° Cuatrimestre"
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

        {/* Selector interactivo de Carreras */}
        <section className="km-career-bar" aria-label="Filtrar por carrera">
          <span className="km-career-bar__label">
            <GraduationCap size={15} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} aria-hidden="true" />
            Carreras:
          </span>
          <button
            type="button"
            className={`km-tab ${selectedCareerId === 'TODAS' ? 'active' : ''}`}
            onClick={() => handleSelectCareer('TODAS')}
          >
            Todas ({courses.length})
          </button>
          {carreras.map((car) => (
            <button
              key={car._id}
              type="button"
              className={`km-tab ${selectedCareerId === car._id ? 'active' : ''}`}
              onClick={() => handleSelectCareer(car._id)}
            >
              {car.nombre} ({careerCourseCountMap.get(car._id) ?? 0})
            </button>
          ))}
          {isAdmin && selectedCareerId !== 'TODAS' && (
            <div className="row" style={{ marginLeft: 'auto', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  setEditingCareer({
                    id: selectedCareerId,
                    nombre: careerNameMap.get(selectedCareerId) ?? '',
                  })
                }
              >
                <Pencil size={14} aria-hidden="true" />
                <span>Editar carrera</span>
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() =>
                  setConfirmDelete({
                    kind: 'career',
                    id: selectedCareerId,
                    name: careerNameMap.get(selectedCareerId) ?? 'esta carrera',
                  })
                }
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Eliminar carrera</span>
              </button>
            </div>
          )}
        </section>

        {editingCareer && isAdmin && (
          <form className="card km-form" onSubmit={saveCareerEdit}>
            <h3>Editar carrera</h3>
            <div className="km-inline-form">
              <input
                value={editingCareer.nombre}
                onChange={(e) => setEditingCareer({ ...editingCareer, nombre: e.target.value })}
                required
                placeholder="Nombre de la carrera"
              />
              <button className="btn btn--primary btn--sm" type="submit">Guardar cambios</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingCareer(null)}>Cancelar</button>
            </div>
          </form>
        )}

        {editingCourse && isAdmin && (
          <form className="card km-form" onSubmit={saveCourseEdit}>
            <h3>Editar asignatura</h3>
            <div className="form-grid">
              <div className="field">
                <label>Nombre de la asignatura</label>
                <input
                  value={editingCourse.nombre}
                  onChange={(e) => setEditingCourse({ ...editingCourse, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Semestre / Cuatrimestre</label>
                <input
                  value={editingCourse.cuatrimestre}
                  onChange={(e) => setEditingCourse({ ...editingCourse, cuatrimestre: e.target.value })}
                  placeholder="Ej. 1° Semestre"
                />
              </div>
              <div className="field">
                <label>Carrera</label>
                <select
                  value={editingCourse.idCarrera}
                  onChange={(e) => setEditingCourse({ ...editingCourse, idCarrera: e.target.value })}
                  required
                >
                  {carreras.map((c) => (
                    <option key={c._id} value={c._id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Descripción (opcional)</label>
                <input
                  value={editingCourse.descripcion}
                  onChange={(e) => setEditingCourse({ ...editingCourse, descripcion: e.target.value })}
                  placeholder="Breve descripción"
                />
              </div>
            </div>
            <div className="km-actions">
              <button className="btn btn--primary" type="submit">Guardar cambios</button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditingCourse(null)}>Cancelar</button>
            </div>
          </form>
        )}

        {/* Barra de estado, semestre desplegable y búsqueda */}
        <div className="km-filter-bar">
          <div className="km-tabs">
            {['Todas', 'Inscritas', 'Disponibles'].map((x) => (
              <button
                key={x}
                type="button"
                className={`km-tab ${filter === x ? 'active' : ''}`}
                onClick={() => setFilter(x)}
              >
                {x}
              </button>
            ))}
          </div>

          <div className="km-filter-controls">
            <select
              className="km-select"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              aria-label="Filtrar por semestre"
              disabled={availableSemesters.length === 0}
            >
              <option value="TODOS">
                Todos los semestres ({coursesInCareer.length})
              </option>
              {availableSemesters.map((sem) => (
                <option key={sem.label} value={sem.label}>
                  {sem.label} ({sem.count})
                </option>
              ))}
            </select>

            <input
              type="search"
              className="km-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar asignatura…"
              aria-label="Buscar asignatura"
            />
          </div>
        </div>

        <div className="km-grid">
          <section className="km-catalog">
            {loading ? (
              <RowListSkeleton count={4} />
            ) : groupedBySemester.length === 0 ? (
              <div className="empty">
                <p>
                  {courses.length === 0
                    ? 'Aún no hay asignaturas registradas en la plataforma.'
                    : selectedCareerId !== 'TODAS' && coursesInCareer.length === 0
                      ? `La carrera «${careerNameMap.get(selectedCareerId) ?? ''}» aún no tiene asignaturas registradas.`
                      : 'No hay asignaturas con los filtros seleccionados.'}
                </p>
                {isAdmin && selectedCareerId !== 'TODAS' && coursesInCareer.length === 0 && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    style={{ marginTop: '0.75rem' }}
                    onClick={() => {
                      setCareerId(selectedCareerId);
                      setShowForm(true);
                    }}
                  >
                    ＋ Agregar asignatura a esta carrera
                  </button>
                )}
              </div>
            ) : (
              groupedBySemester.map(([semesterLabel, semesterCourses]) => {
                const isCollapsed = Boolean(collapsedSemesters[semesterLabel]);
                return (
                  <div key={semesterLabel} className="km-semester-group">
                    <button
                      type="button"
                      className="km-semester-head"
                      onClick={() => toggleSemesterCollapse(semesterLabel)}
                      aria-expanded={!isCollapsed}
                    >
                      <span className="km-semester-head__left">
                        {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                        <Layers size={16} aria-hidden="true" />
                        <span>{semesterLabel}</span>
                      </span>
                      <span className="chip chip--soft">
                        {semesterCourses.length} {semesterCourses.length === 1 ? 'asignatura' : 'asignaturas'}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="km-course-list">
                        {semesterCourses.map((c, i) => {
                          const enrolled = enrolledIds.includes(c._id);
                          const topicCount = topicCountMap.get(c._id) ?? 0;
                          return (
                            <article key={c._id} className={`km-course ${current?._id === c._id && topicsModalOpen ? 'selected' : ''}`}>
                              <button
                                type="button"
                                className="km-course-main"
                                onClick={() => {
                                  setSelected(c._id);
                                  setTopicsModalOpen(true);
                                }}
                              >
                                <span className="km-course-icon">{String.fromCharCode(65 + (i % 26))}</span>
                                <span>
                                  <strong>{c.nombre}</strong>
                                  <small>
                                    {careerNameMap.get(c.idCarrera) || 'Carrera'} ·{' '}
                                    <BookOpen size={12} style={{ verticalAlign: 'middle' }} aria-hidden="true" /> {topicCount}{' '}
                                    {topicCount === 1 ? 'tema' : 'temas'}
                                  </small>
                                </span>
                              </button>
                              <div className="km-course-foot">
                                <span className={`chip ${enrolled ? 'chip--soft' : 'chip--xp'}`}>
                                  {enrolled ? 'Inscrita' : 'Disponible'}
                                </span>
                                <div className="row">
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    onClick={() => {
                                      setSelected(c._id);
                                      setTopicsModalOpen(true);
                                    }}
                                  >
                                    <BookOpen size={14} aria-hidden="true" />
                                    <span>Temas ({topicCount})</span>
                                  </button>
                                  <button className="btn btn--ghost btn--sm" onClick={() => toggleEnroll(c._id)}>
                                    {enrolled ? (
                                      <><Check size={14} aria-hidden="true" /><span>Inscrita</span></>
                                    ) : (
                                      'Inscribirme'
                                    )}
                                  </button>
                                  {isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn--ghost btn--sm"
                                        onClick={() =>
                                          setEditingCourse({
                                            id: c._id,
                                            nombre: c.nombre,
                                            cuatrimestre: c.cuatrimestre ?? '',
                                            idCarrera: c.idCarrera,
                                            descripcion: c.descripcion ?? '',
                                          })
                                        }
                                      >
                                        <Pencil size={14} aria-hidden="true" />
                                        <span>Editar</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn--danger btn--sm"
                                        onClick={() =>
                                          setConfirmDelete({
                                            kind: 'course',
                                            id: c._id,
                                            name: c.nombre,
                                          })
                                        }
                                      >
                                        <Trash2 size={14} aria-hidden="true" />
                                        <span>Eliminar</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>

      {topicsModalOpen && current && (
        <div
          className="crop-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="topics-modal-title"
          onClick={() => setTopicsModalOpen(false)}
        >
          <section
            className="card"
            style={{ width: 'min(540px, 100%)', maxHeight: '85dvh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="chip chip--soft">Temas y unidades</span>
                <h2 id="topics-modal-title" style={{ marginTop: '0.4rem' }}>{current.nombre}</h2>
                <p className="muted">
                  {careerNameMap.get(current.idCarrera) || 'Carrera'}
                  {current.cuatrimestre ? ` · ${normalizeSemesterKey(current.cuatrimestre)}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setTopicsModalOpen(false)}
                aria-label="Cerrar temas"
              >
                <X size={16} aria-hidden="true" />
                <span>Cerrar</span>
              </button>
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

            {canEditTopics ? (
              <form className="km-inline-form" onSubmit={addTopic}>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Nombre de unidad o tema"
                  required
                />
                <button className="btn btn--primary btn--sm" type="submit">Agregar tema</button>
              </form>
            ) : (
              <p className="km-note">La administración curricular está disponible únicamente para Docentes y Administradores.</p>
            )}
          </section>
        </div>
      )}

      {confirmDelete && (
        <div
          className="crop-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div className="card" style={{ width: 'min(440px, 100%)' }}>
            <h2 id="confirm-delete-title" className="card__title">
              ¿Estás seguro de eliminar {confirmDelete.kind === 'career' ? 'esta carrera' : 'esta asignatura'}?
            </h2>
            <p className="muted">
              Vas a eliminar <strong>{confirmDelete.name}</strong>.{' '}
              {confirmDelete.kind === 'career'
                ? 'Solo se permite si no tiene asignaturas asociadas.'
                : 'Solo se permite si no tiene temas ni recursos asociados.'}
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busyDelete}
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                disabled={busyDelete}
                onClick={confirmAndDelete}
              >
                {busyDelete ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
