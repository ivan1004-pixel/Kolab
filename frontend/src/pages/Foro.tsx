import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import ModuleBanner from '../components/ModuleBanner';

interface RespuestaItem {
  _id: string;
  idPregunta: string;
  idUsuario: string;
  texto: string;
  esValida: boolean;
  votosUtilidad: number;
  createdAt: string;
}

interface PreguntaItem {
  _id: string;
  texto: string;
  idTema: string;
  idUsuario: string;
  resuelta: boolean;
  validadaPorDocente: boolean;
  votosUtilidad: number;
  etiquetas: string[];
  fragmentoRecurso?: string;
  createdAt: string;
  respuestas: RespuestaItem[];
}

interface TemaItem {
  _id: string;
  titulo: string;
}

export default function Foro() {
  const { user, token } = useAuth();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();

  const [preguntas, setPreguntas] = useState<PreguntaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ texto: '', fragmento: '', idTema: '' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadForo = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await gqlRequest<{
        preguntas: Array<Omit<PreguntaItem, 'respuestas'>>;
        temas: TemaItem[];
      }>(
        `query ForoData {
          preguntas {
            _id texto idTema idUsuario resuelta validadaPorDocente votosUtilidad etiquetas fragmentoRecurso createdAt
          }
          temas { _id titulo }
        }`,
        {},
        token,
      );
      const rawPreguntas = data.preguntas ?? [];
      const temaList = data.temas ?? [];
      setTemas(temaList);
      if (temaList.length > 0 && !form.idTema) {
        setForm((f) => ({ ...f, idTema: temaList[0]._id }));
      }

      const respuestasList = await Promise.all(
        rawPreguntas.map((p) =>
          gqlRequest<{ respuestas: RespuestaItem[] }>(
            `query Respuestas($id: ID!) {
              respuestas(idPregunta: $id) { _id idPregunta idUsuario texto esValida votosUtilidad createdAt }
            }`,
            { id: p._id },
            token,
          )
            .then((r) => r.respuestas ?? [])
            .catch(() => []),
        ),
      );

      setPreguntas(
        rawPreguntas.map((p, idx) => ({
          ...p,
          respuestas: respuestasList[idx] ?? [],
        })),
      );
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las preguntas del foro.');
    } finally {
      setLoading(false);
    }
  }, [token, form.idTema]);

  useEffect(() => {
    loadForo();
  }, [loadForo]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      assertNoScriptInjection(form, 'foro');
    } catch (err: any) {
      return setError(err.message);
    }
    if (form.texto.trim().length < 8) return setError('Escribe tu pregunta con un poco más de detalle');
    if (!form.idTema) return setError('Selecciona un tema para publicar tu pregunta.');

    try {
      const res = await gqlRequest<{ crearPregunta: Omit<PreguntaItem, 'respuestas'> }>(
        `mutation CrearPregunta($idTema: ID!, $texto: String!, $fragmento: String) {
          crearPregunta(idTema: $idTema, texto: $texto, fragmentoRecurso: $fragmento) {
            _id texto idTema idUsuario resuelta validadaPorDocente votosUtilidad etiquetas fragmentoRecurso createdAt
          }
        }`,
        {
          idTema: form.idTema,
          texto: form.texto.trim(),
          ...(form.fragmento.trim() ? { fragmento: form.fragmento.trim() } : {}),
        },
        token,
      );
      setPreguntas((p) => [{ ...res.crearPregunta, respuestas: [] }, ...p]);
      setForm((f) => ({ ...f, texto: '', fragmento: '' }));
      setError('');
      setShowForm(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo publicar la pregunta.');
    }
  }

  async function responder(idPregunta: string, texto: string) {
    if (!token) return;
    const res = await gqlRequest<{ responderPregunta: RespuestaItem }>(
      `mutation Responder($idPregunta: ID!, $texto: String!) {
        responderPregunta(idPregunta: $idPregunta, texto: $texto) {
          _id idPregunta idUsuario texto esValida votosUtilidad createdAt
        }
      }`,
      { idPregunta, texto },
      token,
    );
    setPreguntas((p) =>
      p.map((x) => (x._id === idPregunta ? { ...x, respuestas: [...x.respuestas, res.responderPregunta] } : x)),
    );
  }

  async function validar(qid: string, rid: string) {
    if (!token) return;
    await gqlRequest(
      `mutation MarcarRelevante($id: ID!) {
        marcarRespuestaRelevante(respuestaId: $id) { _id esValida }
      }`,
      { id: rid },
      token,
    );
    setPreguntas((p) =>
      p.map((x) =>
        x._id === qid
          ? { ...x, resuelta: true, respuestas: x.respuestas.map((r) => (r._id === rid ? { ...r, esValida: true } : r)) }
          : x,
      ),
    );
  }

  const puedeValidar = user?.rol === 'docente' || user?.rol === 'admin';
  const lista = preguntas.filter((x) => {
    const temaNombre = temaMap.get(x.idTema) ?? '';
    return `${x.texto} ${x.fragmentoRecurso ?? ''} ${temaNombre}`.toLowerCase().includes(q);
  });

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
            <label htmlFor="idTema">Tema</label>
            <select id="idTema" name="idTema" value={form.idTema} onChange={onChange}>
              {temas.length === 0 && <option value="">Sin temas disponibles</option>}
              {temas.map((t) => (
                <option key={t._id} value={t._id}>{t.titulo}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="texto">Pregunta</label>
            <input id="texto" name="texto" value={form.texto} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="fragmento">Detalle o fragmento que no entendiste (opcional)</label>
            <textarea id="fragmento" name="fragmento" value={form.fragmento} onChange={onChange} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row"><button className="btn btn--primary" disabled={!form.idTema}>Publicar</button></div>
        </form>
      )}

      {q && <p className="muted">Resultados para “{params.get('q')}”</p>}
      {loading ? (
        <p className="muted">Cargando preguntas del foro…</p>
      ) : lista.length === 0 ? (
        <p className="empty">
          {preguntas.length === 0
            ? 'No hay preguntas todavía. ¡Sé el primero en preguntar!'
            : 'No se encontraron preguntas que coincidan con tu búsqueda.'}
        </p>
      ) : (
        lista.map((p) => (
          <Pregunta
            key={p._id}
            p={p}
            temaNombre={temaMap.get(p.idTema) || 'Tema general'}
            puedeValidar={puedeValidar}
            onResponder={responder}
            onValidar={validar}
          />
        ))
      )}
    </>
  );
}

