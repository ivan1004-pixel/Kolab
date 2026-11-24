import { DragEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileDown,
  FileText,
  Flag,
  FolderHeart,
  FolderOpen,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { CardListSkeleton } from '../components/Skeleton';
import ReportModal from '../components/ReportModal';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest, uploadResourceFile } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';

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
  palabrasClave: string[];
  idAsignatura?: string;
  idTema: string;
  promedioCalificacion: number;
  totalCalificaciones: number;
  consultasCount: number;
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

interface UploadModalState {
  open: boolean;
  status: 'uploading' | 'success';
  title: string;
  fileName: string;
  isOfficial: boolean;
}

type ResourceSection = 'compartir' | 'aportaciones' | 'repositorio';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (RF-92 / RNF-14)
const MAX_KEYWORDS = 5;
const PAGE_SIZE = 10;
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function detectAllowedFileType(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return ext === 'jpg' ? 'jpeg' : ext;
  }
  return null;
}

function isPdfType(tipoArchivo?: string, archivoUrl?: string): boolean {
  const t = (tipoArchivo || '').toLowerCase();
  const u = (archivoUrl || '').toLowerCase();
  return t.includes('pdf') || u.endsWith('.pdf');
}

function isImageType(tipoArchivo?: string, archivoUrl?: string): boolean {
  const t = (tipoArchivo || '').toLowerCase();
  const u = (archivoUrl || '').toLowerCase();
  return t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(t) || /\.(png|jpe?g|webp)$/i.test(u);
}

