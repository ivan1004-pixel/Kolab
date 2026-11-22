import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Flag, Send, X } from 'lucide-react';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const QUICK_REASONS = [
  'Contenido inapropiado u ofensivo',
  'Información inexacta o errónea',
  'Posible plagio o sin autoría',
  'Spam o fuera de tema',
];

interface ReportModalProps {
  open: boolean;
  targetLabel: string;
  targetPreview?: string;
  onClose: () => void;
  onSubmit: (motivo: string) => Promise<void> | void;
}

export default function ReportModal({
  open,
  targetLabel,
  targetPreview,
  onClose,
  onSubmit,
}: ReportModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [selectedChip, setSelectedChip] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setSelectedChip('');
      setDetails('');
      setError('');
      setSubmitting(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback para navegadores sin soporte nativo de <dialog closedby="any"> (p. ej. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  function requestClose() {
    if (submitting) return;
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    } else {
      onClose();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const composed = [selectedChip, details.trim()].filter(Boolean).join(' — ');
    if (composed.length < 5) {
      setError('Selecciona un motivo o describe brevemente el problema (mínimo 5 caracteres).');
      return;
    }

    try {
      assertNoScriptInjection(composed, 'reporte');
      setSubmitting(true);
      await onSubmit(composed);
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="km-quick-dialog km-report-dialog"
      {...({ closedby: 'any' } as any)}
      aria-labelledby="kolab-report-modal-title"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <div className="km-quick-dialog__head">
        <div className="km-report-head-group">
          <span className="km-report-icon-badge" aria-hidden="true">
            <Flag size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <span className="muted" style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Moderación Kolab · {targetLabel}
            </span>
            <h2 id="kolab-report-modal-title">Reportar contenido</h2>
          </div>
        </div>
        <button
          type="button"
          className="km-quick-dialog__close"
          onClick={requestClose}
          disabled={submitting}
          aria-label="Cerrar ventana de reporte"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="km-quick-dialog__body">
          {targetPreview && (
            <div className="km-report-preview">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{targetPreview.length > 120 ? `${targetPreview.slice(0, 120)}…` : targetPreview}</span>
            </div>
          )}

          <div className="km-quick-dialog__section">
            <span className="km-quick-dialog__label">Motivo rápido</span>
            <div className="km-report-chips">
              {QUICK_REASONS.map((reason) => {
                const active = selectedChip === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    className={`km-report-chip ${active ? 'is-selected' : ''}`}
                    onClick={() => setSelectedChip(active ? '' : reason)}
                    aria-pressed={active}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="km-quick-dialog__section">
            <label htmlFor="kolab-report-details" className="km-quick-dialog__label">
              Detalles adicionales {selectedChip ? '(opcional)' : '(requerido)'}
            </label>
            <textarea
              id="kolab-report-details"
              autoFocus
              rows={3}
              maxLength={400}
              className="km-report-textarea"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Explica brevemente qué encontraste para ayudar a los docentes y moderadores…"
            />
            <span className="muted" style={{ fontSize: '0.75rem', alignSelf: 'flex-end' }}>
              {details.length}/400
            </span>
          </div>

          {error && (
            <div className="td-notice td-notice--err" role="alert">
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="km-quick-dialog__footer">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--danger btn--sm"
            disabled={submitting || (!selectedChip && details.trim().length < 5)}
          >
            <Send size={14} aria-hidden="true" />
            <span>{submitting ? 'Enviando reporte…' : 'Enviar reporte'}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
