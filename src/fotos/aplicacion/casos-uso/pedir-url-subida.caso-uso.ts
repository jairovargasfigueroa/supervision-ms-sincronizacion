import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  traducirRespuestaUrlSubida,
  type RespuestaUrlSubida,
} from '../../dominio/respuesta-url-subida.js';
import {
  type ContextoFotos,
  SERVICIO_FOTOS,
  type ServicioFotos,
} from '../puertos/servicio-fotos.js';

/**
 * `POST /fotos/url-subida` (102): pide a Obras la URL firmada de S3 con el token del usuario.
 * Sin estado: no guarda nada en DynamoDB.
 */
@Injectable()
export class PedirUrlSubidaCasoUso {
  private readonly registro = new Logger('Fotos');

  constructor(@Inject(SERVICIO_FOTOS) private readonly obras: ServicioFotos) {}

  async ejecutar(
    obraId: string,
    fotoId: string,
    contexto: ContextoFotos,
  ): Promise<RespuestaUrlSubida> {
    const resultado = traducirRespuestaUrlSubida(
      await this.obras.pedirUrlSubida(obraId, fotoId, contexto),
    );
    if (!resultado.exito && resultado.problema.status >= 500) {
      this.registro.warn(
        `requestId=${contexto.requestId} url-subida: ${resultado.problema.codigo}`,
      );
    }
    return resultado;
  }
}
