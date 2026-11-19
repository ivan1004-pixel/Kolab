const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kolab';

const COLLECTION_VALIDATORS = {
  usuarios: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'apellidos', 'correo', 'contrasenaHash', 'rol'],
      properties: {
        nombre: { bsonType: 'string' },
        apellidos: { bsonType: 'string' },
        correo: { bsonType: 'string' },
        contrasenaHash: { bsonType: 'string' },
        rol: { enum: ['ESTUDIANTE', 'DOCENTE', 'ADMINISTRADOR'] },
        fotoUrl: { bsonType: ['string', 'null'] },
        xpTotal: { bsonType: ['int', 'number'] },
        idCarrera: { bsonType: ['objectId', 'null'] },
        cuatrimestre: { bsonType: ['string', 'null'] },
        grupo: { bsonType: ['string', 'null'] },
        rachaActual: { bsonType: ['int', 'number'] },
        rachaMasLarga: { bsonType: ['int', 'number'] },
        comodinesMes: { bsonType: ['int', 'number'] },
        emailVerified: { bsonType: 'bool' },
        isActive: { bsonType: 'bool' },
        aceptoPrivacidad: { bsonType: 'bool' },
        preferencias: { bsonType: 'object' },
        asignaturasInscritas: { bsonType: 'array' },
      },
    },
  },
  carreras: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre'],
      properties: {
        nombre: { bsonType: 'string' },
        descripcion: { bsonType: ['string', 'null'] },
      },
    },
  },
  asignaturas: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'idCarrera'],
      properties: {
        nombre: { bsonType: 'string' },
        clave: { bsonType: ['string', 'null'] },
        idCarrera: { bsonType: 'objectId' },
      },
    },
  },
  temas: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['titulo', 'idAsignatura'],
      properties: {
        titulo: { bsonType: 'string' },
        descripcion: { bsonType: ['string', 'null'] },
        idAsignatura: { bsonType: 'objectId' },
      },
    },
  },
  recursos: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['titulo', 'archivoUrl', 'tipoArchivo', 'idUsuario', 'idTema'],
      properties: {
        titulo: { bsonType: 'string' },
        archivoUrl: { bsonType: 'string' },
        tipoArchivo: { bsonType: 'string' },
        idUsuario: { bsonType: 'objectId' },
        idTema: { bsonType: 'objectId' },
      },
    },
  },
  consultas_ia: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['promptPregunta', 'respuestaIa', 'idUsuario', 'idTema'],
      properties: {
        promptPregunta: { bsonType: 'string' },
        respuestaIa: { bsonType: 'string' },
        esValida: { bsonType: 'bool' },
        idUsuario: { bsonType: 'objectId' },
        idTema: { bsonType: 'objectId' },
      },
    },
  },
  grupos_estudio: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'idTema'],
      properties: {
        nombre: { bsonType: 'string' },
        descripcion: { bsonType: ['string', 'null'] },
        idTema: { bsonType: 'objectId' },
      },
    },
  },
  solicitudes_tutoria: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['idEstudiante', 'idTema'],
      properties: {
        estado: { bsonType: 'string' },
        esDuelo: { bsonType: 'bool' },
        idEstudiante: { bsonType: 'objectId' },
        idTutor: { bsonType: ['objectId', 'null'] },
        idTema: { bsonType: 'objectId' },
      },
    },
  },
  reportes: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['motivo', 'idUsuarioReporta'],
      properties: {
        motivo: { bsonType: 'string' },
        estado: { bsonType: 'string' },
        idUsuarioReporta: { bsonType: 'objectId' },
      },
    },
  },
  insignias: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre'],
      properties: {
        nombre: { bsonType: 'string' },
        descripcion: { bsonType: ['string', 'null'] },
        iconoUrl: { bsonType: ['string', 'null'] },
      },
    },
  },
};

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const [name, validator] of Object.entries(COLLECTION_VALIDATORS)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict' });
      console.log(`Validador actualizado en: ${name}`);
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict' });
      console.log(`Colección creada con $jsonSchema: ${name}`);
    }
  }

  await mongoose.disconnect();
  console.log('Validadores $jsonSchema aplicados correctamente en kolab.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
