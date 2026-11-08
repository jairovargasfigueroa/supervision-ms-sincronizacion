import { Module } from '@nestjs/common';
import { DispositivosModule } from '../dispositivos/dispositivos.module.js';
import { ArmarPaqueteDatosCasoUso } from './aplicacion/casos-uso/armar-paquete-datos.caso-uso.js';
import { FUENTE_DATOS } from './aplicacion/puertos/fuente-datos.js';
import { FuenteDatosRest } from './infraestructura/fuente-datos.rest.js';
import { PaqueteDatosController } from './presentacion/paquete-datos.controller.js';

/** `GET /paquete-datos` (101). Necesita `DynamoDBModule` y `ServiciosModule` (globales). */
@Module({
  imports: [DispositivosModule],
  controllers: [PaqueteDatosController],
  providers: [
    ArmarPaqueteDatosCasoUso,
    { provide: FUENTE_DATOS, useClass: FuenteDatosRest },
  ],
})
export class PaqueteDatosModule {}
