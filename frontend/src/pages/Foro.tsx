import { ChangeEvent, FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import ModuleBanner from '../components/ModuleBanner';

interface RespuestaItem {
  id: number;
  autor: string;
  texto: string;
  validada: boolean;
}

interface PreguntaItem {
  id: number;
  titulo: string;
  detalle: string;
  asignatura: string;
  autor: string;
  respuestas: RespuestaItem[];
}

const SEED: PreguntaItem[] = [
  { id: 1, titulo: '¿Cuál es la diferencia entre clave primaria y foránea?', detalle: 'No me queda claro cuándo usar cada una.', asignatura: 'Bases de datos', autor: 'Estudiante', respuestas: [
    { id: 1, autor: 'Compañero', texto: 'La primaria identifica un registro de forma única; la foránea apunta a la primaria de otra tabla.', validada: false },
  ] },
  { id: 2, titulo: '¿Cómo derivo una función compuesta?', detalle: 'Me pierdo con la regla de la cadena.', asignatura: 'Cálculo', autor: 'Estudiante', respuestas: [] },
];

export default function Foro() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();
  const [preguntas, setPreguntas] = useState<PreguntaItem[]>(SEED);
  const [form, setForm] = useState({ titulo: '', detalle: '', asignatura: '' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      assertNoScriptInjection(form, 'foro');
    } catch (err: any) {
      return setError(err.message);
    }
    if (form.titulo.trim().length < 8) return setError('Escribe tu pregunta con un poco más de detalle');
    setPreguntas((p) => [{ id: Date.now(), ...form, titulo: form.titulo.trim(), autor: user?.nombre ?? 'Estudiante', respuestas: [] }, ...p]);
    setForm({ titulo: '', detalle: '', asignatura: '' });
    setError('');
    setShowForm(false);
  }

  const responder = (id: number, texto: string) =>
    setPreguntas((p) => p.map((x) => x.id === id
      ? { ...x, respuestas: [...x.respuestas, { id: Date.now(), autor: user?.nombre ?? 'Estudiante', texto, validada: false }] } : x));

  const validar = (qid: number, rid: number) =>
    setPreguntas((p) => p.map((x) => x.id === qid
      ? { ...x, respuestas: x.respuestas.map((r) => (r.id === rid ? { ...r, validada: true } : r)) } : x));

  const puedeValidar = user?.rol === 'docente' || user?.rol === 'admin';
  const lista = preguntas.filter((x) => `${x.titulo} ${x.detalle} ${x.asignatura}`.toLowerCase().includes(q));

  return (
    <>
      <ModuleBanner module={MODULES[3]}>
        <button className="btn btn--action" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cerrar' : 'Nueva pregunta'}
        </button>
      </ModuleBanner>

      {showForm && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2 className="card__title">Nueva pregunta</h2>
          <div className="field">
            <label htmlFor="titulo">Pregunta</label>
            <input id="titulo" name="titulo" value={form.titulo} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="detalle">Detalle o fragmento que no entendiste</label>
            <textarea id="detalle" name="detalle" value={form.detalle} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="asignatura">Asignatura</label>
            <input id="asignatura" name="asignatura" value={form.asignatura} onChange={onChange} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row"><button className="btn btn--primary">Publicar</button></div>
        </form>
      )}

      {q && <p className="muted">Resultados para “{params.get('q')}”</p>}
      {lista.length === 0 && <p className="empty">No hay preguntas todavía. ¡Sé el primero en preguntar!</p>}
      {lista.map((p) => <Pregunta key={p.id} p={p} puedeValidar={puedeValidar} onResponder={responder} onValidar={validar} />)}
    </>
  );
}

function Pregunta({
  p,
  puedeValidar,
  onResponder,
  onValidar,
}: {
  p: PreguntaItem;
  puedeValidar: boolean;
  onResponder: (id: number, texto: string) => void;
  onValidar: (qid: number, rid: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const [respError, setRespError] = useState('');
  const resuelta = p.respuestas.some((r) => r.validada);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    try {
      assertNoScriptInjection(texto, 'respuesta');
      setRespError('');
    } catch (err: any) {
      return setRespError(err.message);
    }
    onResponder(p.id, texto.trim());
    setTexto('');
  }

  return (
    <article className="card question">
      <div className="question__head">
        <div>
          <h2>{p.titulo}</h2>
          <p className="muted">{p.asignatura || 'Sin asignatura'} · {p.autor}</p>
        </div>
        <span className={`chip ${resuelta ? 'chip--soft' : 'chip--danger'}`}>{resuelta ? 'Resuelta' : 'Sin resolver'}</span>
      </div>
      {p.detalle && <p>{p.detalle}</p>}

      <div className="answers">
        {p.respuestas.map((r) => (
          <div className="answer" key={r.id}>
            <p>{r.texto}</p>
            <div className="row">
              <span className="muted">{r.autor}</span>
              {r.validada
                ? <span className="chip chip--solid">✓ Revisado por docente</span>
                : puedeValidar && <button className="btn btn--ghost btn--sm" onClick={() => onValidar(p.id, r.id)}>Validar</button>}
            </div>
          </div>
        ))}
        <form className="row" onSubmit={enviar}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label className="sr-only" htmlFor={`r-${p.id}`}>Tu respuesta</label>
            <input id={`r-${p.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu respuesta…" />
          </div>
          <button className="btn btn--primary btn--sm">Responder</button>
        </form>
        {respError && <p className="form-error" role="alert">{respError}</p>}
      </div>
    </article>
  );
}
