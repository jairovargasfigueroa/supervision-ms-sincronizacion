# 101 · Registrar material sin señal · tareas de `services/sincronizacion`

Requisitos y diseño: `docs/specs/101-registro-sin-senal/` de la carpeta que agrupa los proyectos. El proyecto todavía no existe: la primera tarea lo crea. Cuando exista, este archivo se copia a `services/sincronizacion/docs/specs/101-registro-sin-senal/tareas.md`.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Crear el proyecto `services/sincronizacion` con NestJS 12 (módulos ES, Vitest, oxlint, Prettier, como Materiales), puerto `8084`, `.env.example` y `.gitignore` con `.env`; repositorio de GitHub `supervision-ms-sincronizacion`, rama `main`
- [x] `CLAUDE.md` del proyecto y `docs/` (`servicio.md`, `datos.md`, `contratos.md`, `specs/README.md`) a partir del diseño de la 101; actualizar la fila del mapa de proyectos en el `CLAUDE.md` general (quitar «todavía no existe»)
- [x] Estructura Clean (`dominio`, `aplicacion`, `infraestructura`, `presentacion`) y `GET /salud`
- [x] Validación del token con `jose` (JWKS, emisor, audiencia `plataforma-api`), `RolesGuard` con `maestro` y `almacenero`; encabezados `X-Dispositivo-Id` y `X-Request-Id`; errores Problem Details
- [ ] Cliente DynamoDB (AWS SDK v3) con `DYNAMODB_ENDPOINT`; creación de las tablas `operacion_procesada` (TTL en `expira_en`) y `estado_dispositivo` cuando `DYNAMODB_CREAR_TABLAS=true`
- [ ] Clientes REST de Obras y Materiales con el token del usuario, `X-Request-Id` y tiempo máximo de 5 s
- [ ] Dominio: clasificación de respuestas del servicio dueño (`PROCESADO`, `ERROR`, `REINTENTAR`) y tabla de tipos de operación (`MOVIMIENTO_MATERIAL`)
- [ ] `POST /lotes`: validación del lote, *conditional put*, respuesta guardada para repetidas, toma de `PROCESANDO` abandonado, borrado condicionado al reintentar, `OPERACION_AJENA`, presupuesto de 20 s
- [ ] `GET /paquete-datos`: armado con Obras y Materiales, `versionDatos` (SHA-256 canónico), `ETag` / `304`, `503` si un servicio falla; actualización de `estado_dispositivo`
- [ ] Compresión gzip de las respuestas y límite de 256 KB en el cuerpo de `POST /lotes`
- [ ] Pruebas de la spec (con DynamoDB Local y servidores simulados de Obras y Materiales)
