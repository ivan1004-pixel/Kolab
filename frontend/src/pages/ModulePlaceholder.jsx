import ModuleBanner from '../components/ModuleBanner.jsx';

export default function ModulePlaceholder({ module }) {
  return (
    <>
      <ModuleBanner module={module} />
      <section className="card">
        <h2 className="card__title">En construcción</h2>
        <p className="muted">Este módulo incluirá:</p>
        <ul>{module.features?.map((f) => <li key={f}>{f}</li>)}</ul>
      </section>
    </>
  );
}
