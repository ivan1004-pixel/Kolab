import 'dotenv/config';
import mongoose from 'mongoose';

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kolab';
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  // 1. Buscar o crear usuario docente para autorizar el recurso
  let docente = await db.collection('usuarios').findOne({});
  if (!docente) {
    const resUser = await db.collection('usuarios').insertOne({
      nombre: 'Docente',
      apellidos: 'Kolab',
      correo: 'docente@kolab.edu',
      contrasenaHash: 'demo',
      rol: 'DOCENTE',
      xpTotal: 0,
      rachaActual: 0,
      rachaMasLarga: 0,
      comodinesMes: 2,
      emailVerified: true,
      isActive: true,
      aceptoPrivacidad: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    docente = { _id: resUser.insertedId };
  }

  // 2. Carrera
  let carrera = await db.collection('carreras').findOne({ nombre: 'Fundamentos de IA' });
  if (!carrera) {
    const resCarrera = await db.collection('carreras').insertOne({
      nombre: 'Fundamentos de IA',
      descripcion: 'Formación académica en Fundamentos de Inteligencia Artificial y Ciencia de Datos.',
      cuatrimestres: ['1', '2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    carrera = { _id: resCarrera.insertedId };
  }

  // 3. Asignatura
  let asignatura = await db.collection('asignaturas').findOne({ nombre: 'Fundamentos de IA' });
  if (!asignatura) {
    const resAsig = await db.collection('asignaturas').insertOne({
      nombre: 'Fundamentos de IA',
      descripcion: 'Principios de inteligencia artificial, agentes inteligentes, búsqueda y aprendizaje automático.',
      cuatrimestre: '1',
      idCarrera: carrera._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    asignatura = { _id: resAsig.insertedId };
  }

  // 4. Temas de Fundamentos de IA
  let tema = await db.collection('temas').findOne({ titulo: 'Fundamentos de IA' });
  if (!tema) {
    const resTema = await db.collection('temas').insertOne({
      titulo: 'Fundamentos de IA',
      descripcion: 'Introducción a la inteligencia artificial, agentes racionales y algoritmos de aprendizaje.',
      idAsignatura: asignatura._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tema = { _id: resTema.insertedId };
  }

  const extraTemas = [
    {
      titulo: 'Aprendizaje Supervisado y KNN',
      descripcion: 'Clasificación, regresión, vecinos más cercanos (KNN) y métricas de evaluación.',
    },
    {
      titulo: 'Redes Neuronales y Deep Learning',
      descripcion: 'Perceptrón multicapa, retropropagación, funciones de activación y modelos profundos.',
    },
  ];
  for (const t of extraTemas) {
    const exists = await db.collection('temas').findOne({ titulo: t.titulo, idAsignatura: asignatura._id });
    if (!exists) {
      await db.collection('temas').insertOne({
        titulo: t.titulo,
        descripcion: t.descripcion,
        idAsignatura: asignatura._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // 5. Recurso autorizado (Revisado por docente)
  const recursoExistente = await db
    .collection('recursos')
    .findOne({ idTema: tema._id });

  if (!recursoExistente) {
    await db.collection('recursos').insertOne({
      titulo: 'Guía Oficial: Fundamentos de IA',
      descripcion: 'Resumen autorizado sobre agentes inteligentes, aprendizaje automático (KNN) y redes neuronales.',
      archivoUrl: 'https://kolab.edu/recursos/fundamentos-ia.pdf',
      tipoArchivo: 'application/pdf',
      tamanoBytes: 250000,
      contenidoTextoExtraido:
        'Los Fundamentos de Inteligencia Artificial estudian el diseño de agentes inteligentes capaces de percibir su entorno y actuar racionalmente para maximizar su desempeño. Sus áreas principales comprenden búsqueda heurística, representación del conocimiento, aprendizaje automático supervisado (como K-Nearest Neighbors o KNN, árboles de decisión y regresión), aprendizaje no supervisado (clustering), aprendizaje por refuerzo y redes neuronales artificiales.',
      idUsuario: docente._id,
      coautores: [],
      idTema: tema._id,
      idAsignatura: asignatura._id,
      palabrasClave: ['Fundamentos de IA', 'Inteligencia Artificial', 'Machine Learning'],
      estadoValidacion: 'REVISADO_DOCENTE',
      esMaterialOficial: true,
      versiones: [],
      calificaciones: [],
      promedioCalificacion: 5,
      totalCalificaciones: 1,
      consultasCount: 0,
      comentarios: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log('SEED_OK');
  console.log('TEMA_ID=' + tema._id.toString());
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
