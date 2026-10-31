import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ESTADO_DISPOSITIVO_REPOSITORIO,
  type EstadoDispositivoRepositorio,
} from '../../../dispositivos/aplicacion/puertos/estado-dispositivo.repositorio.js';
import { clasificarRespuesta } from '../../dominio/clasificacion.js';
import {
  almacenNoDisponible,
  decidirAnteExistente,
  loteSinTiempo,
  nuevaOperacion,
  operacionAjena,
  operacionEnProceso,
  resultadoPropio,
  type ResultadoOperacion,
} from '../../dominio/operacion.js';
import { Presupuesto } from '../../dominio/presupuesto.js';
import {
  type DefinicionTipo,
  type OperacionRecibida,
  validarTipo,
} from '../../dominio/tipo-operacion.js';
import {
  type ContextoEnvio,
  DESPACHADOR,
  type Despachador,
} from '../puertos/despachador.js';
import {
  OPERACION_PROCESADA_REPOSITORIO,
  type OperacionProcesadaRepositorio,
} from '../puertos/operacion-procesada.repositorio.js';

/** Presupuesto del lote en milisegundos (`TIEMPO_MAXIMO_LOTE_MS`, 20 s). */
export const TIEMPO_MAXIMO_LOTE = Symbol('TIEMPO_MAXIMO_LOTE');

export interface EntradaLote {
  operaciones: OperacionRecibida[];
  usuarioId: string;
  idDispositivo: string;
  contexto: ContextoEnvio;
}

/**
 * `POST /lotes` (101): procesa cada operación en orden, una tras otra, sin procesarla dos veces
 * (`operacion_procesada` «guardar solo si no existe»), y devuelve un resultado por operación.
 */
@Injectable()
export class ProcesarLoteCasoUso {
  private readonly registro = new Logger('Lotes');

  constructor(
    @Inject(OPERACION_PROCESADA_REPOSITORIO)
    private readonly operaciones: OperacionProcesadaRepositorio,
    @Inject(ESTADO_DISPOSITIVO_REPOSITORIO)
    private readonly dispositivos: EstadoDispositivoRepositorio,
    @Inject(DESPACHADOR) private readonly despachador: Despachador,
    @Inject(TIEMPO_MAXIMO_LOTE) private readonly tiempoMaximoLoteMs: number,
  ) {}

  async ejecutar(entrada: EntradaLote): Promise<ResultadoOperacion[]> {
    const presupuesto = new Presupuesto(this.tiempoMaximoLoteMs);
    const resultados: ResultadoOperacion[] = [];
    for (const operacion of entrada.operaciones) {
      const resultado = presupuesto.agotado()
        ? loteSinTiempo(operacion.idOperacion)
        : await this.procesar(operacion, entrada);
      resultados.push(resultado);
      // Un renglón por operación; nunca el contenido de `datos`.
      this.registro.log(
        `requestId=${entrada.contexto.requestId} idOperacion=${operacion.idOperacion} tipo=${operacion.tipo} resultado=${resultado.estado} status=${resultado.status}${resultado.repetida ? ' repetida' : ''}`,
      );
    }
    await this.actualizarDispositivo(entrada);
    return resultados;
  }

  private async procesar(
    operacion: OperacionRecibida,
    entrada: EntradaLote,
  ): Promise<ResultadoOperacion> {
    const validacion = validarTipo(operacion);
    if (!validacion.valida) {
      // No se guarda en DynamoDB.
      return resultadoPropio(
        operacion.idOperacion,
        'ERROR',
        validacion.respuesta,
      );
    }
    const { definicion } = validacion;
    try {
      // 1. Guardar solo si no existe.
      const creada = await this.operaciones.crearSiNoExiste(
        nuevaOperacion(
          operacion,
          definicion.servicio,
          entrada.usuarioId,
          entrada.idDispositivo,
          new Date(),
        ),
      );
      if (!creada) {
        // 2. Ya existía.
        const guardada = await this.operaciones.leer(operacion.idOperacion);
        if (!guardada) {
          // Se borró entre el PutItem y el GetItem (otro intento la liberó): que la app reintente.
          return operacionEnProceso(operacion.idOperacion);
        }
        const decision = decidirAnteExistente(
          guardada,
          entrada.usuarioId,
          new Date(),
        );
        switch (decision.accion) {
          case 'AJENA':
            return operacionAjena(operacion.idOperacion);
          case 'REPETIDA':
            return {
              idOperacion: operacion.idOperacion,
              estado: decision.estado,
              repetida: true,
              status: decision.respuesta.status,
              respuesta: decision.respuesta.cuerpo,
            };
          case 'EN_PROCESO':
            return operacionEnProceso(operacion.idOperacion);
          case 'TOMAR': {
            const tomada = await this.operaciones.tomar(
              operacion.idOperacion,
              decision.actualizadaEnLeida,
              new Date().toISOString(),
            );
            if (!tomada) return operacionEnProceso(operacion.idOperacion);
          }
        }
      }
    } catch (error) {
      this.registrarFalla(operacion, entrada, error);
      return almacenNoDisponible(operacion.idOperacion);
    }
    // 3 y 4. Llamar al dueño y guardar el resultado.
    return this.enviar(definicion, operacion, entrada);
  }

  private async enviar(
    definicion: DefinicionTipo,
    operacion: OperacionRecibida,
    entrada: EntradaLote,
  ): Promise<ResultadoOperacion> {
    const respuestaDuenio = await this.despachador.enviar(
      definicion,
      operacion,
      entrada.contexto,
    );
    const clasificacion = clasificarRespuesta(respuestaDuenio);
    try {
      if (clasificacion.estado === 'REINTENTAR') {
        await this.operaciones.liberar(operacion.idOperacion);
      } else {
        await this.operaciones.completar(
          operacion.idOperacion,
          clasificacion.estado,
          { status: clasificacion.status, cuerpo: clasificacion.respuesta },
          new Date().toISOString(),
        );
      }
    } catch (error) {
      // El dueño ya respondió: se devuelve su resultado igual. El elemento queda PROCESANDO y,
      // pasados 60 s, otro intento lo toma; la idempotencia del dueño evita el duplicado.
      this.registrarFalla(operacion, entrada, error);
    }
    return {
      idOperacion: operacion.idOperacion,
      estado: clasificacion.estado,
      repetida: false,
      status: clasificacion.status,
      respuesta: clasificacion.respuesta,
    };
  }

  private async actualizarDispositivo(entrada: EntradaLote): Promise<void> {
    try {
      await this.dispositivos.registrarLote(
        entrada.idDispositivo,
        entrada.usuarioId,
        new Date().toISOString(),
      );
    } catch (error) {
      this.registro.warn(
        `requestId=${entrada.contexto.requestId} no se pudo actualizar estado_dispositivo: ${nombreError(error)}`,
      );
    }
  }

  private registrarFalla(
    operacion: OperacionRecibida,
    entrada: EntradaLote,
    error: unknown,
  ): void {
    this.registro.error(
      `requestId=${entrada.contexto.requestId} idOperacion=${operacion.idOperacion} falla de DynamoDB: ${nombreError(error)}`,
    );
  }
}

function nombreError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : 'desconocido';
}
