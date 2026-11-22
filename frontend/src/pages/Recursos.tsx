import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ModuleBanner from '../components/ModuleBanner';
import { CardListSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { KolabModule } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const moduleInfo: KolabModule = {
  id: 3,
  path: '/recursos',
  short: 'Recursos',
  name: 'Repositorio de recursos y validación docente',
  desc: 'Comparte, busca y confía en materiales revisados',
  c1: '#4d7c0f',
  c2: '#6aa51a',
};

interface RecursoItem {
  _id: string;
  titulo: string;
  tipoArchivo: string;
  estadoValidacion: 'PENDIENTE' | 'REVISADO_DOCENTE' | 'ARCHIVADO';
  idAsignatura?: string;
  idTema: string;
  createdAt: string;
  promedioCalificacion: number;
}

interface AsignaturaItem {
  _id: string;
  nombre: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
  idAsignatura: string;
}

const typeOf = (file: File) =>
  file.type.includes('pdf')
    ? 'PDF'
    : file.type.startsWith('image/')
      ? 'IMAGEN'
      : file.name.match(/\.(ppt|pptx)$/i)
        ? 'PRESENTACION'
        : file.type.includes('word') || /\.(doc|docx)$/i.test(file.name)
          ? 'DOCUMENTO'
          : 'ARCHIVO';

export default function Recursos() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<RecursoItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('Todas');
  const [topic, setTopic] = useState('Todas');
  const [status, setStatus] = useState('Todos');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTopicId, setFormTopicId] = useState('');

  const isTeacher = ['docente', 'admin'].includes(user?.rol ?? '');

  const loadResources = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await gqlRequest<{
        recursos: RecursoItem[];
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
      }>(
        `query RecursosData {
          recursos {
            _id
            titulo
            tipoArchivo
            estadoValidacion
            idAsignatura
            idTema
            createdAt
            promedioCalificacion
          }
          asignaturas { _id nombre }
          temas { _id titulo idAsignatura }
        }`,
        {},
        token,
      );
      setItems(data.recursos ?? []);
      setAsignaturas(data.asignaturas ?? []);
      setTemas(data.temas ?? []);
      if (data.asignaturas?.length && !formSubjectId) {
        setFormSubjectId(data.asignaturas[0]._id);
      }
      if (data.temas?.length && !formTopicId) {
        setFormTopicId(data.temas[0]._id);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los recursos.');
    } finally {
      setLoading(false);
    }
  }, [token, formSubjectId, formTopicId]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const subjectMap = useMemo(() => new Map(asignaturas.map((a) => [a._id, a.nombre])), [asignaturas]);
  const topicMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);

  const filtered = useMemo(
    () =>
      items.filter((x) => {
        const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) ?? '') : '';
        const topName = topicMap.get(x.idTema) ?? '';
        const reviewed = x.estadoValidacion === 'REVISADO_DOCENTE';
        return (
          (!query || `${x.titulo} ${subName} ${topName}`.toLowerCase().includes(query.toLowerCase())) &&
          (subject === 'Todas' || x.idAsignatura === subject) &&
          (topic === 'Todas' || x.idTema === topic) &&
          (status === 'Todos' || (status === 'Revisados' ? reviewed : !reviewed))
        );
      }),
    [items, query, subject, topic, status, subjectMap, topicMap],
  );

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!file || !formTopicId || !token) return;
    if (/\.(sql|py|js)$/i.test(file.name)) {
      setError('No se permite subir archivos ejecutables (.sql, .py, .js).');
      return;
    }
    try {
      assertNoScriptInjection({ title, fileName: file.name }, 'recurso');
      const res = await gqlRequest<{ subirRecurso: RecursoItem }>(
        `mutation SubirRecurso($input: CreateRecursoInput!) {
          subirRecurso(input: $input) {
            _id titulo tipoArchivo estadoValidacion idAsignatura idTema createdAt promedioCalificacion
          }
        }`,
        {
          input: {
            titulo: title.trim() || file.name,
            tipoArchivo: typeOf(file),
            tamanoBytes: file.size,
            archivoUrl: `https://kolab.local/uploads/${encodeURIComponent(file.name)}`,
            idTema: formTopicId,
            ...(formSubjectId ? { idAsignatura: formSubjectId } : {}),
          },
        },
        token,
      );
      setItems((prev) => [res.subirRecurso, ...prev]);
      setTitle('');
      setFile(null);
      e.currentTarget.reset();
      setMessage('Recurso publicado correctamente. Quedó pendiente de revisión docente.');
    } catch (err: any) {
      setError(err.message || 'No se pudo publicar el recurso.');
    }
  }

  async function review(id: string) {
    if (!token) return;
    setError('');
    try {
      const res = await gqlRequest<{ validarRecurso: RecursoItem }>(
        `mutation ValidarRecurso($id: ID!) {
          validarRecurso(recursoId: $id, estado: REVISADO_DOCENTE) {
            _id estadoValidacion
          }
        }`,
        { id },
        token,
      );
      setItems((prev) =>
        prev.map((x) => (x._id === id ? { ...x, estadoValidacion: res.validarRecurso.estadoValidacion } : x)),
      );
    } catch (err: any) {
      setError(err.message || 'No se pudo validar el recurso.');
    }
  }

  return (
    <>
      <ModuleBanner module={moduleInfo}><span className="chip chip--soft">Módulo 3</span></ModuleBanner>
      <div className="kolab-module">
        <section className="km-toolbar">
          <div>
            <h2>Repositorio de recursos</h2>
            <p className="muted">Materiales compartidos por la comunidad académica.</p>
          </div>
          <span className="chip chip--soft">{items.length} recursos</span>
        </section>

        <section className="card km-upload">
          <div>
            <h2>Compartir un recurso</h2>
            <p className="muted">Sube apuntes y materiales para que otros estudiantes puedan consultarlos.</p>
          </div>
          <form onSubmit={upload}>
            <div className="form-grid">
              <div className="field">
                <label>Nombre del recurso</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Apuntes de unidad 1" />
              </div>
              <div className="field">
                <label>Archivo (PDF, imagen, presentación o documento)</label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.ppt,.pptx,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              <div className="field">
                <label>Asignatura</label>
                <select value={formSubjectId} onChange={(e) => setFormSubjectId(e.target.value)}>
                  {asignaturas.length === 0 && <option value="">Sin asignaturas</option>}
                  {asignaturas.map((a) => (
                    <option key={a._id} value={a._id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Tema</label>
                <select value={formTopicId} onChange={(e) => setFormTopicId(e.target.value)} required>
                  {temas.length === 0 && <option value="">Sin temas registrados</option>}
                  {temas.map((t) => (
                    <option key={t._id} value={t._id}>{t.titulo}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="km-actions">
              <button className="btn btn--primary" disabled={!file || !formTopicId}>＋ Publicar recurso</button>
              {file && <span className="muted">{file.name}</span>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-ok" role="status">{message}</p>}
          </form>
        </section>

        <section className="km-filter-panel">
          <div className="field">
            <label>Buscar</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por recurso, asignatura o tema…" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Asignatura</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="Todas">Todas</option>
                {asignaturas.map((a) => <option key={a._id} value={a._id}>{a.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tema</label>
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="Todas">Todas</option>
                {temas.map((t) => <option key={t._id} value={t._id}>{t.titulo}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Validación</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Todos</option>
                <option>Revisados</option>
                <option>Sin revisar</option>
              </select>
            </div>
          </div>
        </section>

        <section className="km-resource-grid">
          {loading ? (
            <CardListSkeleton count={3} bare />
          ) : filtered.length === 0 ? (
            <div className="card">
              <p className="empty">
                {items.length === 0
                  ? 'Aún no hay recursos publicados en la plataforma. ¡Sé el primero en compartir un apunte!'
                  : 'No se encontraron recursos con esos filtros.'}
              </p>
            </div>
          ) : (
            filtered.map((x) => {
              const reviewed = x.estadoValidacion === 'REVISADO_DOCENTE';
              const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) || 'Asignatura') : 'General';
              const topName = topicMap.get(x.idTema) || 'Tema';
              return (
                <article className="card km-resource" key={x._id}>
                  <div className="km-resource-top">
                    <span className="km-file-icon">{x.tipoArchivo?.slice(0, 3).toUpperCase() || 'DOC'}</span>
                    <span className={`chip ${reviewed ? 'chip--soft' : 'chip--xp'}`}>
                      {reviewed ? '✓ Revisado por docente' : 'Sin revisar'}
                    </span>
                  </div>
                  <h3>{x.titulo}</h3>
                  <p className="muted">{subName} · {topName}</p>
                  <div className="km-resource-bottom">
                    <span className="muted">{new Date(x.createdAt).toLocaleDateString('es-MX')}</span>
                    {isTeacher && !reviewed && (
                      <button className="btn btn--primary btn--sm" onClick={() => review(x._id)}>
                        Validar recurso
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
