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
  let carrera = await db.collection('carreras').findOne({ nombre: 'Ciencias Naturales' });
  if (!carrera) {
    const resCarrera = await db.collection('carreras').insertOne({
      nombre: 'Ciencias Naturales',
      descripcion: 'Carrera de prueba para Kolab',
      cuatrimestres: ['1', '2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    carrera = { _id: resCarrera.insertedId };
  }

  // 3. Asignatura
  let asignatura = await db.collection('asignaturas').findOne({ nombre: 'Biología Marina' });
  if (!asignatura) {
    const resAsig = await db.collection('asignaturas').insertOne({
      nombre: 'Biología Marina',
      descripcion: 'Estudio de ecosistemas y fauna acuática',
      cuatrimestre: '1',
      idCarrera: carrera._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    asignatura = { _id: resAsig.insertedId };
  }

  // 4. Tema: Animales Acuáticos
  let tema = await db.collection('temas').findOne({ titulo: 'Animales Acuáticos' });
  if (!tema) {
    const resTema = await db.collection('temas').insertOne({
      titulo: 'Animales Acuáticos',
      descripcion: 'Clasificación y características de los animales que viven en el agua.',
      idAsignatura: asignatura._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tema = { _id: resTema.insertedId };
  }

  // 5. Recurso autorizado (Revisado por docente)
  const recursoExistente = await db
    .collection('recursos')
    .findOne({ idTema: tema._id });

  if (!recursoExistente) {
    await db.collection('recursos').insertOne({
      titulo: 'Guía Oficial: Animales Acuáticos',
      descripcion: 'Resumen autorizado sobre peces, mamíferos marinos y adaptaciones acuáticas.',
      archivoUrl: 'https://kolab.edu/recursos/animales-acuaticos.pdf',
      tipoArchivo: 'application/pdf',
      tamanoBytes: 250000,
      contenidoTextoExtraido:
        'Los animales acuáticos son aquellos que viven en el agua dulce o salada durante toda o la mayor parte de su vida. Se dividen en vertebrados (peces con branquias, mamíferos marinos como delfines y ballenas que respiran por pulmones, tortugas marinas) e invertebrados (medusas, pulpos, crustáceos y corales). Sus principales adaptaciones incluyen aletas para nadar, cuerpo hidrodinámico y branquias o pulmones adaptados al medio acuático.',
      idUsuario: docente._id,
      coautores: [],
      idTema: tema._id,
      idAsignatura: asignatura._id,
      palabrasClave: ['animales acuaticos', 'biologia', 'ecosistemas'],
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
