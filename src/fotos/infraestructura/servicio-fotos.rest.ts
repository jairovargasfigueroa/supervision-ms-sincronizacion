import { Injectable } from '@nestjs/common';
import type { RespuestaDuenio } from '../../compartido/dominio/respuesta-duenio.js';
import { ObrasCliente } from '../../compartido/infraestructura/servicios/obras.cliente.js';
import type {
  ContextoFotos,
  ServicioFotos,
} from '../aplicacion/puertos/servicio-fotos.js';

@Injectable()
export class ServicioFotosRest implements ServicioFotos {
  constructor(private readonly obras: ObrasCliente) {}

  pedirUrlSubida(
    obraId: string,
    fotoId: string,
    contexto: ContextoFotos,
  ): Promise<RespuestaDuenio> {
    return this.obras.pedirUrlSubida(obraId, fotoId, contexto);
  }
}
