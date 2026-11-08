import { Controller, Get } from '@nestjs/common';
import { Publico } from '../../compartido/infraestructura/auth/publico.decorator.js';

@Controller('salud')
export class SaludController {
  /** Sin token y sin tocar DynamoDB ni los servicios dueños: solo dice que el proceso responde. */
  @Publico()
  @Get()
  consultar(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
