import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { downloadCsv, escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';
import { ChartSkeleton } from '../components/Skeleton';
import {
  clearPwaCache,
  PwaState,
  refreshCacheCount,
  subscribePwa,
  triggerPwaInstall,
} from '../utils/pwa';

interface RadarItem {
  idTema: string;
  totalPreguntas: number;
  preguntasSinResolver: number;
  erroresAutoevaluacion: number;
  conceptosDebiles: string[];
  preguntaMasDebatidaSinSolucion?: {
    _id: string;
    texto: string;
    votosUtilidad: number;
  } | null;
}

interface TemaItem {
  _id: string;
  titulo: string;
}

interface IntentoItem {
  _id: string;
  calificacion: number;
}

export default function Radar() {
  const { user, token } = useAuth();
  const isTeacher = user?.rol === 'docente' || user?.rol === 'admin';
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [intentos, setIntentos] = useState<IntentoItem[]>([]);
  const [selectedTemaId, setSelectedTemaId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pwa, setPwa] = useState<PwaState>({
    supported: true,
    swActive: false,
    canInstall: false,
    isInstalled: false,
    isOnline: true,
    cachedCount: 0,
  });
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  const loadRadar = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await gqlRequest<{
        radarDificultades: RadarItem[];
        temas: TemaItem[];
        miHistorialCuestionarios: IntentoItem[];
      }>(
        `query RadarData {
          radarDificultades {
            idTema
            totalPreguntas
            preguntasSinResolver
            erroresAutoevaluacion
            conceptosDebiles
            preguntaMasDebatidaSinSolucion { _id texto votosUtilidad }
          }
          temas { _id titulo }
          miHistorialCuestionarios { _id calificacion }
        }`,
        {},
        token,
      );
      const list = data.radarDificultades ?? [];
      setRadar(list);
      setTemas(data.temas ?? []);
      setIntentos(data.miHistorialCuestionarios ?? []);
      if (list.length > 0 && !selectedTemaId) {
        setSelectedTemaId(list[0].idTema);
      }
    } catch {
      // Silenciar error si aún no hay datos
    } finally {
      setLoading(false);
    }
  }, [token, selectedTemaId]);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  useEffect(() => {
    const unsub = subscribePwa(setPwa);
    refreshCacheCount();
    return unsub;
  }, []);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const selectedUnit = radar.find((r) => r.idTema === selectedTemaId) ?? radar[0] ?? null;

  const avgQuizScore = useMemo(() => {
    if (intentos.length === 0) return 'Sin datos';
    const sum = intentos.reduce((acc, i) => acc + i.calificacion, 0);
    return `${(sum / intentos.length / 10).toFixed(1)}/10`;
  }, [intentos]);

  const maxQuestions = Math.max(1, ...radar.map((r) => r.totalPreguntas));

  async function handleInstallClick() {
    if (pwa.isInstalled) {
      setInstallNotice('KOLAB ya está instalado y funcionando en modo aplicación.');
      return;
    }
    const outcome = await triggerPwaInstall();
    if (outcome === 'accepted') {
      setInstallNotice('¡KOLAB se instaló correctamente en tu dispositivo!');
    } else if (outcome === 'dismissed') {
      setInstallNotice('Instalación cancelada. Puedes volver a intentarlo cuando quieras.');
    } else {
      setInstallNotice(
        'Para instalar KOLAB, usa la opción «Instalar aplicación» en la barra de direcciones (Chrome/Edge) o «Añadir a pantalla de inicio» en Safari iOS.',
      );
    }
  }

  async function handleClearCache() {
    await clearPwaCache();
    setInstallNotice('Caché sin conexión limpiada correctamente.');
  }

  return (
    <div className="module8-wrap">
      <section className="module-banner module-banner-teal" aria-label="Encabezado del Módulo 8">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <span className="banner-pill">Módulo 8</span>
          <h1 className="banner-title">Radar de dificultades e infraestructura PWA</h1>
          <p className="banner-subtitle">Dónde se atoran los estudiantes y acceso sin conexión</p>
        </div>

        <button type="button" className="btn-banner-action" onClick={handleInstallClick}>
          {pwa.isInstalled ? (
            <span className="inline-icon-row"><CheckCircle2 size={15} aria-hidden="true" /> KOLAB instalado</span>
          ) : pwa.canInstall ? (
            'Instalar KOLAB'
          ) : (
            'Cómo instalar PWA'
          )}
        </button>
      </section>

      {installNotice && (
        <div className="module6-notice" role="status">
          <span>{installNotice}</span>
          <button type="button" className="notice-close" onClick={() => setInstallNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <div className="kpi-grid">
        <article className="kpi-card kpi-red">
          <span className="kpi-label">Tema con más dudas</span>
          <strong className="kpi-value">
            {selectedUnit ? (temaMap.get(selectedUnit.idTema) || 'Tema') : 'Sin datos aún'}
          </strong>
        </article>
        <article className="kpi-card kpi-amber">
          <span className="kpi-label">Preguntas sin resolver</span>
          <strong className="kpi-value">
            {selectedUnit ? String(selectedUnit.preguntasSinResolver).padStart(2, '0') : '00'}
          </strong>
        </article>
        <article className="kpi-card kpi-teal">
          <span className="kpi-label">Promedio de cuestionarios</span>
          <strong className="kpi-value">{avgQuizScore}</strong>
        </article>
      </div>

      <div className="module8-grid">
        <section className="kolab-card" aria-label="Dificultad por tema">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Dificultad por tema</h2>
            {selectedUnit && <span className="quiz-topic-chip">{temaMap.get(selectedUnit.idTema) || 'Tema'}</span>}
          </header>

          {loading ? (
            <ChartSkeleton bars={6} />
          ) : radar.length === 0 ? (
            <p className="empty">Todavía no hay suficientes preguntas registradas para generar el radar.</p>
          ) : (
            <div className="unit-chart">
              {radar.map((item, idx) => {
                const isSelected = item.idTema === selectedUnit?.idTema;
                const heightPct = Math.max(18, Math.round((item.totalPreguntas / maxQuestions) * 100));
                const color = item.preguntasSinResolver > 3 ? '#EF4444' : item.preguntasSinResolver > 0 ? '#F59E0B' : '#22C55E';
                const label = temaMap.get(item.idTema) || `T${idx + 1}`;
                return (
                  <button
                    key={item.idTema}
                    type="button"
                    className={`unit-bar-col ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedTemaId(item.idTema)}
                    title={`${label}: ${item.totalPreguntas} preguntas`}
                  >
                    <div className="unit-bar-track">
                      <div className="unit-bar-fill" style={{ height: `${heightPct}%`, backgroundColor: color }} />
                    </div>
                    <span className="unit-bar-label">{label.slice(0, 8)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="kolab-card" aria-label="Preguntas sin resolver destacadas">
          <header className="card-header-row">
            <h2 className="card-title">Dudas más debatidas y errores</h2>
            {isTeacher && radar.length > 0 && (
              <div className="row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    downloadCsv(
                      `kolab-radar-${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Tema', 'Total Preguntas', 'Sin Resolver', 'Errores Quiz', 'Conceptos Débiles', 'Pregunta más debatida'],
                      radar.map((r) => [
                        temaMap.get(r.idTema) || r.idTema,
                        r.totalPreguntas,
                        r.preguntasSinResolver,
                        r.erroresAutoevaluacion,
                        (r.conceptosDebiles || []).join(' | '),
                        r.preguntaMasDebatidaSinSolucion?.texto || '',
                      ]),
                    )
                  }
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    exportHtmlToPdf(
                      'Reporte del Radar de Dificultades',
                      `<table><thead><tr><th>Tema</th><th>Preguntas</th><th>Sin resolver</th><th>Errores Quiz</th><th>Pregunta más debatida</th></tr></thead><tbody>${radar
                        .map(
                          (r) =>
                            `<tr><td>${escapeHtml(temaMap.get(r.idTema) || r.idTema)}</td><td>${r.totalPreguntas}</td><td>${r.preguntasSinResolver}</td><td>${r.erroresAutoevaluacion}</td><td>${escapeHtml(r.preguntaMasDebatidaSinSolucion?.texto || '—')}</td></tr>`,
                        )
                        .join('')}</tbody></table>`,
                    )
                  }
                >
                  PDF
                </button>
              </div>
            )}
          </header>

          {selectedUnit && selectedUnit.conceptosDebiles?.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                Errores de autoevaluación en <strong>{temaMap.get(selectedUnit.idTema) || 'este tema'}</strong>: {selectedUnit.erroresAutoevaluacion}
              </span>
              <div className="td-tags" style={{ marginTop: 4 }}>
                {selectedUnit.conceptosDebiles.map((c, idx) => <span key={idx} className="td-tag">{c}</span>)}
              </div>
            </div>
          )}

          {radar.filter((r) => r.preguntaMasDebatidaSinSolucion).length === 0 ? (
            <p className="empty">No hay dudas pendientes de solución en este momento.</p>
          ) : (
            <div className="faq-list">
              {radar
                .filter((r) => r.preguntaMasDebatidaSinSolucion)
                .map((item) => (
                  <div key={item.idTema} className="faq-row">
                    <span className="faq-question">{item.preguntaMasDebatidaSinSolucion!.texto}</span>
                    <span className="faq-count-pill severity-mid">
                      {item.preguntasSinResolver}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      <section className="kolab-card" aria-label="PWA y almacenamiento">
        <header className="card-header-row">
          <h2 className="card-title">PWA y almacenamiento</h2>
          <span className={`chip ${pwa.isOnline ? 'chip--soft' : 'chip--xp'}`}>
            {pwa.isOnline ? 'En línea' : 'Sin conexión'}
          </span>
        </header>
        <div className="pwa-box">
          <div className="pwa-ring" aria-label="Estado PWA">
            <div className="pwa-ring-inner">{pwa.cachedCount}</div>
          </div>
          <div className="pwa-info">
            <span className="pwa-status-pill">
              {!pwa.supported
                ? 'Navegador sin Service Worker'
                : pwa.swActive
                  ? 'Service Worker activo'
                  : 'Registrando Service Worker…'}
            </span>
            <p className="pwa-desc">
              {pwa.cachedCount} recursos en caché para carga rápida y soporte sin conexión.
            </p>
            <div className="row">
              <button type="button" className="btn-outline-green" onClick={handleInstallClick}>
                {pwa.isInstalled ? (
                  <span className="inline-icon-row"><CheckCircle2 size={15} aria-hidden="true" /> Instalado en dispositivo</span>
                ) : pwa.canInstall ? (
                  'Instalar en mi dispositivo'
                ) : (
                  'Cómo instalar'
                )}
              </button>
              {pwa.cachedCount > 0 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleClearCache}>
                  Limpiar caché
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
