import { Injectable } from '@nestjs/common';
import { MaterialesCliente } from '../../compartido/infraestructura/servicios/materiales.cliente.js';
import { ObrasCliente } from '../../compartido/infraestructura/servicios/obras.cliente.js';
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
 * - `MOVIMIENTO_MATERIAL` → Materiales `POST /movimientos` con cuerpo = `datos`;
 * - `FOTO_AVANCE` (102) → Obras `POST /obras/{datos.obraId}/fotos` con
 *   `{ id, partidaId, claveArchivo, tomadaEn }` (la 301 agregará `deteccion`);
 * - `ENTRADA_DIARIO` (103) → Obras `POST /obras/{datos.obraId}/diario` con `{ id, fecha, clima, texto }`.
 */
@Injectable()
export class DespachadorRest implements Despachador {
  constructor(
    private readonly materiales: MaterialesCliente,
    private readonly obras: ObrasCliente,
  ) {}

  enviar(
    definicion: DefinicionTipo,
    operacion: OperacionRecibida,
    contexto: ContextoEnvio,
  ): Promise<RespuestaDuenio> {
    switch (definicion.tipo) {
      case 'MOVIMIENTO_MATERIAL':
        return this.materiales.registrarMovimiento(operacion.datos, contexto);
      case 'FOTO_AVANCE': {
        const { id, obraId, partidaId, claveArchivo, tomadaEn } =
          operacion.datos;
        return this.obras.registrarFoto(
          String(obraId),
          { id, partidaId, claveArchivo, tomadaEn },
          contexto,
        );
      }
      case 'ENTRADA_DIARIO': {
        const { id, obraId, fecha, clima, texto } = operacion.datos;
        return this.obras.registrarDiario(
          String(obraId),
          { id, fecha, clima, texto },
          contexto,
        );
      }
      default:
        // No pasa: validarTipo solo deja pasar los tipos de la tabla.
        throw new Error(`Tipo sin despachador: ${definicion.tipo}`);
    }
  }
}
