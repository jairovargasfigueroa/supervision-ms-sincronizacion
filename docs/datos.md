# Sincronización: datos (DynamoDB)

Tablas propias en DynamoDB (AWS SDK v3). Ningún otro servicio las lee. Modo *on demand*. En desarrollo, DynamoDB Local del Docker Compose de infra (`DYNAMODB_ENDPOINT=http://localhost:8000`); con `DYNAMODB_CREAR_TABLAS=true` el servicio crea las tablas al iniciar si no existen (solo en desarrollo y pruebas; en AWS las crea la infraestructura, 602).

Nombres de atributos en `snake_case`; fechas en ISO 8601 UTC salvo `expira_en`.

## operacion_procesada (101)

Clave de partición `id_operacion` · TTL sobre `expira_en`.

| Atributo | Tipo | Notas |
|---|---|---|
| id_operacion | S | UUID creado en el celular (es el `id` del registro cuando la operación crea uno) |
| id_dispositivo | S | encabezado `X-Dispositivo-Id` |
| usuario_id | S | `sub` del token |
| tipo | S | `MOVIMIENTO_MATERIAL` (101); `FOTO_AVANCE` (102); `ENTRADA_DIARIO` (103) |
| servicio_destino | S | `materiales` u `obras` |
| estado | S | `PROCESANDO`, `PROCESADO`, `ERROR` |
| respuesta | S | JSON `{ status, cuerpo }` del servicio dueño (en `ERROR`, el Problem Details); ausente mientras está `PROCESANDO` |
| recibida_en | S | ISO 8601 UTC |
| actualizada_en | S | ISO 8601 UTC; sirve para detectar un `PROCESANDO` abandonado (más de 60 s) |
| expira_en | N | segundos *epoch* = `recibida_en` + 30 días |

- Se escribe con `PutItem` condicionado a `attribute_not_exists(id_operacion)`. Un `PROCESANDO` abandonado se toma con `UpdateItem` condicionado a `estado = PROCESANDO AND actualizada_en = <valor leído>`. Al reintentar (respuesta `401`, `408`, `429`, `5xx`, tiempo agotado o error de red) se borra con `DeleteItem` condicionado a `estado = PROCESANDO`.
- No se verificó si DynamoDB Local borra los vencidos por TTL: las pruebas comprueban el cálculo de `expira_en`. Si una operación llega después de 30 días, la frena la idempotencia del servicio dueño.

## estado_dispositivo (101)

Clave de partición `id_dispositivo`.

| Atributo | Tipo | Notas |
|---|---|---|
| id_dispositivo | S | UUID generado por la app al instalarse |
| usuario_id | S | último usuario que sincronizó desde ese celular |
| obra_id | S | obra con la que trabaja el usuario en la app (`obraActivaId`); solo se escribe si vino |
| ultima_sincronizacion | S | ISO 8601 UTC; último paquete o lote atendido con éxito |
| version_datos | S | `versionDatos` del último paquete entregado |

- `GET /paquete-datos` escribe `usuario_id`, `obra_id` (si vino `obraActivaId`), `version_datos` y `ultima_sincronizacion`; `POST /lotes` escribe `usuario_id` y `ultima_sincronizacion`. Con `UpdateItem` (no borra los demás atributos).
