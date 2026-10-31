import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { leerConfiguracion } from '../configuracion.js';
import { DispositivosModule } from '../dispositivos/dispositivos.module.js';
import {
  ProcesarLoteCasoUso,
  TIEMPO_MAXIMO_LOTE,
} from './aplicacion/casos-uso/procesar-lote.caso-uso.js';
import { DESPACHADOR } from './aplicacion/puertos/despachador.js';
import { OPERACION_PROCESADA_REPOSITORIO } from './aplicacion/puertos/operacion-procesada.repositorio.js';
import { DespachadorRest } from './infraestructura/despachador-rest.js';
import { OperacionProcesadaRepositorioDynamo } from './infraestructura/operacion-procesada.repositorio.dynamo.js';
import { LotesController } from './presentacion/lotes.controller.js';

/** `POST /lotes` (101). Necesita `DynamoDBModule` y `ServiciosModule` (globales). */
@Module({
  imports: [DispositivosModule],
  controllers: [LotesController],
  providers: [
    ProcesarLoteCasoUso,
    {
      provide: OPERACION_PROCESADA_REPOSITORIO,
      useClass: OperacionProcesadaRepositorioDynamo,
    },
    { provide: DESPACHADOR, useClass: DespachadorRest },
    {
      provide: TIEMPO_MAXIMO_LOTE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        leerConfiguracion(config).tiempoMaximoLoteMs,
    },
  ],
})
export class LotesModule {}
