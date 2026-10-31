import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompartidoModule } from './compartido/compartido.module.js';
import { DynamoDBModule } from './compartido/infraestructura/dynamodb/dynamodb.module.js';
import { ServiciosModule } from './compartido/infraestructura/servicios/servicios.module.js';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    // Lee las variables del archivo .env (no se sube al repositorio)
    ConfigModule.forRoot({ isGlobal: true }),
    CompartidoModule,
    DynamoDBModule,
    ServiciosModule,
    SaludModule,
  ],
})
export class AppModule {}
