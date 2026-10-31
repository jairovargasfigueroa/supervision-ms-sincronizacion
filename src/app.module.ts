import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    // Lee las variables del archivo .env (no se sube al repositorio)
    ConfigModule.forRoot({ isGlobal: true }),
    SaludModule,
  ],
})
export class AppModule {}
