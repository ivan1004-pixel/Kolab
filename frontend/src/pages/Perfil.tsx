import { ChangeEvent, FormEvent, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS, ROLES } from '../data/demoUsers';
import { MODULES } from '../data/modules';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import getCroppedImg from '../utils/cropImage';
import ModuleBanner from '../components/ModuleBanner';
import Skeleton from '../components/Skeleton';

export default function Perfil() {
  const { user, updateProfile } = useAuth();

const [form, setForm] = useState({
  nombre: user?.nombre ?? '',
  apellidos: user?.apellidos ?? '',
  foto_url: user?.foto_url ?? '',
});

const [msg, setMsg] = useState({ type: '', text: '' });

const [imageToCrop, setImageToCrop] = useState<string | null>(null);
const [crop, setCrop] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
const [isCropOpen, setIsCropOpen] = useState(false);
const [isPhotoLoading, setIsPhotoLoading] = useState(false);


const onCropComplete = (_: Area, croppedPixels: Area) => {
  setCroppedAreaPixels(croppedPixels);
};


const confirmCrop = async () => {
  console.log('1. Clic en confirmar');
  console.log('2. Imagen disponible:', !!imageToCrop);
  console.log('3. Área de recorte:', croppedAreaPixels);

  if (!imageToCrop || !croppedAreaPixels) {
    console.error('Falta la imagen o el área de recorte');
    return;
  }

  setIsPhotoLoading(true);

  try {
    console.log('4. Iniciando recorte');

    const croppedImage = await getCroppedImg(
      imageToCrop,
      croppedAreaPixels,
    );

    console.log('5. Recorte terminado');
    console.log('6. Tamaño de imagen:', croppedImage.length);

    const preview = new Image();

    preview.onload = () => {
      console.log('7. Imagen cargada correctamente');

      setForm((f) => ({ ...f, foto_url: croppedImage }));
      setIsPhotoLoading(false);
      setImageToCrop(null);
      setIsCropOpen(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setMsg({ type: '', text: '' });
    };

    preview.onerror = () => {
      console.error('8. Error al cargar la vista previa');
      setIsPhotoLoading(false);
      setMsg({
        type: 'error',
        text: 'No se pudo cargar la fotografía.',
      });
    };

    preview.src = croppedImage;
  } catch (error) {
    console.error('Error durante el recorte:', error);
    setIsPhotoLoading(false);
    setMsg({
      type: 'error',
      text: 'No se pudo recortar la imagen.',
    });
  }
};


const cancelCrop = () => {
  setImageToCrop(null);
  setIsCropOpen(false);
  setCrop({ x: 0, y: 0 });
  setZoom(1);
};

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({
      ...f,
      [e.target.name]: e.target.value,
    }));
  };


const onPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setMsg({ type: 'error', text: 'Selecciona un archivo de imagen válido.' });
    e.target.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setMsg({ type: 'error', text: 'La imagen no debe pesar más de 5 MB.' });
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  setIsPhotoLoading(true);

  reader.onload = () => {
  setIsPhotoLoading(false);

  const image = String(reader.result || '');

  if (image) {
    setImageToCrop(image);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsCropOpen(true);
    setMsg({ type: '', text: '' });
  }
};

  reader.onerror = () => {
  setIsPhotoLoading(false);
  setMsg({ type: 'error', text: 'No se pudo cargar la imagen.' });
};

  reader.readAsDataURL(file);
  e.target.value = '';
};


  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.nombre.trim() || !form.apellidos.trim()) {
      return setMsg({ type: 'error', text: 'Nombre y apellidos son obligatorios.' });
    }

    try {
      assertNoScriptInjection({ nombre: form.nombre, apellidos: form.apellidos }, 'perfil');
      await updateProfile({
        ...form,
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
      });
      setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  function onCancel() {
    setForm({
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      foto_url: user?.foto_url ?? '',
    });
    setMsg({ type: '', text: '' });
  }

  return (
    <>
      <ModuleBanner module={MODULES[0]} />

      <div className="split">
        <section className="card profile-card" aria-label="Perfil público">
          <label className="avatar avatar--lg avatar-upload" htmlFor="foto-perfil">

{isPhotoLoading ? (
  <Skeleton
    variant="circle"
    width="190px"
    height="190px"
    className="profile-photo-skeleton"
  />
) : form.foto_url ? (
  <img
    src={form.foto_url}
    alt="Fotografía de perfil"
  />
) : (
  <span>{form.nombre?.[0]?.toUpperCase() || '?'}</span>
)}


            <span className="avatar-upload__overlay">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
              </svg>
              <span>Subir foto</span>
            </span>

            <input
              id="foto-perfil"
              className="avatar-upload__input"
              type="file"
              accept="image/*"
              onChange={onPhotoChange}
              aria-label="Seleccionar fotografía de perfil"
            />
          </label>

          <p className="profile-photo-hint">Pasa el cursor sobre tu foto para cambiarla</p>

          <h2>{user?.nombre} {user?.apellidos}</h2>
          <span className="chip chip--solid">{ROLES[user?.rol ?? 'estudiante']}</span>
          <p className="muted">{user?.carrera}</p>

          <div className="row">
            <span className="chip chip--xp">{user?.xp ?? 0} XP</span>
            <span className="chip chip--soft">{user?.insignias ?? 0} insignias</span>
          </div>
        </section>

        <form className="card" onSubmit={onSubmit} noValidate>
          <h2 className="card__title">Editar datos permitidos</h2>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" name="nombre" value={form.nombre} onChange={onChange} />
            </div>

            <div className="field">
              <label htmlFor="apellidos">Apellidos</label>
              <input id="apellidos" name="apellidos" value={form.apellidos} onChange={onChange} />
            </div>
          </div>

          {msg.text && (
            <p className={msg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">
              {msg.text}
            </p>
          )}

          <div className="row">
            <button className="btn btn--primary" type="submit">Guardar</button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
          </div>
        </form>
      </div>

      {isCropOpen && imageToCrop && (
        <div className="crop-modal">
          <div
            className="crop-modal__content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-title"
          >
            <h2 id="crop-title">Ajustar fotografía</h2>
            <p>Arrastra la imagen y ajusta el zoom a tu gusto.</p>

            <div className="crop-container">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="crop-zoom">
              <label htmlFor="crop-zoom">Zoom</label>
              <input
                id="crop-zoom"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </div>

            <div className="crop-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={cancelCrop}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn btn--primary"
                onClick={confirmCrop}
              >
                Confirmar fotografía
              </button>
            </div>
          </div>
        </div>
      )}

      {user?.rol === 'admin' && <Cuentas />}
    </>
  );
}

function Cuentas() {
  const [cuentas, setCuentas] = useState(
    DEMO_USERS.map(({ id, nombre, apellidos, email, rol }) => ({
      id,
      nombre,
      apellidos,
      email,
      rol,
    })),
  );

  const [form, setForm] = useState({ nombre: '', email: '', rol: 'estudiante' });
  const [secError, setSecError] = useState('');

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.includes('@')) return;
    try {
      assertNoScriptInjection(form, 'cuentas');
      setSecError('');
    } catch (err: any) {
      return setSecError(err.message);
    }

    setCuentas((c) => [
      ...c,
      {
        id: Date.now(),
        nombre: form.nombre.trim(),
        apellidos: '',
        email: form.email.trim(),
        rol: form.rol,
      },
    ]);

    setForm({ nombre: '', email: '', rol: 'estudiante' });
  }

  return (
    <section className="card">
      <h2 className="card__title">Cuentas y roles · solo Administrador</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre} {c.apellidos}</td>
                <td>{c.email}</td>
                <td><span className="chip chip--soft">{ROLES[c.rol]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {secError && <p className="form-error" role="alert">{secError}</p>}

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="c-nombre">Nombre</label>
          <input id="c-nombre" name="nombre" value={form.nombre} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-email">Correo</label>
          <input id="c-email" name="email" type="email" value={form.email} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-rol">Rol</label>
          <select id="c-rol" name="rol" value={form.rol} onChange={onChange}>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--primary" type="submit">+ Registrar cuenta</button>
        </div>
      </form>
    </section>
  );
}
