import { CSSProperties, ReactNode } from 'react';
import { KolabModule } from '../data/modules';

interface ModuleBannerProps {
  module: KolabModule;
  children?: ReactNode;
}

export default function ModuleBanner({ module, children }: ModuleBannerProps) {
  const style = { '--c1': module.c1, '--c2': module.c2 } as CSSProperties;
  return (
    <header className={`banner ${module.ink ? 'banner--ink' : ''}`} style={style}>
      <div>
        <p className="banner__kicker">Módulo {module.id}</p>
        <h1>{module.name}</h1>
        <p className="banner__desc">{module.desc}</p>
      </div>
      {children}
    </header>
  );
}
