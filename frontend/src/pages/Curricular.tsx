import { FormEvent, useMemo, useState } from 'react';
import ModuleBanner from '../components/ModuleBanner';
import { useAuth } from '../context/AuthContext';
import { KolabModule } from '../data/modules';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const initial = [
  { id: 1, carrera: 'Desarrollo de Software Multiplataforma', nombre: 'Bases de datos', clave: 'DSM-204', docente: 'Por asignar', temas: ['Modelo entidad-relación', 'Bases de datos relacionales', 'Consultas SQL'], inscritos: true },
  { id: 2, carrera: 'Desarrollo de Software Multiplataforma', nombre: 'Aplicaciones web', clave: 'DSM-305', docente: 'Por asignar', temas: ['HTML y CSS', 'React', 'Consumo de API'], inscritos: true },
  { id: 3, carrera: 'Desarrollo de Software Multiplataforma', nombre: 'Ciberseguridad', clave: 'DSM-401', docente: 'Por asignar', temas: ['Fundamentos', 'Análisis de vulnerabilidades'], inscritos: false },
];
const moduleInfo: KolabModule = { id: 2, path: '/curricular', short: 'Curricular', name: 'Gestión curricular y carga académica', desc: 'Carreras, asignaturas, temas y tus materias inscritas', c1: '#0f766e', c2: '#14b8a6' };

export default function Curricular() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('kolab.curricular') || 'null') || initial; } catch { return initial; }
  });
  const [selected, setSelected] = useState(courses[0]?.id ?? null);
  const [filter, setFilter] = useState('Todas');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [career, setCareer] = useState('Desarrollo de Software Multiplataforma');
  const [topic, setTopic] = useState('');
  const [secError, setSecError] = useState('');
  const isAdmin = user?.rol === 'admin';
  const visible = useMemo(() => courses.filter(c => filter === 'Todas' || (filter === 'Inscritas' ? c.inscritos : !c.inscritos)), [courses, filter]);
  const current = courses.find(c => c.id === selected) || visible[0];

  function save(next: any[]) {
    setCourses(next);
    localStorage.setItem('kolab.curricular', JSON.stringify(next));
  }

  function addCourse(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      assertNoScriptInjection({ name, career }, 'asignatura');
      setSecError('');
    } catch (err: any) {
      return setSecError(err.message);
    }
    save([...courses, { id: Date.now(), carrera: career, nombre: name.trim(), clave: `KOL-${courses.length + 1}`, docente: 'Por asignar', temas: [], inscritos: false }]);
    setName('');
    setShowForm(false);
  }

  function toggleEnroll(id: number) {
    save(courses.map(c => c.id === id ? { ...c, inscritos: !c.inscritos } : c));
  }

  function addTopic(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !current) return;
    try {
      assertNoScriptInjection(topic, 'tema');
      setSecError('');
    } catch (err: any) {
      return setSecError(err.message);
    }
    save(courses.map(c => c.id === current.id ? { ...c, temas: [...c.temas, topic.trim()] } : c));
    setTopic('');
  }

  return <>
    <ModuleBanner module={moduleInfo}><span className="chip chip--soft">Módulo 2</span></ModuleBanner>
    <div className="kolab-module">
      <section className="km-toolbar">
        <div><h2>Mis materias</h2><p className="muted">Consulta tus asignaturas y los temas de cada unidad.</p></div>
        {isAdmin && <button className="btn btn--primary" onClick={() => setShowForm(v => !v)}>＋ Nueva asignatura</button>}
      </section>
      {secError && <p className="form-error" role="alert">{secError}</p>}
      {showForm && isAdmin && <form className="card km-form" onSubmit={addCourse}>
        <h3>Registrar asignatura</h3>
        <div className="form-grid">
          <div className="field"><label>Nombre de la asignatura</label><input value={name} onChange={e => setName(e.target.value)} required placeholder="Ej. Programación web"/></div>
          <div className="field"><label>Carrera</label><input value={career} onChange={e => setCareer(e.target.value)} required/></div>
        </div>
        <div className="km-actions"><button className="btn btn--primary">Guardar asignatura</button><button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancelar</button></div>
      </form>}
      <div className="km-tabs">{['Todas', 'Inscritas', 'Disponibles'].map(x => <button key={x} className={`km-tab ${filter === x ? 'active' : ''}`} onClick={() => setFilter(x)}>{x}</button>)}</div>
      <div className="km-grid">
        <section className="km-course-list">
          {visible.map((c, i) => <article key={c.id} className={`km-course ${current?.id === c.id ? 'selected' : ''}`}>
            <button className="km-course-main" onClick={() => setSelected(c.id)}><span className="km-course-icon">{String.fromCharCode(65 + i)}</span><span><strong>{c.nombre}</strong><small>{c.clave} · {c.carrera}</small></span></button>
            <div className="km-course-foot"><span className={`chip ${c.inscritos ? 'chip--soft' : 'chip--xp'}`}>{c.inscritos ? 'Inscrita' : 'Disponible'}</span><button className="btn btn--ghost btn--sm" onClick={() => toggleEnroll(c.id)}>{c.inscritos ? 'Desinscribirme' : 'Inscribirme'}</button></div>
          </article>)}
          {!visible.length && <p className="muted">No hay asignaturas en esta categoría.</p>}
        </section>
        <section className="card km-topics">
          <div><span className="chip chip--soft">Temas y unidades</span><h2>{current?.nombre || 'Selecciona una asignatura'}</h2><p className="muted">{current?.carrera}</p></div>
          {current?.temas?.length ? <ol className="km-topic-list">{current.temas.map((t: string, i: number) => <li key={`${t}-${i}`}><span>{i + 1}</span>{t}</li>)}</ol> : <p className="muted">Todavía no hay temas registrados.</p>}
          {isAdmin && current && <form className="km-inline-form" onSubmit={addTopic}><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Nombre de unidad o tema" required/><button className="btn btn--primary btn--sm">Agregar tema</button></form>}
          {!isAdmin && <p className="km-note">La administración curricular está disponible únicamente para el Administrador.</p>}
        </section>
      </div>
      {isAdmin && <section className="card km-admin-note"><h3>Administración curricular</h3><p className="muted">Como administrador puedes registrar asignaturas y organizar sus temas. La gestión de carreras e inscripciones institucionales se conectará posteriormente con el backend.</p></section>}
    </div>
  </>;
}
