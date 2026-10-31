import { Body, Controller, HttpException, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import { RequestId } from '../../compartido/infraestructura/http/request-id.decorator.js';
import { PedirUrlSubidaCasoUso } from '../aplicacion/casos-uso/pedir-url-subida.caso-uso.js';
import { UrlSubidaDto } from './dto/url-subida.dto.js';

@Controller('fotos')
export class FotosController {
  constructor(private readonly pedirUrlSubida: PedirUrlSubidaCasoUso) {}

  /**
   * `POST /fotos/url-subida` (102). Roles: `maestro` (los de Obras para la URL de subida desde
   * la app). Devuelve la respuesta de Obras tal cual; sus errores `4xx` con el mismo `status` y
   * `codigo`; `5xx` → `503`; tiempo agotado → `504`.
   */
  @Roles('maestro')
  @Post('url-subida')
  async pedir(
    @Body() cuerpo: UrlSubidaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @RequestId() requestId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<unknown> {
    const resultado = await this.pedirUrlSubida.ejecutar(
      cuerpo.obraId,
      cuerpo.fotoId,
      { token: usuario.token, requestId },
    );
    if (!resultado.exito) {
      // problem-details.filter.ts lo devuelve con el mismo status, codigo, detail y errores.
      throw new HttpException(resultado.problema, resultado.problema.status);
    }
    respuesta.status(resultado.status);
    return resultado.cuerpo;
  }
}
