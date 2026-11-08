import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import { Dispositivo } from '../../compartido/infraestructura/http/dispositivo.decorator.js';
import { RequestId } from '../../compartido/infraestructura/http/request-id.decorator.js';
import { ProcesarLoteCasoUso } from '../aplicacion/casos-uso/procesar-lote.caso-uso.js';
import { validarLote } from './dto/lote.dto.js';
import type { ResultadoLoteRespuesta } from './dto/resultado-lote.respuesta.js';

@Controller('lotes')
export class LotesController {
  constructor(private readonly procesarLote: ProcesarLoteCasoUso) {}

  /**
   * `POST /lotes` (101). El cuerpo se recibe sin tipo para que el `ValidationPipe` global no lo
   * valide: los errores del lote son `400 LOTE_INVALIDO` (`validarLote`).
   */
  @Roles('maestro', 'almacenero')
  @Post()
  @HttpCode(200)
  async recibir(
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Dispositivo() idDispositivo: string,
    @RequestId() requestId: string,
  ): Promise<ResultadoLoteRespuesta> {
    const lote = validarLote(cuerpo);
    const resultados = await this.procesarLote.ejecutar({
      operaciones: lote.operaciones,
      usuarioId: usuario.id,
      idDispositivo,
      contexto: { token: usuario.token, requestId },
    });
    return { resultados };
  }
}
