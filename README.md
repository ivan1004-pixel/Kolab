# Kolab — Plataforma Académica Colaborativa

Plataforma colaborativa académica con biblioteca de recursos, preguntas y respuestas, gamificación (rachas, XP e insignias), tutorías/duelos entre pares y asistente de IA con **Gemini**.

---

## Stack tecnológico

- **Backend (`backend/`)**: NestJS, GraphQL (Code-First con Apollo Server), TypeScript, MongoDB (Mongoose), JWT + Guards (`GqlAuthGuard`, `RolesGuard`, `GqlThrottlerGuard`), `bcrypt`, **Brevo API** (correos) y **Google Gemini API** (`gemini-3.1-flash-lite` con rotación de modelos de respaldo).
- **Frontend de pruebas (`frontend/`)**: Vite, React, TypeScript y PostCSS (`autoprefixer`).

---

## Estructura del proyecto

```text
kolab/
├── backend/
│   ├── src/
│   │   ├── academic/        # Carreras, asignaturas, temas y calendario
│   │   ├── ai/              # GeminiService, cuestionarios e intentos
│   │   ├── auth/            # Registro, login, JWT, refresh, recuperación
│   │   ├── collaboration/   # Grupos de estudio, tutorías y modo duelo
│   │   ├── common/          # Enums, decorators (@Roles, @CurrentUser) y guards
│   │   ├── gamification/    # Rachas diarias, comodines, XP, insignias, ranking
│   │   ├── mail/            # BrevoService (validación MX + verificación + bienvenida)
│   │   ├── moderation/      # Reportes, bitácora de auditoría y notificaciones
│   │   ├── qa/              # Preguntas, respuestas y Radar de Dificultades
│   │   ├── resources/       # Apuntes (<=10MB), versiones, coautores, reseñas
│   │   ├── users/           # Perfil, preferencias y administración
│   │   └── seed.ts          # Datos iniciales de prueba
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── graphql/         # Cliente fetch para GraphQL
    │   ├── styles/          # Estilos procesados con PostCSS
    │   └── App.tsx          # Formularios de prueba (Brevo y Gemini AI)
    ├── postcss.config.js
    └── package.json
```

---

## Requisitos previos

1. **Node.js** v20+ y **npm**.
2. **MongoDB** corriendo localmente (`mongodb://localhost:27017/kolab`) o un cluster en **MongoDB Atlas**.
3. Cuenta en **Brevo** (API Key `xkeysib-...` y un correo remitente verificado).
4. **API Key de Google Gemini** (desde Google AI Studio).

---

## Instalación y configuración

### 1. Instalar dependencias

En una terminal:

```powershell
cd backend
npm install
```

En otra terminal (o en la misma después):

```powershell
cd frontend
npm install
```

### 2. Configurar variables de entorno del backend

Copia `backend/.env.example` a `backend/.env` y llena tus valores:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

MONGODB_URI=mongodb://localhost:27017/kolab

JWT_SECRET=genera_un_secreto_seguro
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=genera_otro_secreto_seguro
JWT_REFRESH_EXPIRES_IN=7d
SESSION_INACTIVITY_MINUTES=30

BREVO_API_KEY=xkeysib-tu-api-key
BREVO_SENDER_EMAIL=tu-correo-verificado@gmail.com
BREVO_SENDER_NAME=Kolab Plataforma Académica

GEMINI_API_KEY=tu-api-key-de-gemini
GEMINI_MODEL=gemini-3.1-flash-lite
AI_DAILY_LIMIT_PER_USER=10
```

> **Tip para generar secretos JWT rápidamente:**
> ```powershell
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 3. Cargar datos de prueba (opcional, recomendado)

Crea una carrera, asignatura, tema (`Animales Acuáticos`) y un recurso oficial autorizado para poder probar Gemini de inmediato:

```powershell
cd backend
npx ts-node src/seed.ts
```

---

## Cómo ejecutar el proyecto

Abre **dos terminales**:

**Terminal 1 — Backend (NestJS + GraphQL):**
```powershell
cd backend
npm run start:dev
```
- API y Playground GraphQL: `http://localhost:3000/graphql`

**Terminal 2 — Frontend de pruebas (Vite + PostCSS):**
```powershell
cd frontend
npm run dev
```
- Interfaz web: `http://localhost:5173`

---

## Flujos principales implementados

1. **Registro y verificación de correo (Brevo)**:
   - Al registrarse (`register`), se valida formato, se bloquean dominios desechables y se verifica que el dominio tenga registros **MX** reales.
   - Se envía un **correo de verificación** con token.
   - Una vez confirmado (`verifyEmail`), la cuenta queda activa y se envía el **correo de bienvenida**.
2. **Seguridad y sesiones**:
   - Contraseñas cifradas con `bcrypt`, bloqueo temporal tras 5 intentos fallidos de login, expiración por inactividad y control de acceso por roles (`ESTUDIANTE`, `DOCENTE`, `ADMINISTRADOR`).
3. **Consultas y cuestionarios con Gemini AI**:
   - Solo responde usando material autorizado (`REVISADO_DOCENTE` o `esMaterialOficial`), citando las fuentes y evitando inventar respuestas si no hay material suficiente.
   - Incluye rotación automática de modelos y timeout de 8 segundos por intento.

---

## Pruebas unitarias (Backend)

```powershell
cd backend
npm test
```
