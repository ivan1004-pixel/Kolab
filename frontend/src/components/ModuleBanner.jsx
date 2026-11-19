export default function ModuleBanner({ module, children }) {
  return (
    <header className={`banner ${module.ink ? 'banner--ink' : ''}`} style={{ '--c1': module.c1, '--c2': module.c2 }}>
      <div>
        <p className="banner__kicker">Módulo {module.id}</p>
        <h1>{module.name}</h1>
        <p className="banner__desc">{module.desc}</p>
      </div>
      {children}
    </header>
  );
}
