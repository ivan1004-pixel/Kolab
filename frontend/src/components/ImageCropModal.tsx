import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

interface ImageCropModalProps {
  src: string;
  onCancel: () => void;
  onConfirm: (resultDataUrl: string) => void;
}

export default function ImageCropModal({ src, onCancel, onConfirm }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [useCrop, setUseCrop] = useState(true);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [circle, setCircle] = useState({ cx: 120, cy: 120, r: 75 });

  const dragState = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origCx: number;
    origCy: number;
    origR: number;
  } | null>(null);

  const maxAllowedRadius = Math.max(
    32,
    Math.floor(Math.min(imgSize.width, imgSize.height) / 2),
  );
  const minRadius = Math.min(28, maxAllowedRadius);

  function handleImageLoad() {
    const el = imgRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    const initialR = Math.max(28, Math.floor(Math.min(width, height) * 0.36));
    setImgSize({ width, height });
    setCircle({
      cx: Math.round(width / 2),
      cy: Math.round(height / 2),
      r: initialR,
    });
  }

  function clampCircle(cx: number, cy: number, r: number) {
    const safeR = Math.max(minRadius, Math.min(maxAllowedRadius, r));
    const safeCx = Math.max(safeR, Math.min(imgSize.width - safeR, cx));
    const safeCy = Math.max(safeR, Math.min(imgSize.height - safeR, cy));
    return { cx: safeCx, cy: safeCy, r: safeR };
  }

  function startMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origCx: circle.cx,
      origCy: circle.cy,
      origR: circle.r,
    };
  }

  function startResize(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      origCx: circle.cx,
      origCy: circle.cy,
      origR: circle.r,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === 'move') {
      setCircle(clampCircle(drag.origCx + dx, drag.origCy + dy, drag.origR));
    } else {
      const delta = Math.round((dx + dy) / 2);
      setCircle(clampCircle(drag.origCx, drag.origCy, drag.origR + delta));
    }
  }

  function stopDrag() {
    dragState.current = null;
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function handleConfirm() {
    if (!useCrop || !imgRef.current || imgSize.width === 0 || imgSize.height === 0) {
      onConfirm(src);
      return;
    }

    const img = imgRef.current;
    const scaleX = img.naturalWidth / imgSize.width;
    const scaleY = img.naturalHeight / imgSize.height;

    const sx = (circle.cx - circle.r) * scaleX;
    const sy = (circle.cy - circle.r) * scaleY;
    const sSize = circle.r * 2 * Math.min(scaleX, scaleY);

    const outSize = 400;
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirm(src);
      return;
    }

    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outSize, outSize);
    const dataUrl = canvas.toDataURL('image/webp', 0.92);
    onConfirm(dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/png'));
  }

  return (
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="Ajustar imagen de perfil">
      <div className="crop-modal card">
        <div className="crop-modal__head">
          <h2 className="card__title">Ajustar foto de perfil</h2>
          <button type="button" className="notice-close" onClick={onCancel} aria-label="Cerrar">×</button>
        </div>

        <label className="crop-toggle">
          <input
            type="checkbox"
            checked={useCrop}
            onChange={(e) => setUseCrop(e.target.checked)}
          />
          <span>Usar formato de recorte circular</span>
        </label>

        <div className="crop-stage" onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          <img
            ref={imgRef}
            src={src}
            alt="Vista previa para recorte"
            className="crop-stage__img"
            onLoad={handleImageLoad}
            draggable={false}
          />

          {useCrop && imgSize.width > 0 && (
            <div
              className="crop-circle"
              style={{
                width: circle.r * 2,
                height: circle.r * 2,
                left: circle.cx - circle.r,
                top: circle.cy - circle.r,
              }}
              onPointerDown={startMove}
              title="Arrastra para mover el círculo"
            >
              <button
                type="button"
                className="crop-circle__handle"
                onPointerDown={startResize}
                aria-label="Expandir o contraer círculo de recorte"
                title="Arrastra para expandir o retraer"
              />
            </div>
          )}
        </div>

        {useCrop && imgSize.width > 0 && (
          <div className="crop-slider-row">
            <label htmlFor="crop-radius">Tamaño del círculo</label>
            <input
              id="crop-radius"
              type="range"
              min={minRadius}
              max={maxAllowedRadius}
              value={circle.r}
              onChange={(e) => setCircle((c) => clampCircle(c.cx, c.cy, Number(e.target.value)))}
            />
          </div>
        )}

        <div className="crop-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm}>
            {useCrop ? 'Aplicar recorte' : 'Usar imagen completa'}
          </button>
        </div>
      </div>
    </div>
  );
}
