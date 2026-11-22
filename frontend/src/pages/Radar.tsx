import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';

interface RadarItem {
  idTema: string;
  totalPreguntas: number;
  preguntasSinResolver: number;
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
  const { token } = useAuth();
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [intentos, setIntentos] = useState<IntentoItem[]>([]);
  const [selectedTemaId, setSelectedTemaId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pwaInstalled, setPwaInstalled] = useState(false);
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

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const selectedUnit = radar.find((r) => r.idTema === selectedTemaId) ?? radar[0] ?? null;

  const avgQuizScore = useMemo(() => {
    if (intentos.length === 0) return 'Sin datos';
    const sum = intentos.reduce((acc, i) => acc + i.calificacion, 0);
    return `${(sum / intentos.length / 10).toFixed(1)}/10`;
  }, [intentos]);

  const maxQuestions = Math.max(1, ...radar.map((r) => r.totalPreguntas));

  function handleInstallClick() {
    setPwaInstalled(true);
    setInstallNotice(
      'KOLAB está listo para instalarse como PWA y consultar tus apuntes en caché sin conexión.',
    );
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
          {pwaInstalled ? 'KOLAB instalado ✓' : 'Instalar KOLAB'}
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
            <p className="muted">Calculando radar de dificultades…</p>
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
            <h2 className="card-title">Dudas más debatidas</h2>
          </header>

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
        </header>
        <div className="pwa-box">
          <div className="pwa-ring" aria-label="Estado PWA"><div className="pwa-ring-inner">PWA</div></div>
          <div className="pwa-info">
            <span className="pwa-status-pill">Modo aplicación disponible</span>
            <p className="pwa-desc">Instala KOLAB en tu dispositivo para acceder rápidamente.</p>
            <button type="button" className="btn-outline-green" onClick={handleInstallClick}>
              {pwaInstalled ? 'Instalado en dispositivo ✓' : 'Instalar en mi móvil'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
