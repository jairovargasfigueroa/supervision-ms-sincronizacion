# Servicio Sincronización

Puerta de la app de obra para trabajar sin señal (capa 1): recibe lotes de operaciones registradas en el celular y las reparte por REST al servicio dueño **sin procesarlas dos veces**, y arma el paquete de datos que la app guarda para trabajar sin señal. Se crea en la funcionalidad 101.

Parte de la «Plataforma de supervisión de obras». Si existe `../../CLAUDE.md` (carpeta que agrupa todos los proyectos), léelo primero: tiene las reglas transversales, el plan y los contratos generales. El diseño de este servicio está en `docs/specs/101-registro-sin-senal/diseno.md` de esa carpeta.

**Estado:** en construcción (101). No implementes una funcionalidad sin su especificación aprobada.

## Stack

- NestJS 12 · TypeScript (módulos ES: imports con extensión `.js`)
- DynamoDB con AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`); en desarrollo, DynamoDB Local del Docker Compose de infra (puerto `8000`)
- Token de Keycloak validado con `jose` (sin cliente propio: reenvía el token del usuario)
- Respuestas con gzip (`compression`)
- Pruebas con Vitest · lint con oxlint · formato con Prettier
- Puerto: `8084` (`PORT`)

## Comandos

```sh
npm install
npm run start:dev    # levantar en modo desarrollo (necesita DynamoDB Local: docker compose up -d dynamodb en infra)
npm test             # pruebas unitarias
npm run test:e2e     # pruebas de punta a punta (con DynamoDB Local)
npm run lint
```

Configuración local: copiar `.env.example` a `.env` y completar. **`.env` nunca se sube.**

## Arquitectura: Clean Architecture

```
src/<modulo>/          lotes, paquete-datos, fotos, dispositivos, salud
  dominio/          tipos de operación, clasificación de respuestas, versión de datos; sin NestJS ni AWS SDK
  aplicacion/       casos de uso (ProcesarLote, ArmarPaqueteDatos) e interfaces de puertos
  infraestructura/  repositorios DynamoDB, clientes REST de Obras y Materiales
  presentacion/     controladores REST y DTOs con validación
```

Las dependencias apuntan hacia adentro. Detalle de archivos en `docs/estructura.md`.

## Reglas del proyecto

- Cada operación se guarda en `operacion_procesada` «solo si no existe»; si se repite, se devuelve la respuesta guardada sin llamar al servicio dueño.
- No valida reglas del negocio: las aplica el servicio dueño con el token del usuario. Sincronización solo clasifica su respuesta (`PROCESADO`, `ERROR`, `REINTENTAR`).
- No guarda datos del negocio ni publica eventos.
- Nunca registra el contenido de `datos`, encabezados ni tokens.
- Lo que guarda está en `docs/datos.md`; lo que expone y consume, en `docs/contratos.md`.

## Documentación

- `docs/estructura.md`: **librerías permitidas y estructura exacta de carpetas y archivos. Obligatorio leerlo antes de escribir código.**
- `docs/servicio.md`: responsabilidades, casos de uso y qué no hace.
- `docs/datos.md`: tablas de DynamoDB.
- `docs/contratos.md`: REST que expone y que consume.
- `docs/specs/`: tareas por funcionalidad.

## Commits

Conventional Commits en español e imperativo (`feat(lotes): agrega POST /lotes`). Sin coautoría ni firmas de la IA.

Git Flow: ramas `feat/`, `fix/`, `docs/`… desde `develop`, que entran por *pull request*; nunca hagas *push* a `main` ni a `develop` (están protegidas). El agente crea y fusiona los PR (merge normal, sin squash) hacia `develop` cuando todas las pruebas pasan. Detalle y definición de terminado: `docs/flujo-trabajo.md` del repo `supervision-docs`.
