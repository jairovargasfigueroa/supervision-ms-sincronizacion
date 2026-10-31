import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { leerConfiguracion } from '../../../configuracion.js';
import { ClienteRest } from './cliente-rest.js';
import { MaterialesCliente } from './materiales.cliente.js';
import { ObrasCliente } from './obras.cliente.js';

/** Clientes REST de Obras (`OBRAS_URL`) y Materiales (`MATERIALES_URL`), con tiempo máximo de 5 s. */
@Global()
@Module({
  providers: [
    {
      provide: ObrasCliente,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { obrasUrl, tiempoMaximoLlamadaMs } = leerConfiguracion(config);
        return new ObrasCliente(
          new ClienteRest('Obras', obrasUrl, tiempoMaximoLlamadaMs),
        );
      },
    },
    {
      provide: MaterialesCliente,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { materialesUrl, tiempoMaximoLlamadaMs } =
          leerConfiguracion(config);
        return new MaterialesCliente(
          new ClienteRest('Materiales', materialesUrl, tiempoMaximoLlamadaMs),
        );
      },
    },
  ],
  exports: [ObrasCliente, MaterialesCliente],
})
export class ServiciosModule {}
