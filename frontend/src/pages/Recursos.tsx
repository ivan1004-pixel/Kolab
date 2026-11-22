import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ModuleBanner from '../components/ModuleBanner';
import { CardListSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { KolabModule } from '../data/modules';
import { USE_MOCK, gqlRequest, uploadResourceFile } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';

const moduleInfo: KolabModule = {
  id: 3,
  path: '/recursos',
  short: 'Recursos',
  name: 'Repositorio de recursos y validación docente',
  desc: 'Comparte, busca y confía en materiales revisados',
  c1: '#4d7c0f',
  c2: '#6aa51a',
};

interface VersionItem {
  version: number;
  archivoUrl: string;
  notaCambio?: string;
  fecha: string;
}

interface ComentarioItem {
  idUsuario: string;
  texto: string;
  fecha: string;
}

interface RecursoItem {
  _id: string;
  titulo: string;
  descripcion?: string;
  archivoUrl: string;
  tipoArchivo: string;
  tamanoBytes: number;
  estadoValidacion: 'PENDIENTE' | 'REVISADO_DOCENTE' | 'ARCHIVADO';
  retroalimentacionDocente?: string;
  esMaterialOficial: boolean;
  idUsuario: string;
  nombreAutor?: string;
  coautores: string[];
  palabrasClave: string[];
  idAsignatura?: string;
  idTema: string;
  promedioCalificacion: number;
  totalCalificaciones: number;
  consultasCount: number;
  versiones: VersionItem[];
  comentarios: ComentarioItem[];
  eliminadoEn?: string;
  createdAt: string;
}

interface ColeccionItem {
  _id: string;
  nombre: string;
  recursos: string[];
  esFavoritos: boolean;
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

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (RF-92 / RNF-14)
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function detectAllowedFileType(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return ext === 'jpg' ? 'jpeg' : ext;
  }
  return null;
}

export default function Recursos() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<RecursoItem[]>([]);
  const [colecciones, setColecciones] = useState<ColeccionItem[]>([]);
  const [papelera, setPapelera] = useState<RecursoItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros combinados (RF-14, RF-64, RF-85..88)
  const [query, setQuery] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [subject, setSubject] = useState('Todas');
  const [topic, setTopic] = useState('Todas');
  const [status, setStatus] = useState('Todos');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<'RECIENTES' | 'MEJOR_CALIFICADOS' | 'MAS_CONSULTADOS'>('RECIENTES');
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [showTrash, setShowTrash] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Formulario de subida (RF-11, RF-22, RF-83, RF-84, RF-92)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [esOficial, setEsOficial] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTopicId, setFormTopicId] = useState('');

  // Detalle expandido (comentarios RF-69, versiones RF-13, coautores RF-65, relacionados RF-63)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [relatedMap, setRelatedMap] = useState<Record<string, RecursoItem[]>>({});
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const [versionNoteById, setVersionNoteById] = useState<Record<string, string>>({});
  const [coauthorById, setCoauthorById] = useState<Record<string, string>>({});
  const [collectionName, setCollectionName] = useState('');

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
        misColecciones: ColeccionItem[];
        miPapelera: RecursoItem[];
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
      }>(
        `query RecursosFullData {
          recursos {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion
            retroalimentacionDocente esMaterialOficial idUsuario nombreAutor coautores
            palabrasClave idAsignatura idTema promedioCalificacion totalCalificaciones
            consultasCount createdAt
            versiones { version archivoUrl notaCambio fecha }
            comentarios { idUsuario texto fecha }
          }
          misColecciones { _id nombre recursos esFavoritos }
          miPapelera { _id titulo tipoArchivo eliminadoEn idTema idAsignatura createdAt }
          asignaturas { _id nombre }
          temas { _id titulo idAsignatura }
        }`,
        {},
        token,
      );
      setItems(data.recursos ?? []);
      setColecciones(data.misColecciones ?? []);
      setPapelera(data.miPapelera ?? []);
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

  const activeCollectionIds = useMemo(() => {
    if (!selectedCollectionId) return null;
    const col = colecciones.find((c) => c._id === selectedCollectionId);
    return col ? new Set(col.recursos) : null;
  }, [colecciones, selectedCollectionId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kw = keywordFilter.trim().toLowerCase();
    const aut = authorFilter.trim().toLowerCase();

    const list = items.filter((x) => {
      const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) ?? '') : '';
      const topName = topicMap.get(x.idTema) ?? '';
      const reviewed = x.estadoValidacion === 'REVISADO_DOCENTE';
      const authorStr = (x.nombreAutor ?? '').toLowerCase();
      const kwJoined = (x.palabrasClave ?? []).join(' ').toLowerCase();
      const haystack = `${x.titulo} ${x.descripcion ?? ''} ${kwJoined} ${authorStr} ${subName} ${topName}`.toLowerCase();

      return (
        (!q || haystack.includes(q)) &&
        (!kw || kwJoined.includes(kw)) &&
        (!aut || authorStr.includes(aut)) &&
        (subject === 'Todas' || x.idAsignatura === subject) &&
        (topic === 'Todas' || x.idTema === topic) &&
        (status === 'Todos' || (status === 'Revisados' ? reviewed : !reviewed)) &&
        x.promedioCalificacion >= minRating &&
        (!activeCollectionIds || activeCollectionIds.has(x._id))
      );
    });

    if (sortBy === 'MEJOR_CALIFICADOS') {
      return [...list].sort((a, b) => b.promedioCalificacion - a.promedioCalificacion || b.totalCalificaciones - a.totalCalificaciones);
    }
    if (sortBy === 'MAS_CONSULTADOS') {
      return [...list].sort((a, b) => b.consultasCount - a.consultasCount);
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, query, keywordFilter, authorFilter, subject, topic, status, minRating, sortBy, activeCollectionIds, subjectMap, topicMap]);

  function clearFilters() {
    setQuery('');
    setKeywordFilter('');
    setAuthorFilter('');
    setSubject('Todas');
    setTopic('Todas');
    setStatus('Todos');
    setMinRating(0);
    setSortBy('RECIENTES');
    setSelectedCollectionId('');
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!file || !formTopicId || !token) return;

    // RF-92 / RNF-14: Validar tamaño <= 10 MB y formato sin perder datos del formulario
    if (/\.(sql|py|js)$/i.test(file.name)) {
      setError('No se permite subir archivos ejecutables (.sql, .py, .js). Tus datos del formulario se conservan.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`El archivo supera el límite máximo de 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB). Tus datos del formulario se conservan.`);
      return;
    }
    const validType = detectAllowedFileType(file);
    if (!validType) {
      setError('Formato no permitido (RNF-14). Solo se aceptan archivos PDF e imágenes (PNG, JPG, WEBP). Tus datos del formulario se conservan.');
      return;
    }

    try {
      assertNoScriptInjection({ title, description, keywords, fileName: file.name }, 'recurso');
      const palabrasClave = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const uploaded = await uploadResourceFile(file, token);
      const res = await gqlRequest<{ subirRecurso: RecursoItem }>(
        `mutation SubirRecurso($input: CreateRecursoInput!) {
          subirRecurso(input: $input) {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion
            esMaterialOficial idUsuario nombreAutor coautores palabrasClave
            idAsignatura idTema promedioCalificacion totalCalificaciones consultasCount createdAt
            versiones { version archivoUrl notaCambio fecha }
            comentarios { idUsuario texto fecha }
          }
        }`,
        {
          input: {
            titulo: title.trim() || file.name,
            descripcion: description.trim() || undefined,
            tipoArchivo: uploaded.tipoArchivo || validType,
            tamanoBytes: uploaded.tamanoBytes || file.size,
            archivoUrl: uploaded.url,
            idTema: formTopicId,
            ...(formSubjectId ? { idAsignatura: formSubjectId } : {}),
            palabrasClave,
            ...(isTeacher && esOficial ? { esMaterialOficial: true } : {}),
          },
        },
        token,
      );
      setItems((prev) => [res.subirRecurso, ...prev]);
      setTitle('');
      setDescription('');
      setKeywords('');
      setEsOficial(false);
      setFile(null);
      e.currentTarget.reset();
      setMessage(
        res.subirRecurso.esMaterialOficial
          ? 'Material oficial publicado y validado automáticamente.'
          : 'Recurso publicado correctamente. Se notificó a los docentes para su validación.',
      );
    } catch (err: any) {
      setError(err.message || 'No se pudo publicar el recurso.');
    }
  }

  async function review(id: string, estado: 'REVISADO_DOCENTE' | 'ARCHIVADO') {
    if (!token) return;
    setError('');
    const retro = window.prompt(
      estado === 'ARCHIVADO'
        ? 'Motivo del archivo (error grave o plagio):'
        : 'Retroalimentación docente opcional para el estudiante:',
      '',
    );
    if (retro === null) return;
    try {
      if (retro.trim()) assertNoScriptInjection(retro, 'retroalimentación');
      await gqlRequest(
        `mutation ValidarRecurso($id: ID!, $estado: EstadoValidacionRecurso!, $retro: String) {
          validarRecurso(recursoId: $id, estado: $estado, retroalimentacion: $retro) {
            _id estadoValidacion retroalimentacionDocente
          }
        }`,
        { id, estado, ...(retro.trim() ? { retro: retro.trim() } : {}) },
        token,
      );
      setMessage(estado === 'ARCHIVADO' ? 'Recurso archivado.' : 'Recurso validado por docente.');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar el recurso.');
    }
  }

  async function handleRate(recursoId: string, estrellas: number) {
    if (!token) return;
    setError('');
    try {
      const res = await gqlRequest<{ calificarRecurso: { promedioCalificacion: number; totalCalificaciones: number } }>(
        `mutation Calificar($id: ID!, $estrellas: Int!) {
          calificarRecurso(recursoId: $id, estrellas: $estrellas) { promedioCalificacion totalCalificaciones }
        }`,
        { id: recursoId, estrellas },
        token,
      );
      setItems((prev) =>
        prev.map((x) =>
          x._id === recursoId
            ? {
                ...x,
                promedioCalificacion: res.calificarRecurso.promedioCalificacion,
                totalCalificaciones: res.calificarRecurso.totalCalificaciones,
              }
            : x,
        ),
      );
      setMessage(`Calificación de ${estrellas} ★ registrada.`);
    } catch (err: any) {
      setError(err.message || 'No se pudo calificar el recurso.');
    }
  }

  async function handleSaveCollection(recursoId: string, nombre: string, esFavoritos: boolean) {
    if (!token || !nombre.trim()) return;
    try {
      assertNoScriptInjection(nombre, 'colección');
      await gqlRequest(
        `mutation GuardarCol($id: ID!, $nombre: String!, $fav: Boolean!) {
          guardarRecursoEnColeccion(recursoId: $id, nombreColeccion: $nombre, esFavoritos: $fav) { _id nombre recursos esFavoritos }
        }`,
        { id: recursoId, nombre: nombre.trim(), fav: esFavoritos },
        token,
      );
      setMessage(`Recurso guardado en "${nombre.trim()}".`);
      setCollectionName('');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar en la colección.');
    }
  }

  async function toggleExpand(recurso: RecursoItem) {
    if (expandedId === recurso._id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(recurso._id);
    if (!token) return;
    try {
      const [relRes] = await Promise.all([
        gqlRequest<{ recursosRelacionados: RecursoItem[] }>(
          `query Rel($id: ID!) { recursosRelacionados(recursoId: $id) { _id titulo tipoArchivo promedioCalificacion idTema } }`,
          { id: recurso._id },
          token,
        ).catch(() => ({ recursosRelacionados: [] })),
        gqlRequest(`query VerRec($id: ID!) { recurso(id: $id) { _id consultasCount } }`, { id: recurso._id }, token).catch(() => null),
      ]);
      setRelatedMap((prev) => ({ ...prev, [recurso._id]: relRes.recursosRelacionados ?? [] }));
    } catch {
      // Silenciar
    }
  }

  async function handleComment(recursoId: string) {
    if (!token) return;
    const texto = (commentById[recursoId] || '').trim();
    if (!texto) return;
    try {
      assertNoScriptInjection(texto, 'comentario');
      const res = await gqlRequest<{ comentarRecurso: { comentarios: ComentarioItem[] } }>(
        `mutation Comentar($id: ID!, $texto: String!) {
          comentarRecurso(recursoId: $id, texto: $texto) { comentarios { idUsuario texto fecha } }
        }`,
        { id: recursoId, texto },
        token,
      );
      setItems((prev) => prev.map((x) => (x._id === recursoId ? { ...x, comentarios: res.comentarRecurso.comentarios } : x)));
      setCommentById((prev) => ({ ...prev, [recursoId]: '' }));
    } catch (err: any) {
      setError(err.message || 'No se pudo agregar el comentario.');
    }
  }

  async function handleNewVersion(recurso: RecursoItem) {
    if (!token) return;
    const nota = (versionNoteById[recurso._id] || '').trim();
    if (!nota) return;
    try {
      assertNoScriptInjection(nota, 'versión');
      const res = await gqlRequest<{ agregarVersionRecurso: { versiones: VersionItem[] } }>(
        `mutation NuevaVersion($id: ID!, $url: String!, $nota: String!) {
          agregarVersionRecurso(recursoId: $id, archivoUrl: $url, notaCambio: $nota) {
            versiones { version archivoUrl notaCambio fecha }
          }
        }`,
        { id: recurso._id, url: `${recurso.archivoUrl}?v=${(recurso.versiones?.length || 1) + 1}`, nota },
        token,
      );
      setItems((prev) => prev.map((x) => (x._id === recurso._id ? { ...x, versiones: res.agregarVersionRecurso.versiones } : x)));
      setVersionNoteById((prev) => ({ ...prev, [recurso._id]: '' }));
      setMessage('Nueva versión registrada en el historial.');
    } catch (err: any) {
      setError(err.message || 'No se pudo agregar la versión.');
    }
  }

  async function handleInviteCoauthor(recursoId: string) {
    if (!token) return;
    const coautorId = (coauthorById[recursoId] || '').trim();
    if (!coautorId) return;
    try {
      await gqlRequest(
        `mutation InvitarCoautor($id: ID!, $coautorId: ID!) {
          invitarCoautor(recursoId: $id, coautorId: $coautorId) { _id coautores }
        }`,
        { id: recursoId, coautorId },
        token,
      );
      setCoauthorById((prev) => ({ ...prev, [recursoId]: '' }));
      setMessage('Coautor agregado al recurso.');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo invitar al coautor (verifica el ID de usuario).');
    }
  }

  async function handleMoveToTrash(recursoId: string) {
    if (!token) return;
    try {
      await gqlRequest(`mutation Papelera($id: ID!) { moverRecursoAPapelera(recursoId: $id) { _id } }`, { id: recursoId }, token);
      setMessage('Recurso enviado a la papelera de reciclaje (se conservará 30 días).');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar a la papelera.');
    }
  }

  async function handleRestoreFromTrash(recursoId: string) {
    if (!token) return;
    try {
      await gqlRequest(`mutation Restaurar($id: ID!) { restaurarRecurso(recursoId: $id) { _id } }`, { id: recursoId }, token);
      setMessage('Recurso restaurado al repositorio.');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo restaurar el recurso.');
    }
  }

  async function handleReport(recursoId: string) {
    if (!token) return;
    const motivo = window.prompt('Describe el motivo del reporte (contenido inapropiado o inexacto):');
    if (!motivo?.trim()) return;
    try {
      assertNoScriptInjection(motivo, 'reporte');
      await gqlRequest(
        `mutation ReportarRec($id: ID!, $motivo: String!) {
          reportarContenido(tipoObjetivo: "Recurso", idObjetivo: $id, motivo: $motivo) { _id }
        }`,
        { id: recursoId, motivo: motivo.trim() },
        token,
      );
      setMessage('Reporte enviado a moderación.');
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar el reporte.');
    }
  }

  function handleExportPdf(x: RecursoItem) {
    const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) || 'Asignatura') : 'General';
    const topName = topicMap.get(x.idTema) || 'Tema';
    exportHtmlToPdf(
      `Recurso Académico · ${x.titulo}`,
      `<div class="card">
        <p><span class="badge">${x.estadoValidacion === 'REVISADO_DOCENTE' ? 'Revisado por docente' : 'Pendiente'}</span></p>
        <p><strong>Asignatura / Tema:</strong> ${escapeHtml(subName)} · ${escapeHtml(topName)}</p>
        <p><strong>Autor:</strong> ${escapeHtml(x.nombreAutor || 'Estudiante')} &nbsp;|&nbsp; <strong>Formato:</strong> ${escapeHtml(x.tipoArchivo.toUpperCase())} &nbsp;|&nbsp; <strong>Calificación:</strong> ★ ${x.promedioCalificacion.toFixed(1)} (${x.totalCalificaciones})</p>
        ${x.descripcion ? `<p><strong>Descripción:</strong> ${escapeHtml(x.descripcion)}</p>` : ''}
        ${x.palabrasClave?.length ? `<p><strong>Palabras clave:</strong> ${escapeHtml(x.palabrasClave.join(', '))}</p>` : ''}
        ${x.retroalimentacionDocente ? `<p><strong>Retroalimentación docente:</strong> ${escapeHtml(x.retroalimentacionDocente)}</p>` : ''}
      </div>`,
    );
  }

  return (
    <>
      <ModuleBanner module={moduleInfo}><span className="chip chip--soft">Módulo 3</span></ModuleBanner>
      <div className="kolab-module">
        <section className="km-toolbar">
          <div>
            <h2>Repositorio de recursos</h2>
            <p className="muted">Materiales compartidos por la comunidad académica (PDF e imágenes hasta 10 MB).</p>
          </div>
          <div className="row">
            <span className="chip chip--soft">{items.length} recursos</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTrash((v) => !v)}>
              🗑️ Papelera ({papelera.length})
            </button>
          </div>
        </section>

        {showTrash && (
          <section className="card">
            <h2 className="card__title">Papelera de reciclaje · vencimiento 30 días (RF-67)</h2>
            {papelera.length === 0 ? (
              <p className="empty">Tu papelera está vacía.</p>
            ) : (
              <div className="skeleton-stack">
                {papelera.map((r) => (
                  <div key={r._id} className="td-item">
                    <div className="td-item__head">
                      <strong>{r.titulo}</strong>
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => handleRestoreFromTrash(r._id)}>
                        Restaurar
                      </button>
                    </div>
                    <span className="muted">
                      Eliminado el {r.eliminadoEn ? new Date(r.eliminadoEn).toLocaleDateString('es-MX') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Formulario de subida */}
        <section className="card km-upload">
          <div>
            <h2>Compartir un recurso</h2>
            <p className="muted">Sube apuntes (PDF, PNG, JPG o WEBP máx. 10 MB) con descripción y palabras clave.</p>
          </div>
          <form onSubmit={upload}>
            <div className="form-grid">
              <div className="field">
                <label>Nombre del recurso</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Apuntes de unidad 1" />
              </div>
              <div className="field">
                <label>Archivo (PDF o imagen · máx. 10 MB)</label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
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
              <div className="field">
                <label>Descripción breve (RF-83)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resume qué contiene este material…" />
              </div>
              <div className="field">
                <label>Palabras clave separadas por coma (RF-84)</label>
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="SQL, normalización, examen parcial" />
              </div>
            </div>
            {isTeacher && (
              <label className="row" style={{ marginTop: '0.65rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={esOficial} onChange={(e) => setEsOficial(e.target.checked)} />
                <span>Publicar como <strong>Material Oficial de clase</strong> (auto-validado · RF-22)</span>
              </label>
            )}
            <div className="km-actions">
              <button className="btn btn--primary" disabled={!file || !formTopicId}>＋ Publicar recurso</button>
              {file && <span className="muted">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-ok" role="status">{message}</p>}
          </form>
        </section>

        {/* Colecciones personales y favoritos (RF-61 / RF-62) */}
        {colecciones.length > 0 && (
          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Mis colecciones y favoritos (RF-61 / RF-62)</strong>
              {selectedCollectionId && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedCollectionId('')}>
                  Ver todo el repositorio
                </button>
              )}
            </div>
            <div className="row">
              {colecciones.map((col) => (
                <button
                  key={col._id}
                  type="button"
                  className={`btn btn--sm ${selectedCollectionId === col._id ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setSelectedCollectionId((prev) => (prev === col._id ? '' : col._id))}
                >
                  {col.esFavoritos ? '★' : '📁'} {col.nombre} ({col.recursos.length})
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Panel de búsqueda y filtros combinados (RF-14, RF-64, RF-85..88) */}
        <section className="km-filter-panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <strong>Filtros avanzados y ordenamiento</strong>
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Buscar (título, descripción, etiquetas, autor)</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" />
            </div>
            <div className="field">
              <label>Palabra clave</label>
              <input value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} placeholder="Ej. SQL" />
            </div>
            <div className="field">
              <label>Autor</label>
              <input value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} placeholder="Nombre del autor…" />
            </div>
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
            <div className="field">
              <label>Calificación mínima</label>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                <option value={0}>Todas</option>
                <option value={3}>3 ★ o más</option>
                <option value={4}>4 ★ o más</option>
                <option value={5}>Solo 5 ★</option>
              </select>
            </div>
            <div className="field">
              <label>Ordenar por (RF-64)</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="RECIENTES">Más recientes</option>
                <option value="MEJOR_CALIFICADOS">Mejor calificados</option>
                <option value="MAS_CONSULTADOS">Más consultados</option>
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
              const isOwn = String(x.idUsuario) === String(user?.id);
              const canEdit = isOwn || (x.coautores || []).includes(String(user?.id));
              const isExpanded = expandedId === x._id;

              return (
                <article className="card km-resource" key={x._id}>
                  <div className="km-resource-top">
                    <span className="km-file-icon">{x.tipoArchivo?.replace('application/', '').replace('image/', '').slice(0, 4).toUpperCase() || 'PDF'}</span>
                    <span className={`chip ${reviewed ? 'chip--soft' : 'chip--xp'}`}>
                      {x.esMaterialOficial ? '★ Oficial' : reviewed ? '✓ Revisado por docente' : 'Sin revisar'}
                    </span>
                  </div>
                  <h3>{x.titulo}</h3>
                  <p className="muted" style={{ fontSize: '0.84rem' }}>
                    {subName} · {topName} · Por <strong>{x.nombreAutor || 'Estudiante'}</strong>
                  </p>
                  {x.descripcion && <p className="muted">{x.descripcion}</p>}
                  {x.palabrasClave?.length > 0 && (
                    <div className="td-tags">
                      {x.palabrasClave.map((k) => <span key={k} className="td-tag">#{k}</span>)}
                    </div>
                  )}

                  {/* Calificación promedio y votación (RF-89..91) */}
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted" style={{ fontSize: '0.82rem' }}>
                      ★ {x.promedioCalificacion.toFixed(1)} ({x.totalCalificaciones}) · v{x.versiones?.length || 1} · {x.consultasCount} vistas
                    </span>
                    {!isOwn && (
                      <div className="star-rating" aria-label="Calificar recurso">
                        {[1, 2, 3, 4, 5].map((st) => (
                          <button
                            key={st}
                            type="button"
                            className={`star-btn ${st <= Math.round(x.promedioCalificacion) ? 'is-on' : ''}`}
                            onClick={() => handleRate(x._id, st)}
                            title={`Calificar con ${st} estrella(s)`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {x.retroalimentacionDocente && (
                    <p className="muted" style={{ fontSize: '0.82rem' }}>
                      <strong>Nota docente:</strong> {x.retroalimentacionDocente}
                    </p>
                  )}

                  <div className="row">
                    {x.archivoUrl && !x.archivoUrl.includes('kolab.local') && (
                      <a
                        href={x.archivoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--primary btn--sm"
                      >
                        Abrir archivo
                      </a>
                    )}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleSaveCollection(x._id, 'Favoritos', true)}>
                      ★ Favorito
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleExportPdf(x)}>
                      PDF
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleExpand(x)}>
                      {isExpanded ? 'Ocultar' : 'Detalle'}
                    </button>
                    {isTeacher && !reviewed && (
                      <>
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => review(x._id, 'REVISADO_DOCENTE')}>
                          Validar
                        </button>
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => review(x._id, 'ARCHIVADO')}>
                          Archivar
                        </button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="skeleton-stack" style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--borde)' }}>
                      {/* Guardar en colección personalizada (RF-62) */}
                      <div className="row">
                        <input
                          value={collectionName}
                          onChange={(e) => setCollectionName(e.target.value)}
                          placeholder="Nombre de colección (ej. Examen BD)"
                          style={{ flex: 1, minHeight: 36, padding: '0 0.7rem', borderRadius: 10, border: '1px solid var(--borde)' }}
                        />
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleSaveCollection(x._id, collectionName, false)}
                        >
                          + Colección
                        </button>
                      </div>

                      {/* Comentarios generales (RF-69) */}
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>Comentarios ({x.comentarios?.length || 0})</strong>
                        {x.comentarios?.map((c, idx) => (
                          <p key={idx} className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                            • {c.texto} ({new Date(c.fecha).toLocaleDateString('es-MX')})
                          </p>
                        ))}
                        <div className="row" style={{ marginTop: 6 }}>
                          <input
                            value={commentById[x._id] ?? ''}
                            onChange={(e) => setCommentById((p) => ({ ...p, [x._id]: e.target.value }))}
                            placeholder="Agregar comentario…"
                            style={{ flex: 1, minHeight: 36, padding: '0 0.7rem', borderRadius: 10, border: '1px solid var(--borde)' }}
                          />
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => handleComment(x._id)}>
                            Comentar
                          </button>
                        </div>
                      </div>

                      {/* Historial de versiones (RF-13 / RF-66) y Coautoría (RF-65) */}
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>Historial de versiones ({x.versiones?.length || 1})</strong>
                        {x.versiones?.map((v) => (
                          <p key={v.version} className="muted" style={{ fontSize: '0.8rem' }}>
                            v{v.version} — {v.notaCambio || 'Actualización'} ({new Date(v.fecha).toLocaleDateString('es-MX')})
                          </p>
                        ))}
                        {canEdit && (
                          <div className="row" style={{ marginTop: 6 }}>
                            <input
                              value={versionNoteById[x._id] ?? ''}
                              onChange={(e) => setVersionNoteById((p) => ({ ...p, [x._id]: e.target.value }))}
                              placeholder="Nota de nueva versión…"
                              style={{ flex: 1, minHeight: 36, padding: '0 0.7rem', borderRadius: 10, border: '1px solid var(--borde)' }}
                            />
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleNewVersion(x)}>
                              + Versión
                            </button>
                          </div>
                        )}
                        {isOwn && (
                          <div className="row" style={{ marginTop: 6 }}>
                            <input
                              value={coauthorById[x._id] ?? ''}
                              onChange={(e) => setCoauthorById((p) => ({ ...p, [x._id]: e.target.value }))}
                              placeholder="ID de usuario coautor (RF-65)…"
                              style={{ flex: 1, minHeight: 36, padding: '0 0.7rem', borderRadius: 10, border: '1px solid var(--borde)' }}
                            />
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleInviteCoauthor(x._id)}>
                              Invitar coautor
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Recursos relacionados (RF-63) */}
                      {(relatedMap[x._id]?.length ?? 0) > 0 && (
                        <div>
                          <strong style={{ fontSize: '0.85rem' }}>Relacionados del tema (RF-63)</strong>
                          <div className="td-tags" style={{ marginTop: 4 }}>
                            {relatedMap[x._id].map((rel) => (
                              <span key={rel._id} className="td-tag">{rel.titulo} (★ {rel.promedioCalificacion.toFixed(1)})</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="row">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleReport(x._id)}>
                          🚩 Reportar
                        </button>
                        {isOwn && (
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => handleMoveToTrash(x._id)}>
                            🗑️ Enviar a papelera
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
