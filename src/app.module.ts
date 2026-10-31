import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompartidoModule } from './compartido/compartido.module.js';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    // Lee las variables del archivo .env (no se sube al repositorio)
    ConfigModule.forRoot({ isGlobal: true }),
    CompartidoModule,
    SaludModule,
  ],
})
export class AppModule {}
