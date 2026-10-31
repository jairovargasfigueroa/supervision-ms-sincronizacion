import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CompartidoModule } from '../../src/compartido/compartido.module.js';
import { CONJUNTO_CLAVES } from '../../src/compartido/infraestructura/auth/validador-token.js';
import { DynamoDBModule } from '../../src/compartido/infraestructura/dynamodb/dynamodb.module.js';
import { ServiciosModule } from '../../src/compartido/infraestructura/servicios/servicios.module.js';
import { crearDynamoPrueba, type DynamoPrueba } from './dynamodb-prueba.js';
import { ServidorSimulado } from './servidor-simulado.js';
import {
  AZP,
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './tokens-prueba.js';

export const DISPOSITIVO_PRUEBA = '5b3f2c1e-8d4a-4f6b-9c2e-1a2b3c4d5e6f';
export const USUARIO_PRUEBA = '11111111-1111-1111-1111-111111111111';

export interface AppPrueba {
  app: INestApplication;
  claves: ClavesPrueba;
  dynamo: DynamoPrueba;
  /** Simula a Obras (`OBRAS_URL`). */
  obras: ServidorSimulado;
  /** Simula a Materiales (`MATERIALES_URL`). */
  materiales: ServidorSimulado;
  /** Token del almacenero desde la app (`azp = app-obra`); `sub` = `USUARIO_PRUEBA` salvo que se cambie. */
  tokenAlmacenero(sub?: string): Promise<string>;
  cerrar(): Promise<void>;
}

/**
 * App HTTP de prueba con DynamoDB Local (tablas propias), servidores simulados de Obras y
 * Materiales y tokens firmados con una clave de prueba. `config` cambia variables (por ejemplo
 * `TIEMPO_MAXIMO_LLAMADA_MS`).
 */
export async function crearAppPrueba(
  modulos: (Type | DynamicModule)[],
  config: Record<string, string> = {},
): Promise<AppPrueba> {
  const claves = await crearClavesPrueba();
  const dynamo = crearDynamoPrueba();
  const obras = await ServidorSimulado.iniciar();
  const materiales = await ServidorSimulado.iniciar();
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            ...CONFIG_PRUEBA,
            ...dynamo.config,
            OBRAS_URL: obras.url,
            MATERIALES_URL: materiales.url,
            ...config,
          }),
        ],
      }),
      CompartidoModule,
      DynamoDBModule,
      ServiciosModule,
      ...modulos,
    ],
  })
    .overrideProvider(CONJUNTO_CLAVES)
    .useValue(claves.jwks)
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  await app.init();
  return {
    app,
    claves,
    dynamo,
    obras,
    materiales,
    tokenAlmacenero: (sub = USUARIO_PRUEBA) =>
      claves.firmarConRoles(['almacenero'], AZP.appObra, {
        payload: { sub },
      }),
    async cerrar() {
      await app.close();
      await obras.cerrar();
      await materiales.cerrar();
      await dynamo.cerrar();
    },
  };
}
