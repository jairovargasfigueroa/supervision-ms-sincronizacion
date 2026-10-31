import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../compartido/infraestructura/auth/roles.decorator.js';
import { rolesEfectivos } from '../../compartido/infraestructura/auth/roles-efectivos.js';
import { UsuarioActual } from '../../compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../compartido/infraestructura/auth/usuario-autenticado.js';
import { Dispositivo } from '../../compartido/infraestructura/http/dispositivo.decorator.js';
import { RequestId } from '../../compartido/infraestructura/http/request-id.decorator.js';
import { ArmarPaqueteDatosCasoUso } from '../aplicacion/casos-uso/armar-paquete-datos.caso-uso.js';
import type { PaqueteDatos } from '../dominio/paquete-datos.js';
import { PaqueteDatosConsultaDto } from './dto/paquete-datos.dto.js';

@Controller('paquete-datos')
export class PaqueteDatosController {
  constructor(private readonly armarPaquete: ArmarPaqueteDatosCasoUso) {}

  /**
   * `GET /paquete-datos` (101): `200` con `ETag: "<versionDatos>"`, o `304` sin cuerpo si el
   * `If-None-Match` trae esa misma versión.
   */
  @Roles('maestro', 'almacenero')
  @Get()
  async obtener(
    @Query() consulta: PaqueteDatosConsultaDto,
    @Headers('if-none-match') siNoCoincide: string | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Dispositivo() idDispositivo: string,
    @RequestId() requestId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<PaqueteDatos | undefined> {
    const paquete = await this.armarPaquete.ejecutar({
      usuarioId: usuario.id,
      idDispositivo,
      obraActivaId: consulta.obraActivaId,
      // 103: el diario de cada obra va solo para el maestro.
      incluirDiario: rolesEfectivos(usuario.roles, usuario.azp).includes(
        'maestro',
      ),
      contexto: { token: usuario.token, requestId },
    });
    respuesta.setHeader('ETag', `"${paquete.versionDatos}"`);
    if (coincide(siNoCoincide, paquete.versionDatos)) {
      respuesta.status(304);
      return undefined;
    }
    return paquete;
  }
}

/** `If-None-Match` con una o varias etiquetas (`"v"`, `W/"v"`, `"a", "b"`) o `*`. */
export function coincide(
  siNoCoincide: string | undefined,
  version: string,
): boolean {
  if (!siNoCoincide) return false;
  return siNoCoincide
    .split(',')
    .map((etiqueta) => etiqueta.trim().replace(/^W\//, ''))
    .some((etiqueta) => etiqueta === '*' || etiqueta === `"${version}"`);
}
