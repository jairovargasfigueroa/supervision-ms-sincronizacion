# Sincronización: estructura y librerías

Obligatorio para todo el código de este servicio. Si algo no encaja, propón el cambio antes de salirte de esta estructura.

## Librerías

NestJS 12, `@nestjs/config`, `class-validator` 0.15 + `class-transformer` 0.5 (con `ValidationPipe` global, `whitelist` y `transform`), `jose` 6, `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (AWS SDK v3), `compression` (gzip). Las llamadas a Obras y Materiales usan el `fetch` de Node 24 con `AbortSignal.timeout` (sin librería de HTTP). Pruebas: Vitest, `supertest`, DynamoDB Local (contenedor de infra) y servidores HTTP de prueba con `node:http` para simular a Obras y Materiales. Módulos ES: imports con extensión `.js`.

## Árbol (Clean Architecture)

```
src/
  main.ts                          # registros, configurarApp, puerto 8084
  configurar-app.ts                # ajustes de Express que comparten main.ts y las pruebas: sin ETag automático, gzip (compression), cuerpo JSON de 256 KB (413)
  app.module.ts
  configuracion.ts                 # leerConfiguracion: variables de entorno ya convertidas y con valores por defecto (tiempos, URLs, DynamoDB, nombres de tablas)
  compartido/
    compartido.module.ts           # JWKS (CONJUNTO_CLAVES), ValidadorToken, JwtGuard y RolesGuard (APP_GUARD), DispositivoGuard, ValidationPipe (APP_PIPE), filtro (APP_FILTER), middleware X-Request-Id
    dominio/        error-aplicacion.ts (ErrorAplicacion(codigo, mensaje, status))
    infraestructura/
      auth/         validador-token.ts (jose + JWKS), jwt.guard.ts (global), publico.decorator.ts (@Publico),
                    usuario-autenticado.ts (id, nombre, roles, azp y token crudo para reenviarlo), roles.guard.ts (global, después de JwtGuard),
                    roles.decorator.ts (@Roles), roles-efectivos.ts, usuario-actual.decorator.ts (@UsuarioActual)
      http/         problem-details.filter.ts, request-id.middleware.ts, dispositivo.guard.ts (X-Dispositivo-Id: 400 DISPOSITIVO_REQUERIDO),
                    dispositivo.decorator.ts (@Dispositivo), request-id.decorator.ts (@RequestId), solicitud.ts, validacion.ts
      dynamodb/     dynamodb.module.ts (global: CLIENTE_DYNAMODB, DOCUMENTOS_DYNAMODB, TABLAS; crea las tablas al iniciar si DYNAMODB_CREAR_TABLAS=true),
                    tablas.ts (definiciones on demand y crearTablas: idempotente, TTL en expira_en)
      servicios/    servicios.module.ts (global), cliente-rest.ts (llamar: token del usuario, X-Request-Id, tiempo máximo; devuelve ResultadoLlamada: RESPUESTA, TIEMPO_AGOTADO o ERROR_RED),
                    obras.cliente.ts, materiales.cliente.ts
  salud/                           # GET /salud (@Publico, no toca DynamoDB ni los servicios dueños)
    presentacion/   salud.controller.ts
    salud.module.ts
  dispositivos/                    # estado_dispositivo
    aplicacion/puertos/  estado-dispositivo.repositorio.ts (interfaz + token)
    infraestructura/     estado-dispositivo.repositorio.dynamo.ts (UpdateItem)
    dispositivos.module.ts
  lotes/                           # POST /lotes
    dominio/        tipo-operacion.ts (TIPOS_OPERACION: tipo → servicio destino y creaRegistro; validarTipo: TIPO_OPERACION_DESCONOCIDO, OPERACION_INVALIDA),
                    clasificacion.ts (clasificarRespuesta: PROCESADO, ERROR, REINTENTAR), problema.ts (Problem Details propios y genéricos),
                    operacion.ts (OperacionProcesada, ResultadoOperacion, calcularExpiraEn: +30 días, decidirAnteExistente: AJENA, REPETIDA, TOMAR si pasó 60 s, EN_PROCESO),
                    presupuesto.ts (Presupuesto del lote: 20 s)
    aplicacion/
      puertos/      operacion-procesada.repositorio.ts (crearSiNoExiste, leer, tomar, completar, liberar), despachador.ts (enviar(definicion, operacion, contexto))
      casos-uso/    procesar-lote.caso-uso.ts (en orden; DynamoDB caído → REINTENTAR 503; al final, estado_dispositivo)
    infraestructura/
      operacion-procesada.repositorio.dynamo.ts, despachador-rest.ts (MOVIMIENTO_MATERIAL → Materiales POST /movimientos)
    presentacion/
      lotes.controller.ts (cuerpo sin tipo: lo valida validarLote, no el ValidationPipe global), dto/lote.dto.ts (validarLote: 400 LOTE_INVALIDO, 1 a 20, sin ids repetidos), dto/resultado-lote.respuesta.ts
    lotes.module.ts
  paquete-datos/                   # GET /paquete-datos
    dominio/        paquete-datos.ts (tipos y ordenarContenido: listas por id, stock por materialId), version-datos.ts (jsonCanonico y calcularVersionDatos: SHA-256)
    aplicacion/
      puertos/      fuente-datos.ts (obras en ejecución, partidas, stock con 404 → [], materiales activos; FuenteNoDisponibleError)
      casos-uso/    armar-paquete-datos.caso-uso.ts
    infraestructura/ fuente-datos.rest.ts (Obras y Materiales con el token del usuario; solo copia los campos del paquete; todas las páginas de materiales)
    presentacion/   paquete-datos.controller.ts (ETag, If-None-Match → 304), dto/paquete-datos.dto.ts (obraActivaId UUID opcional)
    paquete-datos.module.ts