function formatKeyword(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default function Recursos() {
  const { user, token } = useAuth();
  const [section, setSection] = useState<ResourceSection>('compartir');
  const [items, setItems] = useState<RecursoItem[]>([]);
  const [colecciones, setColecciones] = useState<ColeccionItem[]>([]);
  const [papelera, setPapelera] = useState<RecursoItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modal animado de subida y confirmación
  const [uploadModal, setUploadModal] = useState<UploadModalState>({
    open: false,
    status: 'uploading',
    title: '',
    fileName: '',
    isOfficial: false,
  });

  // Paginación de 10 en 10
  const [myPage, setMyPage] = useState(1);
  const [repoPage, setRepoPage] = useState(1);

  // Buscador y filtros desplegables del Repositorio de conocimientos
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Formulario de subida: tarjeta izquierda (dropzone + vista previa) + campos a la derecha
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [esOficial, setEsOficial] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTopicId, setFormTopicId] = useState('');

  // Quick Modal de detalle y opciones (native <dialog>)
  const detailDialogRef = useRef<HTMLDialogElement | null>(null);
  const [detailResourceId, setDetailResourceId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; title: string } | null>(null);
  const [quickFeedback, setQuickFeedback] = useState('');
  const [relatedMap, setRelatedMap] = useState<Record<string, RecursoItem[]>>({});
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const [collectionName, setCollectionName] = useState('');

  const isTeacher = ['docente', 'admin'].includes(user?.rol ?? '');

  const activeDetailResource = useMemo(
    () => (detailResourceId ? items.find((it) => it._id === detailResourceId) ?? null : null),
    [items, detailResourceId],
  );

  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog) return;
    if (detailResourceId) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [detailResourceId]);

  // Fallback para navegadores sin soporte nativo de <dialog closedby="any"> (p. ej. Safari)
  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
            retroalimentacionDocente esMaterialOficial idUsuario nombreAutor
            palabrasClave idAsignatura idTema promedioCalificacion totalCalificaciones
            consultasCount createdAt
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

  const myContributions = useMemo(
    () => items.filter((x) => String(x.idUsuario) === String(user?.id)),
    [items, user?.id],
  );

  const favoriteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const col of colecciones) {
      if (col.esFavoritos || col.nombre.toLowerCase() === 'favoritos') {
        for (const rId of col.recursos || []) ids.add(String(rId));
      }
    }
    return ids;
  }, [colecciones]);

  const activeCollectionIds = useMemo(() => {
    if (!selectedCollectionId) return null;
    const col = colecciones.find((c) => c._id === selectedCollectionId);
    return col ? new Set(col.recursos) : null;
  }, [colecciones, selectedCollectionId]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (keywordFilter.trim()) count++;
    if (authorFilter.trim()) count++;
    if (subject !== 'Todas') count++;
    if (topic !== 'Todas') count++;
    if (status !== 'Todos') count++;
    if (minRating > 0) count++;
    if (sortBy !== 'RECIENTES') count++;
    if (selectedCollectionId) count++;
    return count;
  }, [keywordFilter, authorFilter, subject, topic, status, minRating, sortBy, selectedCollectionId]);

  const filteredRepo = useMemo(() => {
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

  // Resetear página al cambiar filtros
  useEffect(() => {
    setRepoPage(1);
  }, [query, keywordFilter, authorFilter, subject, topic, status, minRating, sortBy, selectedCollectionId]);

  const myTotalPages = Math.max(1, Math.ceil(myContributions.length / PAGE_SIZE));
  const safeMyPage = Math.min(myPage, myTotalPages);
  const paginatedMy = useMemo(
    () => myContributions.slice((safeMyPage - 1) * PAGE_SIZE, safeMyPage * PAGE_SIZE),
    [myContributions, safeMyPage],
  );

  const repoTotalPages = Math.max(1, Math.ceil(filteredRepo.length / PAGE_SIZE));
  const safeRepoPage = Math.min(repoPage, repoTotalPages);
  const paginatedRepo = useMemo(
    () => filteredRepo.slice((safeRepoPage - 1) * PAGE_SIZE, safeRepoPage * PAGE_SIZE),
    [filteredRepo, safeRepoPage],
  );

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

  function addKeywordTag(raw: string) {
    const formatted = formatKeyword(raw);
    if (!formatted) return;
    if (keywordTags.length >= MAX_KEYWORDS) return;
    if (keywordTags.some((t) => t.toLowerCase() === formatted.toLowerCase())) {
      setKeywordDraft('');
      return;
    }
    setKeywordTags((prev) => [...prev, formatted]);
    setKeywordDraft('');
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeywordTag(keywordDraft);
    } else if (e.key === 'Backspace' && !keywordDraft && keywordTags.length > 0) {
      setKeywordTags((prev) => prev.slice(0, -1));
    }
  }

  function removeKeywordTag(tag: string) {
    setKeywordTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setError('');
    setMessage('');

    if (!token) {
      setError('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }
    if (!file) {
      setError('Selecciona o arrastra un archivo PDF o imagen en el cuadro izquierdo.');
      return;
    }
    if (!formTopicId) {
      setError('Selecciona un tema antes de publicar.');
      return;
    }

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
      setError('Formato no permitido. Solo se aceptan archivos PDF e imágenes (PNG, JPG, WEBP). Tus datos del formulario se conservan.');
      return;
    }

    const finalKeywords = [...keywordTags];
    const pendingTag = formatKeyword(keywordDraft);
    if (
      pendingTag &&
      finalKeywords.length < MAX_KEYWORDS &&
      !finalKeywords.some((t) => t.toLowerCase() === pendingTag.toLowerCase())
    ) {
      finalKeywords.push(pendingTag);
    }

    const resourceTitle = title.trim() || file.name;
    const uploadedFileName = file.name;

    setSubmitting(true);
    setUploadModal({
      open: true,
      status: 'uploading',
      title: resourceTitle,
      fileName: uploadedFileName,
      isOfficial: isTeacher && esOficial,
    });

    try {
      assertNoScriptInjection({ title, description, keywords: finalKeywords, fileName: file.name }, 'recurso');
      const uploaded = await uploadResourceFile(file, token);
      const res = await gqlRequest<{ subirRecurso: RecursoItem }>(
        `mutation SubirRecurso($input: CreateRecursoInput!) {
          subirRecurso(input: $input) {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion
            esMaterialOficial idUsuario nombreAutor palabrasClave
            idAsignatura idTema promedioCalificacion totalCalificaciones consultasCount createdAt
            comentarios { idUsuario texto fecha }
          }
        }`,
        {
          input: {
            titulo: resourceTitle,
            descripcion: description.trim() || undefined,
            tipoArchivo: uploaded.tipoArchivo || validType,
            tamanoBytes: uploaded.tamanoBytes || file.size,
            archivoUrl: uploaded.url,
            idTema: formTopicId,
            ...(formSubjectId ? { idAsignatura: formSubjectId } : {}),
            palabrasClave: finalKeywords,
            ...(isTeacher && esOficial ? { esMaterialOficial: true } : {}),
          },
        },
        token,
      );

      setItems((prev) => [res.subirRecurso, ...prev]);
      setTitle('');
      setDescription('');
      setKeywordTags([]);
      setKeywordDraft('');
      setEsOficial(false);
      setFile(null);
      formEl?.reset();
      if (fileInputRef.current) fileInputRef.current.value = '';

      setUploadModal({
        open: true,
        status: 'success',
        title: res.subirRecurso.titulo,
        fileName: uploadedFileName,
        isOfficial: res.subirRecurso.esMaterialOficial,
      });
    } catch (err: any) {
      setUploadModal((prev) => ({ ...prev, open: false }));
      setError(err.message || 'No se pudo publicar el recurso. Verifica que el backend esté activo.');
    } finally {
      setSubmitting(false);
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
      setMessage(`Calificación de ${estrellas} estrella(s) registrada.`);
    } catch (err: any) {
      setError(err.message || 'No se pudo calificar el recurso.');
    }
  }

  async function handleToggleFavorite(recursoId: string) {
    if (!token) return;
    const wasFav = favoriteIds.has(recursoId);
    try {
      await gqlRequest(
        `mutation ToggleFav($id: ID!) {
          guardarRecursoEnColeccion(recursoId: $id, nombreColeccion: "Favoritos", esFavoritos: true) {
            _id nombre recursos esFavoritos
          }
        }`,
        { id: recursoId },
        token,
      );
      setMessage(wasFav ? 'Recurso quitado de tus favoritos.' : 'Recurso guardado en tus favoritos (visible en tu Perfil).');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar favoritos.');
    }
  }

  async function handleSaveCollection(recursoId: string, nombre: string) {
    if (!token || !nombre.trim()) return;
    try {
      assertNoScriptInjection(nombre, 'colección');
      await gqlRequest(
        `mutation GuardarCol($id: ID!, $nombre: String!) {
          guardarRecursoEnColeccion(recursoId: $id, nombreColeccion: $nombre, esFavoritos: false) { _id nombre recursos esFavoritos }
        }`,
        { id: recursoId, nombre: nombre.trim() },
        token,
      );
      const okMsg = `Recurso guardado en "${nombre.trim()}".`;
      setMessage(okMsg);
      setQuickFeedback(okMsg);
      setCollectionName('');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar en la colección.');
    }
  }

  async function openQuickModal(recurso: RecursoItem) {
    setQuickFeedback('');
    setDetailResourceId(recurso._id);
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

  function closeQuickModal() {
    if (detailDialogRef.current?.open) {
      detailDialogRef.current.close();
    } else {
      setDetailResourceId(null);
    }
  }

  const commentingRef = useRef(false);
  const [commenting, setCommenting] = useState(false);

  async function handleComment(recursoId: string) {
    if (!token || commentingRef.current) return;
    const texto = (commentById[recursoId] || '').trim();
    if (!texto) return;
    commentingRef.current = true;
    setCommenting(true);
    setCommentById((prev) => ({ ...prev, [recursoId]: '' }));
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
      setQuickFeedback('Comentario agregado.');
    } catch (err: any) {
      setCommentById((prev) => ({ ...prev, [recursoId]: texto }));
      setError(err.message || 'No se pudo agregar el comentario.');
    } finally {
      commentingRef.current = false;
      setCommenting(false);
    }
  }

  async function handleMoveToTrash(recursoId: string) {
    if (!token) return;
    try {
      await gqlRequest(`mutation Papelera($id: ID!) { moverRecursoAPapelera(recursoId: $id) { _id } }`, { id: recursoId }, token);
      closeQuickModal();
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

  async function submitResourceReport(motivo: string) {
    if (!token || !reportTarget) return;
    await gqlRequest(
      `mutation ReportarRec($id: ID!, $motivo: String!) {
        reportarContenido(tipoObjetivo: "RECURSO", idObjetivo: $id, motivo: $motivo) { _id }
      }`,
      { id: reportTarget.id, motivo },
      token,
    );
    setMessage('Reporte enviado a moderación.');
    setQuickFeedback('Reporte enviado a moderación.');
  }

  function handleExportPdf(x: RecursoItem) {
    const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) || 'Asignatura') : 'General';
    const topName = topicMap.get(x.idTema) || 'Tema';
    exportHtmlToPdf(
      `Recurso Académico · ${x.titulo}`,
      `<div class="card">
        <p><span class="badge">${x.estadoValidacion === 'REVISADO_DOCENTE' ? 'Revisado por docente' : 'Pendiente'}</span></p>
        <p><strong>Asignatura / Tema:</strong> ${escapeHtml(subName)} · ${escapeHtml(topName)}</p>
        <p><strong>Autor:</strong> ${escapeHtml(x.nombreAutor || 'Estudiante')} &nbsp;|&nbsp; <strong>Formato:</strong> ${escapeHtml(x.tipoArchivo.toUpperCase())} &nbsp;|&nbsp; <strong>Calificación:</strong> ${x.promedioCalificacion.toFixed(1)} (${x.totalCalificaciones})</p>
        ${x.descripcion ? `<p><strong>Descripción:</strong> ${escapeHtml(x.descripcion)}</p>` : ''}
        ${x.palabrasClave?.length ? `<p><strong>Palabras clave:</strong> ${escapeHtml(x.palabrasClave.join(', '))}</p>` : ''}
        ${x.retroalimentacionDocente ? `<p><strong>Retroalimentación docente:</strong> ${escapeHtml(x.retroalimentacionDocente)}</p>` : ''}
      </div>`,
    );
  }

  function renderPagination(currentPage: number, totalPages: number, totalItems: number, onChangePage: (p: number) => void) {
    if (totalItems === 0) return null;
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, totalItems);
    return (
      <div className="km-pagination" aria-label="Paginación de recursos">
        <span className="muted" style={{ fontSize: '0.84rem' }}>
          Mostrando <strong>{start}–{end}</strong> de <strong>{totalItems}</strong> recursos (10 por página)
        </span>
        {totalPages > 1 && (
          <div className="km-pagination__controls">
            <button
              type="button"
              className="km-page-btn"
              disabled={currentPage <= 1}
              onClick={() => onChangePage(currentPage - 1)}
            >
              <ChevronLeft size={15} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`km-page-btn ${pageNum === currentPage ? 'is-active' : ''}`}
                onClick={() => onChangePage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              className="km-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => onChangePage(currentPage + 1)}
            >
              <span>Siguiente</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderResourceCard(x: RecursoItem) {
    const reviewed = x.estadoValidacion === 'REVISADO_DOCENTE';
    const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) || 'Asignatura') : 'General';
    const topName = topicMap.get(x.idTema) || 'Tema';
    const isOwn = String(x.idUsuario) === String(user?.id);
    const isFav = favoriteIds.has(x._id);
    const hasRealUrl = Boolean(x.archivoUrl && !x.archivoUrl.includes('kolab.local'));
    const showPdfPreview = hasRealUrl && isPdfType(x.tipoArchivo, x.archivoUrl);
    const showImgPreview = hasRealUrl && isImageType(x.tipoArchivo, x.archivoUrl);

    return (
      <article className="card km-resource" key={x._id}>
        {/* Previsualización de la primera hoja del PDF o imagen */}
        <div className="km-resource-preview">
          {showPdfPreview ? (
            <iframe
              src={`${x.archivoUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={`Primera página de ${x.titulo}`}
              className="km-preview-pdf"
              scrolling="no"
              tabIndex={-1}
            />
          ) : showImgPreview ? (
            <img src={x.archivoUrl} alt={x.titulo} className="km-preview-img" loading="lazy" />
          ) : (
            <div className="km-preview-placeholder">
              <FileText size={32} aria-hidden="true" />
              <span>{x.tipoArchivo?.replace('application/', '').replace('image/', '').toUpperCase() || 'PDF'}</span>
            </div>
          )}
          {hasRealUrl && (
            <a
              href={x.archivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="km-preview-overlay"
              aria-label={`Abrir ${x.titulo}`}
            >
              <span className="km-preview-pill">
                <ExternalLink size={12} aria-hidden="true" /> Ver documento
              </span>
            </a>
          )}
        </div>

        <div className="km-resource-top">
          <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
            {subName} · {topName}
          </span>
          <span className={`chip ${reviewed ? 'chip--soft' : 'chip--xp'}`}>
            {x.esMaterialOficial ? (
              <><Sparkles size={12} aria-hidden="true" /> Oficial</>
            ) : reviewed ? (
              <><CheckCircle2 size={12} aria-hidden="true" /> Revisado</>
            ) : (
              'Sin revisar'
            )}
          </span>
        </div>

        <h3>{x.titulo}</h3>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Por <strong>{x.nombreAutor || 'Estudiante'}</strong>
        </p>
        {x.descripcion && <p className="muted" style={{ fontSize: '0.86rem' }}>{x.descripcion}</p>}
        {x.palabrasClave?.length > 0 && (
          <div className="td-tags">
            {x.palabrasClave.map((k) => <span key={k} className="td-tag">#{k}</span>)}
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Star size={13} fill="#eab308" color="#eab308" aria-hidden="true" />
            {x.promedioCalificacion.toFixed(1)} ({x.totalCalificaciones}) · {x.consultasCount} vistas
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
                  <Star size={15} fill={st <= Math.round(x.promedioCalificacion) ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          )}
        </div>

        {x.retroalimentacionDocente && (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            <strong>Nota docente:</strong> {x.retroalimentacionDocente}
          </p>
        )}

        <div className="row">
          {hasRealUrl && (
            <a
              href={x.archivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary btn--sm"
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span>Abrir</span>
            </a>
          )}
          <button
            type="button"
            className={`btn btn--ghost btn--sm ${isFav ? 'btn--fav-active' : ''}`}
            onClick={() => handleToggleFavorite(x._id)}
            aria-pressed={isFav}
            title={isFav ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            <Bookmark size={14} fill={isFav ? 'currentColor' : 'none'} aria-hidden="true" />
            <span>Favorito</span>
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleExportPdf(x)}>
            <FileDown size={14} aria-hidden="true" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm km-more-icon-btn"
            onClick={() => openQuickModal(x)}
            aria-label={`Más opciones de ${x.titulo}`}
            title="Más opciones, colecciones y comentarios"
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {isTeacher && !reviewed && (
            <>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => review(x._id, 'REVISADO_DOCENTE')}>
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Validar</span>
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => review(x._id, 'ARCHIVADO')}>
                <Archive size={14} aria-hidden="true" />
                <span>Archivar</span>
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="kolab-module module3-page">
      <section className="module-banner module-banner-olive" aria-label="Encabezado del repositorio de recursos">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />
        <div className="banner-content">
          <h1 className="banner-title">Repositorio de recursos y validación docente</h1>
          <p className="banner-subtitle">Comparte, busca y consulta materiales revisados por la comunidad académica</p>
        </div>
      </section>

      {/* Navegación de los 3 submódulos */}
      <nav className="td-tabs" aria-label="Submódulos de recursos">
        <button
          type="button"
          className={`td-tab ${section === 'compartir' ? 'is-active' : ''}`}
          onClick={() => setSection('compartir')}
        >
          <UploadCloud size={16} aria-hidden="true" />
          <span>Compartir un recurso</span>
        </button>
        <button
          type="button"
          className={`td-tab ${section === 'aportaciones' ? 'is-active' : ''}`}
          onClick={() => setSection('aportaciones')}
        >
          <FolderOpen size={16} aria-hidden="true" />
          <span>Mis aportaciones</span>
          <span className="td-tab__badge">{myContributions.length}</span>
        </button>
        <button
          type="button"
          className={`td-tab ${section === 'repositorio' ? 'is-active' : ''}`}
          onClick={() => setSection('repositorio')}
        >
          <BookOpen size={16} aria-hidden="true" />
          <span>Repositorio de conocimientos</span>
          <span className="td-tab__badge">{items.length}</span>
        </button>
      </nav>

      {error && (
        <div className="td-notice td-notice--err" role="alert">
          <span>{error}</span>
          <button type="button" className="notice-close" onClick={() => setError('')} aria-label="Cerrar">×</button>
        </div>
      )}
      {message && (
        <div className="td-notice td-notice--ok" role="status">
          <span>{message}</span>
          <button type="button" className="notice-close" onClick={() => setMessage('')} aria-label="Cerrar">×</button>
        </div>
      )}

      {/* ==================== SUBMÓDULO 1: COMPARTIR UN RECURSO ==================== */}
      {section === 'compartir' && (
        <section className="card km-upload">
          <form onSubmit={upload} noValidate>
            <div className="km-share-layout">
              {/* Tarjeta grande exclusiva de subida + vista previa primera hoja a la izquierda */}
              <label
                htmlFor="res-file"
                className={`km-dropzone-card ${file ? 'has-file' : ''} ${isDragging ? 'is-dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                {file && localPreviewUrl ? (
                  <div className="km-resource-preview km-resource-preview--sm">
                    {isPdfType(file.type, file.name) ? (
                      <iframe
                        src={`${localPreviewUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                        title="Vista previa primera página del PDF"
                        className="km-preview-pdf"
                        scrolling="no"
                        tabIndex={-1}
                      />
                    ) : (
                      <img src={localPreviewUrl} alt="Vista previa del archivo" className="km-preview-img" />
                    )}
                  </div>
                ) : (
                  <div className="km-dropzone-icon">
                    <UploadCloud size={28} aria-hidden="true" />
                  </div>
                )}

                <h3 className="km-dropzone-title">
                  {file ? 'Archivo listo para publicar' : 'Sube tu archivo aquí'}
                </h3>
                {!file && (
                  <p className="km-dropzone-sub">
                    Arrastra tu documento o haz clic para explorar.
                  </p>
                )}
                <span className="chip chip--soft">PDF, PNG, JPG, WEBP · Máx. 10 MB</span>

                {file && (
                  <div className="km-dropzone-file">
                    <strong>{file.name}</strong>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={(ev) => {
                        ev.preventDefault();
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      Cambiar archivo
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  id="res-file"
                  className="km-file-picker__input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>

              {/* Campos del formulario a la derecha */}
              <div className="km-share-fields">
                <div className="km-share-fields-grid">
                  <div className="field field--full">
                    <label htmlFor="res-title">Nombre del recurso</label>
                    <input
                      id="res-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej. Apuntes completos de la unidad 1"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="res-subj">Asignatura</label>
                    <select id="res-subj" value={formSubjectId} onChange={(e) => setFormSubjectId(e.target.value)}>
                      {asignaturas.length === 0 && <option value="">Sin asignaturas</option>}
                      {asignaturas.map((a) => (
                        <option key={a._id} value={a._id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="res-topic">Tema</label>
                    <select id="res-topic" value={formTopicId} onChange={(e) => setFormTopicId(e.target.value)} required>
                      {temas.length === 0 && <option value="">Sin temas registrados</option>}
                      {temas.map((t) => (
                        <option key={t._id} value={t._id}>{t.titulo}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field field--full">
                    <label htmlFor="res-desc">Descripción breve</label>
                    <input
                      id="res-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Resume qué contiene este material…"
                    />
                  </div>

                  <div className="field field--full">
                    <label htmlFor="res-kw">
                      Palabras clave (Enter para agregar · {keywordTags.length}/{MAX_KEYWORDS} máx.)
                    </label>
                    <div className="km-tags-box">
                      {keywordTags.map((tag) => (
                        <span key={tag} className="km-tag-chip">
                          <span>{tag}</span>
                          <button type="button" onClick={() => removeKeywordTag(tag)} aria-label={`Quitar ${tag}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                      {keywordTags.length < MAX_KEYWORDS && (
                        <input
                          id="res-kw"
                          value={keywordDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKeywordDraft(val.length === 1 ? val.toUpperCase() : val);
                          }}
                          onKeyDown={handleKeywordKeyDown}
                          placeholder={
                            keywordTags.length === 0
                              ? 'Escribe una palabra y presiona Enter…'
                              : 'Agregar otra palabra + Enter…'
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>

                {isTeacher && (
                  <div className="pref-row" style={{ borderBottom: 0, padding: '0.25rem 0' }}>
                    <span className="pref-label-group">
                      <span className="pref-icon-badge"><Sparkles size={16} aria-hidden="true" /></span>
                      <span>Publicar como <strong>Material Oficial de clase</strong></span>
                    </span>
                    <label className="kolab-toggle">
                      <input type="checkbox" checked={esOficial} onChange={(e) => setEsOficial(e.target.checked)} />
                      <span className="kolab-toggle__track"><span className="kolab-toggle__thumb" /></span>
                    </label>
                  </div>
                )}

                <div className="km-actions" style={{ marginTop: 0 }}>
                  <button type="submit" className="btn btn--primary" disabled={submitting || !file || !formTopicId}>
                    <UploadCloud size={17} aria-hidden="true" />
                    <span>{submitting ? 'Publicando…' : 'Publicar recurso'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* ==================== SUBMÓDULO 2: MIS APORTACIONES ==================== */}
      {section === 'aportaciones' && (
        <div className="skeleton-stack">
          <section className="km-toolbar">
            <div>
              <h2>Mis aportaciones</h2>
              <p className="muted">Únicamente los recursos y apuntes publicados por ti.</p>
            </div>
            <div className="row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTrash((v) => !v)}>
                <Trash2 size={15} aria-hidden="true" />
                <span>Papelera ({papelera.length})</span>
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setSection('compartir')}>
                <UploadCloud size={15} aria-hidden="true" />
                <span>Subir nuevo</span>
              </button>
            </div>
          </section>

          {showTrash && (
            <section className="card">
              <h3 className="card__title">Papelera de reciclaje · vencimiento 30 días</h3>
              {papelera.length === 0 ? (
                <p className="empty">Tu papelera está vacía.</p>
              ) : (
                <div className="skeleton-stack">
                  {papelera.map((r) => (
                    <div key={r._id} className="td-item">
                      <div className="td-item__head">
                        <strong>{r.titulo}</strong>
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => handleRestoreFromTrash(r._id)}>
                          <RotateCcw size={14} aria-hidden="true" />
                          <span>Restaurar</span>
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

          <section className="km-resource-grid--fixed">
            {loading ? (
              <CardListSkeleton count={3} bare />
            ) : paginatedMy.length === 0 ? (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <p className="empty">Todavía no has publicado aportaciones. Usa «Compartir un recurso» para subir tu primer apunte.</p>
              </div>
            ) : (
              paginatedMy.map((x) => renderResourceCard(x))
            )}
          </section>

          {renderPagination(safeMyPage, myTotalPages, myContributions.length, setMyPage)}
        </div>
      )}

      {/* ==================== SUBMÓDULO 3: REPOSITORIO DE CONOCIMIENTOS ==================== */}
      {section === 'repositorio' && (
        <div className="skeleton-stack">
          <section className="km-filter-panel">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Repositorio de conocimientos</h2>
                <p className="muted" style={{ fontSize: '0.84rem' }}>Todos los temas y recursos publicados por la comunidad.</p>
              </div>
              {(activeFiltersCount > 0 || query.trim()) && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>Limpiar filtros</span>
                </button>
              )}
            </div>

            <div className="km-repo-searchbar" style={{ marginBottom: filtersOpen ? '0.85rem' : 0 }}>
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, tema, descripción, palabras clave o autor…"
                aria-label="Buscar en el repositorio de conocimientos"
              />
              <button
                type="button"
                className={`km-search-filter-btn ${filtersOpen ? 'is-open' : ''}`}
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span>Filtros{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}</span>
                {filtersOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
              </button>
            </div>

            {filtersOpen && (
              <div className="km-filter-grid">
                <div className="field">
                  <label>Palabra clave</label>
                  <input value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} placeholder="Ej. Examen" />
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
                    <option value={3}>3 estrellas o más</option>
                    <option value={4}>4 estrellas o más</option>
                    <option value={5}>Solo 5 estrellas</option>
                  </select>
                </div>
                <div className="field">
                  <label>Ordenar por</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                    <option value="RECIENTES">Más recientes</option>
                    <option value="MEJOR_CALIFICADOS">Mejor calificados</option>
                    <option value="MAS_CONSULTADOS">Más consultados</option>
                  </select>
                </div>
                <div className="field">
                  <label>Colección</label>
                  <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)}>
                    <option value="">Todas las colecciones</option>
                    {colecciones.map((col) => (
                      <option key={col._id} value={col._id}>
                        {col.nombre} ({col.recursos.length})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          <section className="km-resource-grid--fixed">
            {loading ? (
              <CardListSkeleton count={3} bare />
            ) : paginatedRepo.length === 0 ? (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <p className="empty">
                  {items.length === 0
                    ? 'Aún no hay recursos publicados en la plataforma.'
                    : 'No se encontraron recursos con esos filtros.'}
                </p>
              </div>
            ) : (
              paginatedRepo.map((x) => renderResourceCard(x))
            )}
          </section>

          {renderPagination(safeRepoPage, repoTotalPages, filteredRepo.length, setRepoPage)}
        </div>
      )}

      {/* ==================== QUICK MODAL DE OPCIONES Y COMENTARIOS (<dialog>) ==================== */}
      <dialog
        ref={detailDialogRef}
        className="km-quick-dialog"
        {...({ closedby: 'any' } as any)}
        aria-labelledby="km-quick-modal-title"
        onClose={() => {
          if (detailDialogRef.current) detailDialogRef.current.returnValue = '';
          setDetailResourceId(null);
        }}
      >
        {activeDetailResource && (() => {
          const x = activeDetailResource;
          const isOwn = String(x.idUsuario) === String(user?.id);
          const subName = x.idAsignatura ? (subjectMap.get(x.idAsignatura) || 'Asignatura') : 'General';
          const topName = topicMap.get(x.idTema) || 'Tema';
          const hasRealUrl = Boolean(x.archivoUrl && !x.archivoUrl.includes('kolab.local'));

          return (
            <>
              <div className="km-quick-dialog__head">
                <div style={{ minWidth: 0 }}>
                  <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
                    {subName} · {topName}
                  </span>
                  <h2 id="km-quick-modal-title">{x.titulo}</h2>
                  <p className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                    Por <strong>{x.nombreAutor || 'Estudiante'}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="km-quick-dialog__close"
                  onClick={closeQuickModal}
                  aria-label="Cerrar ventana"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="km-quick-dialog__body">
                {quickFeedback && (
                  <div className="td-notice td-notice--ok" role="status">
                    <span>{quickFeedback}</span>
                    <button type="button" className="notice-close" onClick={() => setQuickFeedback('')} aria-label="Cerrar">×</button>
                  </div>
                )}

                <form
                  className="km-quick-dialog__section"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveCollection(x._id, collectionName);
                  }}
                >
                  <label htmlFor="km-col-input" className="km-quick-dialog__label">
                    <FolderHeart size={15} aria-hidden="true" />
                    <span>Guardar en colección</span>
                  </label>
                  <div className="row">
                    <input
                      id="km-col-input"
                      autoFocus
                      value={collectionName}
                      onChange={(e) => setCollectionName(e.target.value)}
                      placeholder="Nombre de colección (ej. Parcial 1)…"
                      className="km-quick-dialog__input"
                    />
                    <button type="submit" className="btn btn--ghost btn--sm" disabled={!collectionName.trim()}>
                      <FolderHeart size={14} aria-hidden="true" />
                      <span>Guardar</span>
                    </button>
                  </div>
                </form>

                <form
                  className="km-quick-dialog__section"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleComment(x._id);
                  }}
                >
                  <label htmlFor="km-comment-input" className="km-quick-dialog__label">
                    <MessageSquare size={15} aria-hidden="true" />
                    <span>Comentarios ({x.comentarios?.length || 0})</span>
                  </label>
                  {x.comentarios?.length ? (
                    <div className="km-quick-dialog__comments">
                      {x.comentarios.map((c, idx) => (
                        <div key={idx} className="km-quick-dialog__comment-item">
                          <p>{c.texto}</p>
                          <span className="muted" style={{ fontSize: '0.74rem' }}>
                            {new Date(c.fecha).toLocaleDateString('es-MX')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: '0.84rem' }}>Aún no hay comentarios. ¡Sé el primero!</p>
                  )}
                  <div className="row" style={{ marginTop: 4 }}>
                    <input
                      id="km-comment-input"
                      value={commentById[x._id] ?? ''}
                      onChange={(e) => setCommentById((p) => ({ ...p, [x._id]: e.target.value }))}
                      placeholder="Escribe un comentario…"
                      className="km-quick-dialog__input"
                    />
                    <button type="submit" className="btn btn--primary btn--sm" disabled={commenting || !(commentById[x._id] || '').trim()}>
                      {commenting ? 'Enviando…' : 'Comentar'}
                    </button>
                  </div>
                </form>

                {(relatedMap[x._id]?.length ?? 0) > 0 && (
                  <div className="km-quick-dialog__section">
                    <span className="km-quick-dialog__label">Relacionados del tema</span>
                    <div className="td-tags">
                      {relatedMap[x._id].map((rel) => (
                        <span key={rel._id} className="td-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {rel.titulo} ({rel.promedioCalificacion.toFixed(1)}
                          <Star size={11} fill="#eab308" color="#eab308" aria-hidden="true" />)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="km-quick-dialog__footer">
                <div className="row">
                  {hasRealUrl && (
                    <a
                      href={x.archivoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--primary btn--sm"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>Abrir documento</span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      closeQuickModal();
                      setReportTarget({ id: x._id, title: x.titulo });
                    }}
                  >
                    <Flag size={14} aria-hidden="true" />
                    <span>Reportar</span>
                  </button>
                  {isOwn && (
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => handleMoveToTrash(x._id)}>
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Papelera</span>
                    </button>
                  )}
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeQuickModal}>
                  Cerrar
                </button>
              </div>
            </>
          );
        })()}
      </dialog>

      <ReportModal
        open={Boolean(reportTarget)}
        targetLabel="Recurso académico"
        targetPreview={reportTarget?.title}
        onClose={() => setReportTarget(null)}
        onSubmit={submitResourceReport}
      />

      {/* ==================== MODAL ANIMADO DE SUBIDA Y CONFIRMACIÓN ==================== */}
      {uploadModal.open && (
        <div
          className="km-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={uploadModal.status === 'uploading' ? 'Subiendo recurso' : 'Recurso subido correctamente'}
        >
          <div className="km-modal-card">
            {uploadModal.status === 'uploading' ? (
              <>
                <div className="km-modal-visual">
                  <div className="km-modal-spinner" aria-hidden="true" />
                  <UploadCloud size={34} className="km-modal-cloud" aria-hidden="true" />
                </div>
                <h3>Subiendo tu recurso…</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  Guardando el archivo y registrando tu aportación en Kolab.
                </p>
                <div className="km-modal-file">{uploadModal.fileName}</div>
                <div className="km-modal-bar" aria-hidden="true">
                  <div className="km-modal-bar__fill" />
                </div>
              </>
            ) : (
              <>
                <div className="km-modal-visual">
                  <div className="km-modal-success-halo" aria-hidden="true" />
                  <div className="km-modal-success-circle">
                    <CheckCircle2 size={38} aria-hidden="true" />
                  </div>
                </div>
                <h3>¡Recurso subido correctamente!</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {uploadModal.isOfficial
                    ? 'Tu material oficial ya está publicado y autorizado automáticamente.'
                    : 'Tu aportación ya está publicada y lista para revisión docente.'}
                </p>
                <div className="km-modal-file">
                  {uploadModal.title} · {uploadModal.fileName}
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setUploadModal((m) => ({ ...m, open: false }));
                      setSection('aportaciones');
                    }}
                  >
                    <FolderOpen size={15} aria-hidden="true" />
                    <span>Ver en Mis aportaciones</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setUploadModal((m) => ({ ...m, open: false }))}
                  >
                    Subir otro
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
