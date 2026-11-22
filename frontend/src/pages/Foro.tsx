import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import ModuleBanner from '../components/ModuleBanner';
import { CardListSkeleton } from '../components/Skeleton';

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
  esBancoColaborativo: boolean;
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
  const [onlyBank, setOnlyBank] = useState(false);
  const [form, setForm] = useState({
    texto: '',
    fragmento: '',
    etiquetas: '',
    idTema: '',
    esBancoColaborativo: false,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
            _id texto idTema idUsuario resuelta esBancoColaborativo validadaPorDocente votosUtilidad etiquetas fragmentoRecurso createdAt
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

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

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

    const etiquetas = form.etiquetas
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await gqlRequest<{ crearPregunta: Omit<PreguntaItem, 'respuestas'> }>(
        `mutation CrearPregunta($idTema: ID!, $texto: String!, $fragmento: String, $etiquetas: [String!], $banco: Boolean) {
          crearPregunta(idTema: $idTema, texto: $texto, fragmentoRecurso: $fragmento, etiquetas: $etiquetas, esBancoColaborativo: $banco) {
            _id texto idTema idUsuario resuelta esBancoColaborativo validadaPorDocente votosUtilidad etiquetas fragmentoRecurso createdAt
          }
        }`,
        {
          idTema: form.idTema,
          texto: form.texto.trim(),
          ...(form.fragmento.trim() ? { fragmento: form.fragmento.trim() } : {}),
          etiquetas,
          banco: form.esBancoColaborativo,
        },
        token,
      );
      setPreguntas((p) => [{ ...res.crearPregunta, respuestas: [] }, ...p]);
      setForm((f) => ({ ...f, texto: '', fragmento: '', etiquetas: '', esBancoColaborativo: false }));
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

  async function cerrarResuelta(qid: string) {
    if (!token) return;
    await gqlRequest(`mutation Cerrar($id: ID!) { cerrarPreguntaResuelta(preguntaId: $id) { _id resuelta } }`, { id: qid }, token);
    setPreguntas((p) => p.map((x) => (x._id === qid ? { ...x, resuelta: true } : x)));
  }

  async function validarBanco(qid: string) {
    if (!token) return;
    await gqlRequest(`mutation ValidarBanco($id: ID!) { validarPreguntaBanco(preguntaId: $id) { _id validadaPorDocente } }`, { id: qid }, token);
    setPreguntas((p) => p.map((x) => (x._id === qid ? { ...x, validadaPorDocente: true } : x)));
  }

  async function votarPregunta(qid: string) {
    if (!token) return;
    const res = await gqlRequest<{ votarPregunta: { votosUtilidad: number } }>(
      `mutation VotarP($id: ID!) { votarPregunta(preguntaId: $id) { votosUtilidad } }`,
      { id: qid },
      token,
    );
    setPreguntas((p) => p.map((x) => (x._id === qid ? { ...x, votosUtilidad: res.votarPregunta.votosUtilidad } : x)));
  }

  async function votarRespuesta(qid: string, rid: string) {
    if (!token) return;
    const res = await gqlRequest<{ votarRespuesta: { votosUtilidad: number } }>(
      `mutation VotarR($id: ID!) { votarRespuesta(respuestaId: $id) { votosUtilidad } }`,
      { id: rid },
      token,
    );
    setPreguntas((p) =>
      p.map((x) =>
        x._id === qid
          ? { ...x, respuestas: x.respuestas.map((r) => (r._id === rid ? { ...r, votosUtilidad: res.votarRespuesta.votosUtilidad } : r)) }
          : x,
      ),
    );
  }

  async function reportarPregunta(qid: string) {
    if (!token) return;
    const motivo = window.prompt('Motivo del reporte (contenido inapropiado o inexacto):');
    if (!motivo?.trim()) return;
    assertNoScriptInjection(motivo, 'reporte');
    await gqlRequest(
      `mutation ReportarP($id: ID!, $motivo: String!) {
        reportarContenido(tipoObjetivo: "Pregunta", idObjetivo: $id, motivo: $motivo) { _id }
      }`,
      { id: qid, motivo: motivo.trim() },
      token,
    );
    setNotice('Pregunta reportada a moderación.');
  }

  const puedeValidar = user?.rol === 'docente' || user?.rol === 'admin';
  const lista = preguntas.filter((x) => {
    if (onlyBank && !x.esBancoColaborativo) return false;
    const temaNombre = temaMap.get(x.idTema) ?? '';
    return `${x.texto} ${x.fragmentoRecurso ?? ''} ${x.etiquetas.join(' ')} ${temaNombre}`.toLowerCase().includes(q);
  });

  return (
    <>
      <ModuleBanner module={MODULES[3]}>
        <div className="row">
          <button
            type="button"
            className={`btn btn--sm ${onlyBank ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setOnlyBank((b) => !b)}
          >
            {onlyBank ? '✓ Banco colaborativo' : 'Ver banco colaborativo'}
          </button>
          <button className="btn btn--action" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cerrar' : 'Nueva pregunta'}
          </button>
        </div>
      </ModuleBanner>

      {notice && <p className="form-ok" role="status">{notice}</p>}

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
            <label htmlFor="fragmento">Detalle o fragmento del recurso que no entendiste (RF-15)</label>
            <textarea id="fragmento" name="fragmento" value={form.fragmento} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="etiquetas">Etiquetas separadas por coma</label>
            <input id="etiquetas" name="etiquetas" value={form.etiquetas} onChange={onChange} placeholder="SQL, parcial 1" />
          </div>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" name="esBancoColaborativo" checked={form.esBancoColaborativo} onChange={onChange} />
            <span>Compartir también en el <strong>Banco Colaborativo de preguntas</strong> (RF-46)</span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row"><button className="btn btn--primary" disabled={!form.idTema}>Publicar</button></div>
        </form>
      )}

      {q && <p className="muted">Resultados para “{params.get('q')}”</p>}
      {loading ? (
        <CardListSkeleton count={3} />
      ) : lista.length === 0 ? (
        <p className="empty">
          {preguntas.length === 0
            ? 'No hay preguntas todavía. ¡Sé el primero en preguntar!'
            : 'No se encontraron preguntas con esos criterios.'}
        </p>
      ) : (
        lista.map((p) => (
          <Pregunta
            key={p._id}
            p={p}
            currentUserId={String(user?.id ?? '')}
            temaNombre={temaMap.get(p.idTema) || 'Tema general'}
            puedeValidar={puedeValidar}
            onResponder={responder}
            onValidar={validar}
            onCerrar={cerrarResuelta}
            onValidarBanco={validarBanco}
            onVotarPregunta={votarPregunta}
            onVotarRespuesta={votarRespuesta}
            onReportar={reportarPregunta}
          />
        ))
      )}
    </>
  );
}

function Pregunta({
  p,
  currentUserId,
  temaNombre,
  puedeValidar,
  onResponder,
  onValidar,
  onCerrar,
  onValidarBanco,
  onVotarPregunta,
  onVotarRespuesta,
  onReportar,
}: {
  p: PreguntaItem;
  currentUserId: string;
  temaNombre: string;
  puedeValidar: boolean;
  onResponder: (id: string, texto: string) => Promise<void>;
  onValidar: (qid: string, rid: string) => Promise<void>;
  onCerrar: (qid: string) => Promise<void>;
  onValidarBanco: (qid: string) => Promise<void>;
  onVotarPregunta: (qid: string) => Promise<void>;
  onVotarRespuesta: (qid: string, rid: string) => Promise<void>;
  onReportar: (qid: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [respError, setRespError] = useState('');
  const resuelta = p.resuelta || p.respuestas.some((r) => r.esValida);
  const puedeCerrar = !resuelta && (puedeValidar || String(p.idUsuario) === currentUserId);

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
          <div className="row">
            <span className="chip chip--soft">{temaNombre}</span>
            {p.esBancoColaborativo && <span className="chip chip--xp">Banco colaborativo</span>}
            {p.validadaPorDocente && <span className="chip chip--solid">✓ Revisada por docente</span>}
          </div>
          <h2 style={{ marginTop: '0.4rem' }}>{p.texto}</h2>
          {p.fragmentoRecurso && <p className="muted">Fragmento: “{p.fragmentoRecurso}”</p>}
          {p.etiquetas?.length > 0 && (
            <div className="td-tags" style={{ marginTop: 6 }}>
              {p.etiquetas.map((et) => <span key={et} className="td-tag">#{et}</span>)}
            </div>
          )}
        </div>
        <span className={`chip ${resuelta ? 'chip--solid' : 'chip--xp'}`}>
          {resuelta ? '✓ Resuelta' : 'Abierta'}
        </span>
      </div>

      <div className="row">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onVotarPregunta(p._id)}>
          👍 Útil ({p.votosUtilidad})
        </button>
        {puedeCerrar && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onCerrar(p._id)}>
            ✓ Cerrar resuelta
          </button>
        )}
        {puedeValidar && !p.validadaPorDocente && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onValidarBanco(p._id)}>
            Validar para banco
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onReportar(p._id)}>
          🚩 Reportar
        </button>
      </div>

      {p.respuestas.length > 0 && (
        <div className="answers">
          {p.respuestas.map((r) => (
            <div className="answer" key={r._id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Respuesta de la comunidad</strong>
                {r.esValida && <span className="chip chip--solid">✓ Relevante</span>}
              </div>
              <p>{r.texto}</p>
              <div className="row">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onVotarRespuesta(p._id, r._id)}>
                  👍 ({r.votosUtilidad})
                </button>
                {puedeValidar && !r.esValida && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => onValidar(p._id, r._id)}
                  >
                    Marcar relevante
                  </button>
                )}
              </div>
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
