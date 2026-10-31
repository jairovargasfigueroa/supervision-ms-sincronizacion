import { Module } from '@nestjs/common';
import { PedirUrlSubidaCasoUso } from './aplicacion/casos-uso/pedir-url-subida.caso-uso.js';
import { SERVICIO_FOTOS } from './aplicacion/puertos/servicio-fotos.js';
import { ServicioFotosRest } from './infraestructura/servicio-fotos.rest.js';
import { FotosController } from './presentacion/fotos.controller.js';

/** `POST /fotos/url-subida` (102). Necesita `ServiciosModule` (global); no usa DynamoDB. */
@Module({
  controllers: [FotosController],
  providers: [
    PedirUrlSubidaCasoUso,
    { provide: SERVICIO_FOTOS, useClass: ServicioFotosRest },
  ],
})
export class FotosModule {}
