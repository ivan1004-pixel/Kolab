import { useState } from 'react';

const UNITS = [
  {
    id: 'U1',
    label: 'U1',
    topic: 'Modelo Entidad-Relación',
    heightPct: 32,
    color: '#22C55E',
    unvalidatedCount: 4,
    avgScore: '8.9/10',
  },
  {
    id: 'U2',
    label: 'U2',
    topic: 'Normalización 3FN',
    heightPct: 92,
    color: '#EF4444',
    unvalidatedCount: 14,
    avgScore: '7.4/10',
  },
  {
    id: 'U3',
    label: 'U3',
    topic: 'Consultas SQL y JOINs',
    heightPct: 58,
    color: '#F59E0B',
    unvalidatedCount: 8,
    avgScore: '8.2/10',
  },
  {
    id: 'U4',
    label: 'U4',
    topic: 'Índices y Vistas',
    heightPct: 22,
    color: '#22C55E',
    unvalidatedCount: 2,
    avgScore: '9.1/10',
  },
];

const FREQUENT_QUESTIONS = [
  {
    id: 'fq1',
    unitId: 'U2',
    question: '¿Cuándo aplicar 3FN en una tabla con dependencias transitivas?',
    count: 12,
    severity: 'high',
  },
  {
    id: 'fq2',
    unitId: 'U3',
    question: '¿Cuál es la diferencia práctica entre INNER JOIN y LEFT JOIN?',
    count: 9,
    severity: 'mid',
  },
  {
    id: 'fq3',
    unitId: 'U1',
    question: '¿Cómo resolver una relación muchos a muchos en el diagrama?',
    count: 5,
    severity: 'low',
  },
];

const DOUBT_CLUSTERS = [
  {
    id: 'cl1',
    label: 'Normalización (12)',
    size: 112,
    color: '#FCA5A5',
    top: '14%',
    left: '10%',
  },
  {
    id: 'cl2',
    label: 'JOINs SQL (9)',
    size: 74,
    color: '#FDE68A',
    top: '36%',
    left: '48%',
  },
  {
    id: 'cl3',
    label: 'Cardinalidad (5)',
    size: 52,
    color: '#86EFAC',
    top: '12%',
    left: '74%',
  },
  {
    id: 'cl4',
    label: 'Índices (3)',
    size: 36,
    color: '#A5B4FC',
    top: '62%',
    left: '80%',
  },
];

export default function Radar() {
  const [selectedUnitId, setSelectedUnitId] = useState('U2');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [installNotice, setInstallNotice] = useState(null);

  const selectedUnit =
    UNITS.find((u) => u.id === selectedUnitId) ?? UNITS[1];

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
          <p className="banner-subtitle">
            Dónde se atoran tus estudiantes y cómo instalar KOLAB
          </p>
        </div>

        <button
          type="button"
          className="btn-banner-action"
          onClick={handleInstallClick}
        >
          {pwaInstalled ? 'KOLAB instalado ✓' : 'Instalar KOLAB'}
        </button>
      </section>

      {installNotice && (
        <div className="module6-notice" role="status">
          <span>{installNotice}</span>
          <button
            type="button"
            className="notice-close"
            onClick={() => setInstallNotice(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <article className="kpi-card kpi-red">
          <span className="kpi-label">Tema con más dudas</span>
          <strong className="kpi-value">{selectedUnit.topic}</strong>
        </article>

        <article className="kpi-card kpi-amber">
          <span className="kpi-label">Preguntas sin validar</span>
          <strong className="kpi-value">
            {String(selectedUnit.unvalidatedCount).padStart(2, '0')}
          </strong>
        </article>

        <article className="kpi-card kpi-teal">
          <span className="kpi-label">Promedio de cuestionarios</span>
          <strong className="kpi-value">{selectedUnit.avgScore}</strong>
        </article>
      </div>

      <div className="module8-grid">
        <section className="kolab-card" aria-label="Dificultad por unidad">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Dificultad por unidad</h2>
            <span className="quiz-topic-chip">Unidad {selectedUnit.id}</span>
          </header>

          <div className="unit-chart">
            {UNITS.map((unit) => {
              const isSelected = unit.id === selectedUnitId;
              return (
                <button
                  key={unit.id}
                  type="button"
                  className={`unit-bar-col ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedUnitId(unit.id)}
                  title={`${unit.id}: ${unit.topic}`}
                >
                  <div className="unit-bar-track">
                    <div
                      className="unit-bar-fill"
                      style={{
                        height: `${unit.heightPct}%`,
                        backgroundColor: unit.color,
                      }}
                    />
                  </div>
                  <span className="unit-bar-label">{unit.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="kolab-card" aria-label="Grupos de dudas (clustering)">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Grupos de dudas (clustering)</h2>
            {selectedCluster && (
              <span className="quiz-topic-chip">{selectedCluster}</span>
            )}
          </header>

          <div className="cluster-canvas">
            {DOUBT_CLUSTERS.map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                className="cluster-bubble"
                style={{
                  width: `${cluster.size}px`,
                  height: `${cluster.size}px`,
                  backgroundColor: cluster.color,
                  top: cluster.top,
                  left: cluster.left,
                }}
                onClick={() => setSelectedCluster(cluster.label)}
                title={cluster.label}
                aria-label={cluster.label}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="module8-grid">
        <section className="kolab-card" aria-label="Preguntas frecuentes">
          <header className="card-header-row">
            <h2 className="card-title">Preguntas frecuentes</h2>
          </header>

          <div className="faq-list">
            {FREQUENT_QUESTIONS.map((item, idx) => (
              <div
                key={item.id}
                className={`faq-row ${idx === 1 ? 'is-highlighted' : ''}`}
              >
                <span className="faq-question">{item.question}</span>
                <span className={`faq-count-pill severity-${item.severity}`}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="kolab-card" aria-label="PWA y almacenamiento">
          <header className="card-header-row">
            <h2 className="card-title">PWA y almacenamiento</h2>
          </header>

          <div className="pwa-box">
            <div className="pwa-ring" aria-label="Uso de caché 42%">
              <div className="pwa-ring-inner">Caché</div>
            </div>

            <div className="pwa-info">
              <span className="pwa-status-pill">Service Worker activo</span>
              <p className="pwa-desc">Recursos consultados con carga rápida</p>
              <button
                type="button"
                className="btn-outline-green"
                onClick={handleInstallClick}
              >
                {pwaInstalled ? 'Instalado en dispositivo ✓' : 'Instalar en mi móvil'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
