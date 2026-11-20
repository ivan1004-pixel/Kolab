import ModuleBanner from '../components/ModuleBanner';
import { KolabModule } from '../data/modules';

export default function ModulePlaceholder({ module }: { module: KolabModule }) {
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