function Pregunta({
  p,
  temaNombre,
  puedeValidar,
  onResponder,
  onValidar,
}: {
  p: PreguntaItem;
  temaNombre: string;
  puedeValidar: boolean;
  onResponder: (id: string, texto: string) => Promise<void>;
  onValidar: (qid: string, rid: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [respError, setRespError] = useState('');
  const resuelta = p.resuelta || p.respuestas.some((r) => r.esValida);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    try {
      assertNoScriptInjection(texto, 'respuesta');
      setRespError('');
      await onResponder(p._id, texto.trim());
      setTexto('');
    } catch (err: any) {
      setRespError(err.message || 'No se pudo enviar tu respuesta.');
    }
  }

  return (
    <article className="card question">
      <div className="question__head">
        <div>
          <span className="chip chip--soft">{temaNombre}</span>
          <h2 style={{ marginTop: '0.4rem' }}>{p.texto}</h2>
          {p.fragmentoRecurso && <p className="muted">{p.fragmentoRecurso}</p>}
        </div>
        <span className={`chip ${resuelta ? 'chip--solid' : 'chip--xp'}`}>
          {resuelta ? '✓ Resuelta' : 'Abierta'}
        </span>
      </div>

      {p.respuestas.length > 0 && (
        <div className="answers">
          {p.respuestas.map((r) => (
            <div className="answer" key={r._id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Respuesta de la comunidad</strong>
                {r.esValida && <span className="chip chip--solid">✓ Validada</span>}
              </div>
              <p>{r.texto}</p>
              {puedeValidar && !r.esValida && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => onValidar(p._id, r._id)}
                >
                  Validar respuesta
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="row" onSubmit={enviar}>
        <label className="sr-only" htmlFor={`r-${p._id}`}>Responder</label>
        <input
          id={`r-${p._id}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una respuesta útil…"
          style={{ flex: 1, minHeight: 44, padding: '0 1rem', borderRadius: 14, border: '2px solid var(--borde)' }}
        />
        <button className="btn btn--primary btn--sm">Responder</button>
      </form>
      {respError && <p className="form-error" role="alert">{respError}</p>}
    </article>
  );
}
