import { registerEnumType } from '@nestjs/graphql';

export enum RolUsuario {
  ESTUDIANTE = 'ESTUDIANTE',
  DOCENTE = 'DOCENTE',
  ADMINISTRADOR = 'ADMINISTRADOR',
}

export enum EstadoValidacionRecurso {
  PENDIENTE = 'PENDIENTE',
  REVISADO_DOCENTE = 'REVISADO_DOCENTE',
  ARCHIVADO = 'ARCHIVADO',
}

export enum EstadoTutoria {
  PENDIENTE = 'PENDIENTE',
  ACEPTADA = 'ACEPTADA',
  COMPLETADA = 'COMPLETADA',
  CANCELADA = 'CANCELADA',
}

export enum EstadoReporte {
  PENDIENTE = 'PENDIENTE',
  EN_REVISION = 'EN_REVISION',
  RESUELTO = 'RESUELTO',
  DESCARTADO = 'DESCARTADO',
}

export enum TipoNotificacion {
  RESPUESTA_PREGUNTA = 'RESPUESTA_PREGUNTA',
  VALIDACION_RECURSO = 'VALIDACION_RECURSO',
  REVISION_PENDIENTE = 'REVISION_PENDIENTE',
  RACHA_EN_RIESGO = 'RACHA_EN_RIESGO',
  SISTEMA = 'SISTEMA',
}

export enum CanalNotificacion {
  PLATAFORMA = 'PLATAFORMA',
  CORREO = 'CORREO',
  AMBOS = 'AMBOS',
}

registerEnumType(RolUsuario, { name: 'RolUsuario' });
registerEnumType(EstadoValidacionRecurso, { name: 'EstadoValidacionRecurso' });
registerEnumType(EstadoTutoria, { name: 'EstadoTutoria' });
registerEnumType(EstadoReporte, { name: 'EstadoReporte' });
registerEnumType(TipoNotificacion, { name: 'TipoNotificacion' });
registerEnumType(CanalNotificacion, { name: 'CanalNotificacion' });
