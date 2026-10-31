import { Injectable } from '@nestjs/common';
import { MaterialesCliente } from '../../compartido/infraestructura/servicios/materiales.cliente.js';
import type {
  ContextoEnvio,
  Despachador,
} from '../aplicacion/puertos/despachador.js';
import type { RespuestaDuenio } from '../dominio/clasificacion.js';
import type {
  DefinicionTipo,
  OperacionRecibida,
} from '../dominio/tipo-operacion.js';

/**
 * Llama al servicio dueño de cada tipo (tabla de tipos de operación, 101):
 * `MOVIMIENTO_MATERIAL` → Materiales `POST /movimientos` con cuerpo = `datos`.
 */
@Injectable()
export class DespachadorRest implements Despachador {
  constructor(private readonly materiales: MaterialesCliente) {}

  enviar(
    definicion: DefinicionTipo,
    operacion: OperacionRecibida,
    contexto: ContextoEnvio,
  ): Promise<RespuestaDuenio> {
    switch (definicion.tipo) {
      case 'MOVIMIENTO_MATERIAL':
        return this.materiales.registrarMovimiento(operacion.datos, contexto);
      default:
        // No pasa: validarTipo solo deja pasar los tipos de la tabla.
        throw new Error(`Tipo sin despachador: ${definicion.tipo}`);
    }
  }
}
