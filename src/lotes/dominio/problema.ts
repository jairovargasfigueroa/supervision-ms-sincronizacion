/** Problem Details (RFC 9457) con `codigo`, tal como lo devuelven los servicios dueños. */
export interface Problema {
  title: string;
  status: number;
  detail?: string;
  codigo: string;
  [otro: string]: unknown;
}

/** Título y código genérico por estado (convenciones, «Errores REST»); 409 y 422 no tienen. */
const GENERICOS: Record<number, { title: string; codigo: string }> = {
  400: { title: 'Datos inválidos', codigo: 'DATOS_INVALIDOS' },
  401: { title: 'No autenticado', codigo: 'NO_AUTENTICADO' },
  403: { title: 'Sin permiso', codigo: 'SIN_PERMISO' },
  404: { title: 'No encontrado', codigo: 'RUTA_NO_ENCONTRADA' },
  413: {
    title: 'Archivo demasiado grande',
    codigo: 'ARCHIVO_DEMASIADO_GRANDE',
  },
  429: { title: 'Demasiadas peticiones', codigo: 'DEMASIADAS_PETICIONES' },
  500: { title: 'Error interno', codigo: 'ERROR_INTERNO' },
  503: { title: 'Servicio no disponible', codigo: 'SERVICIO_NO_DISPONIBLE' },
  504: { title: 'Tiempo agotado', codigo: 'TIEMPO_AGOTADO' },
};

/** Títulos de los códigos propios de Sincronización (`docs/mensajes.md`, «Sincronización»). */
const TITULOS: Record<string, string> = {
  TIPO_OPERACION_DESCONOCIDO: 'Tipo de operación desconocido',
  OPERACION_INVALIDA: 'Operación inválida',
  OPERACION_AJENA: 'Operación de otro usuario',
  OPERACION_EN_PROCESO: 'Operación en proceso',
  TOKEN_VENCIDO: 'Token vencido',
};

/**
 * Problem Details de Sincronización. Sin `codigo`, el genérico de su estado; un estado sin
 * genérico (un `409` o `422` del dueño que no trae Problem Details) queda como respuesta
 * inesperada (`ERROR_INTERNO`).
 */
export function problema(
  status: number,
  codigo?: string,
  detail?: string,
): Problema {
  const generico = GENERICOS[status] ?? {
    title: 'Respuesta inesperada',
    codigo: 'ERROR_INTERNO',
  };
  const codigoFinal = codigo ?? generico.codigo;
  return {
    title: TITULOS[codigoFinal] ?? generico.title,
    status,
    codigo: codigoFinal,
    ...(detail ? { detail } : {}),
  };
}

/** `true` si el cuerpo ya es un Problem Details con `codigo` (lo que mandan los servicios dueños). */
export function esProblema(cuerpo: unknown): cuerpo is Problema {
  return (
    typeof cuerpo === 'object' &&
    cuerpo !== null &&
    !Array.isArray(cuerpo) &&
    typeof (cuerpo as { codigo?: unknown }).codigo === 'string'
  );
}