test/
  utilidades/tokens-prueba.ts      # par de claves RSA de prueba, JWKS local y tokens firmados por rol
  utilidades/servidor-simulado.ts  # servidor HTTP de prueba que simula a Obras y Materiales (respuestas por ruta, cuenta las llamadas, demora)
  utilidades/dynamodb-prueba.ts    # cliente de DynamoDB Local con tablas de prueba (prefijo por archivo) y limpieza
  utilidades/app-prueba.ts         # app HTTP con tokens de prueba, servidores simulados y DynamoDB Local
  app.e2e-spec.ts                  # AppModule completo: /salud y el recorrido de la 101 (paquete, 304, lote, reenvío sin duplicar, versión nueva)
  clientes-rest.e2e-spec.ts        # ObrasCliente y MaterialesCliente contra servidores simulados: token, X-Request-Id, rutas, tiempo agotado, error de red
  dynamodb.e2e-spec.ts             # creación de las tablas, claves, TTL, reinicio y DYNAMODB_CREAR_TABLAS=false (DynamoDB Local)
  http.e2e-spec.ts                 # gzip con Accept-Encoding, 413 ARCHIVO_DEMASIADO_GRANDE pasando los 256 KB, JSON mal escrito
  lotes.e2e-spec.ts                # POST /lotes: nueva, repetida, simultánea, rechazo, reintento, PROCESANDO abandonado, ajena, lote inválido, tipo desconocido, presupuesto, estado_dispositivo
  paquete-datos.e2e-spec.ts        # GET /paquete-datos: campos, orden, ETag y 304, versión, páginas, 503, 504, stock vacío ante 404, estado_dispositivo, roles
  seguridad.e2e-spec.ts            # /salud, token, rol, X-Dispositivo-Id y X-Request-Id (sin DynamoDB; controlador solo de la prueba)
  *.e2e-spec.ts
src/**/*.spec.ts                   # unitarias junto al archivo
```

## Reglas

- `dominio` no importa NestJS ni el AWS SDK. `aplicacion` depende solo de `dominio` y de interfaces de `puertos`.
- Los casos de uso son clases `@Injectable()` con un método `ejecutar(...)`; reciben repositorios y clientes por token de inyección.
- Autenticación igual que Materiales: `JwtGuard` global, `@Publico()` solo en `/salud`; las rutas inexistentes responden `401` sin token válido y `404 RUTA_NO_ENCONTRADA` con token. El JWKS se pide a Keycloak la primera vez que llega un token; en las pruebas se reemplaza `CONJUNTO_CLAVES` por un `createLocalJWKSet`.
- Roles: las rutas de negocio llevan `@Roles('maestro', 'almacenero')`; cuentan los roles de `rolesEfectivos(roles, azp)`.
- El token del usuario se reenvía tal cual a los servicios dueños (`UsuarioAutenticado.token`); nunca se registra.
- Cada petición se registra con su `X-Request-Id` (método, ruta sin la consulta, estado y duración); `POST /lotes` registra además un renglón por operación (`idOperacion`, `tipo`, resultado, `status`). Nunca encabezados, tokens ni `datos`.
- Los nombres de las tablas salen de la configuración (`TABLA_OPERACION_PROCESADA`, `TABLA_ESTADO_DISPOSITIVO`; por defecto `operacion_procesada` y `estado_dispositivo`) para que las pruebas usen tablas propias.
- Nombres de archivo en `kebab-case` con sufijo de tipo (`.caso-uso.ts`, `.controller.ts`, `.dto.ts`, `.repositorio.dynamo.ts`); clases en español.

## Pruebas

- Unitarias del dominio (clasificación, versión de datos, presupuesto) y de los casos de uso con dobles en memoria.
- `test/*.e2e-spec.ts` con DynamoDB Local (`docker compose up -d dynamodb` en infra; `DYNAMODB_ENDPOINT`, por defecto `http://localhost:8000`) y servidores simulados de Obras y Materiales.
- `npm test` y `npm run test:e2e` (los archivos e2e corren de a uno).
