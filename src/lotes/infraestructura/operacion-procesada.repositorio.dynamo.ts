import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCUMENTOS_DYNAMODB,
  TABLAS,
} from '../../compartido/infraestructura/dynamodb/dynamodb.module.js';
import type { NombresTablas } from '../../compartido/infraestructura/dynamodb/tablas.js';
import type { OperacionProcesadaRepositorio } from '../aplicacion/puertos/operacion-procesada.repositorio.js';
import type {
  EstadoGuardado,
  OperacionProcesada,
  RespuestaGuardada,
} from '../dominio/operacion.js';
import type { ServicioDestino } from '../dominio/tipo-operacion.js';

/** Elemento tal como está en DynamoDB (atributos de `docs/datos.md`). */
interface ElementoOperacion {
  id_operacion: string;
  id_dispositivo: string;
  usuario_id: string;
  tipo: string;
  servicio_destino: ServicioDestino;
  estado: EstadoGuardado;
  /** JSON `{ status, cuerpo }`. */
  respuesta?: string;
  recibida_en: string;
  actualizada_en: string;
  expira_en: number;
}

@Injectable()
export class OperacionProcesadaRepositorioDynamo implements OperacionProcesadaRepositorio {
  private readonly registro = new Logger('OperacionProcesada');
  private readonly tabla: string;

  constructor(
    @Inject(DOCUMENTOS_DYNAMODB)
    private readonly documentos: DynamoDBDocumentClient,
    @Inject(TABLAS) tablas: NombresTablas,
  ) {
    this.tabla = tablas.operacionProcesada;
  }

  async crearSiNoExiste(operacion: OperacionProcesada): Promise<boolean> {
    try {
      await this.documentos.send(
        new PutCommand({
          TableName: this.tabla,
          Item: aElemento(operacion),
          ConditionExpression: 'attribute_not_exists(id_operacion)',
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async leer(idOperacion: string): Promise<OperacionProcesada | undefined> {
    const { Item } = await this.documentos.send(
      new GetCommand({
        TableName: this.tabla,
        Key: { id_operacion: idOperacion },
        ConsistentRead: true,
      }),
    );
    return Item ? deElemento(Item as ElementoOperacion) : undefined;
  }

  async tomar(
    idOperacion: string,
    actualizadaEnLeida: string,
    ahora: string,
  ): Promise<boolean> {
    try {
      await this.documentos.send(
        new UpdateCommand({
          TableName: this.tabla,
          Key: { id_operacion: idOperacion },
          UpdateExpression: 'SET actualizada_en = :ahora',
          ConditionExpression:
            'estado = :procesando AND actualizada_en = :leida',
          ExpressionAttributeValues: {
            ':ahora': ahora,
            ':procesando': 'PROCESANDO',
            ':leida': actualizadaEnLeida,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async completar(
    idOperacion: string,
    estado: 'PROCESADO' | 'ERROR',
    respuesta: RespuestaGuardada,
    ahora: string,
  ): Promise<void> {
    try {
      await this.documentos.send(
        new UpdateCommand({
          TableName: this.tabla,
          Key: { id_operacion: idOperacion },
          UpdateExpression:
            'SET estado = :estado, respuesta = :respuesta, actualizada_en = :ahora',
          ConditionExpression: 'estado = :procesando',
          ExpressionAttributeValues: {
            ':estado': estado,
            ':respuesta': JSON.stringify(respuesta),
            ':ahora': ahora,
            ':procesando': 'PROCESANDO',
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      // Otro intento la completó o la liberó antes: lo que quedó guardado manda.
      this.registro.warn(
        `idOperacion=${idOperacion} ya no estaba PROCESANDO al completarla`,
      );
    }
  }

  async liberar(idOperacion: string): Promise<void> {
    try {
      await this.documentos.send(
        new DeleteCommand({
          TableName: this.tabla,
          Key: { id_operacion: idOperacion },
          ConditionExpression: 'estado = :procesando',
          ExpressionAttributeValues: { ':procesando': 'PROCESANDO' },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }
}

function aElemento(operacion: OperacionProcesada): ElementoOperacion {
  return {
    id_operacion: operacion.idOperacion,
    id_dispositivo: operacion.idDispositivo,
    usuario_id: operacion.usuarioId,
    tipo: operacion.tipo,
    servicio_destino: operacion.servicioDestino,
    estado: operacion.estado,
    ...(operacion.respuesta
      ? { respuesta: JSON.stringify(operacion.respuesta) }
      : {}),
    recibida_en: operacion.recibidaEn,
    actualizada_en: operacion.actualizadaEn,
    expira_en: operacion.expiraEn,
  };
}

function deElemento(elemento: ElementoOperacion): OperacionProcesada {
  return {
    idOperacion: elemento.id_operacion,
    idDispositivo: elemento.id_dispositivo,
    usuarioId: elemento.usuario_id,
    tipo: elemento.tipo,
    servicioDestino: elemento.servicio_destino,
    estado: elemento.estado,
    ...(elemento.respuesta
      ? { respuesta: JSON.parse(elemento.respuesta) as RespuestaGuardada }
      : {}),
    recibidaEn: elemento.recibida_en,
    actualizadaEn: elemento.actualizada_en,
    expiraEn: Number(elemento.expira_en),
  };
}
