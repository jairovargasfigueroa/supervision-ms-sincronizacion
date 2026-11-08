import { Module } from '@nestjs/common';
import { ESTADO_DISPOSITIVO_REPOSITORIO } from './aplicacion/puertos/estado-dispositivo.repositorio.js';
import { EstadoDispositivoRepositorioDynamo } from './infraestructura/estado-dispositivo.repositorio.dynamo.js';

/** `estado_dispositivo`: lo escriben `POST /lotes` y `GET /paquete-datos`. */
@Module({
  providers: [
    {
      provide: ESTADO_DISPOSITIVO_REPOSITORIO,
      useClass: EstadoDispositivoRepositorioDynamo,
    },
  ],
  exports: [ESTADO_DISPOSITIVO_REPOSITORIO],
})
export class DispositivosModule {}
