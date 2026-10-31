# Sincronización: contratos

Fuente para este servicio. La copia general está en `docs/contratos/rest.md` de la carpeta que agrupa los proyectos (sección «Sincronización (puerto 8084)»). Errores en formato Problem Details con `codigo` (convenciones). JSON en `camelCase`. Respuestas comprimidas con gzip cuando el cliente manda `Accept-Encoding: gzip`.

## REST que expone (puerto 8084)

### GET /salud
Sin token ni `X-Dispositivo-Id` · `200 {"estado":"ok"}` (no toca DynamoDB ni los servicios dueños).

### Encabezados comunes (todas las rutas salvo `/salud`)
- `Authorization: Bearer <token>`: se valida firma (JWKS del realm), vencimiento, emisor `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` y audiencia `plataforma-api` con `jose`. Sin token o con uno inválido: `401 NO_AUTENTICADO` (también en rutas que no existen); si Keycloak no responde al pedir el JWKS: `503 SERVICIO_NO_DISPONIBLE`. Con token válido, una ruta que no existe responde `404 RUTA_NO_ENCONTRADA`.
- Roles: `maestro` y `almacenero` (`POST /fotos/url-subida`: solo `maestro`), contados con los roles efectivos según `azp`, convenciones, «Usuario con varios roles». Con otro rol: `403 SIN_PERMISO`. Las reglas finas (obras asignadas, rol por endpoint) las aplica el servicio dueño.
- `X-Dispositivo-Id: <uuid>` obligatorio (UUID del celular). Falta o no es UUID: `400 DISPOSITIVO_REQUERIDO`. Se comprueba después del token y del rol.
- `X-Request-Id`: si llega se usa (hasta 128 caracteres `A-Z a-z 0-9 . _ : -`), si no se genera un UUID; se reenvía a los servicios dueños y siempre vuelve en la respuesta.

### GET /paquete-datos?obraActivaId= · 101
Roles: `maestro`, `almacenero`. Encabezado opcional `If-None-Match: "<versionDatos>"`.

Devuelve `200` con `ETag: "<versionDatos>"`, o `304` sin cuerpo si la versión no cambió:

```json
{
  "versionDatos": "9f2c…(sha256 en hexadecimal)",
  "generadoEn": "2026-11-15T13:00:00Z",
  "obras": [{
    "id": "uuid", "nombre": "Edificio Las Palmas", "ubicacion": "Av. Banzer 4to anillo",
    "partidas": [{ "id": "uuid", "codigo": "P-01", "nombre": "Losa de hormigón armado", "unidad": "m2" }],
    "stock": [{ "materialId": "id", "cantidad": 120.0, "minimo": 100.0, "estado": "JUSTO" }],
    "diario": [{ "id": "uuid", "fecha": "2026-11-15", "clima": "LLUVIA_LEVE", "texto": "Se vació la losa…" }]
  }],
  "materiales": [{ "id": "id", "codigo": "CEM-IP30", "nombre": "Cemento IP-30", "unidad": "bolsa", "unidadPlural": "bolsas" }]
}
```

- Se arma con el token del usuario: Obras `GET /obras?estado=EN_EJECUCION` y, por cada obra, en paralelo, Obras `GET /obras/{id}` (partidas) y Materiales `GET /obras/{id}/stock`; además Materiales `GET /materiales?soloActivos=true` (todas las páginas, de a 100).
- Solo copia los campos de arriba. Si Materiales responde `404` al stock de una obra, envía `stock: []`.
- `diario` (103): solo si el token tiene el rol `maestro` (roles efectivos); para los demás el campo no va y no se pide a Obras. Se arma con Obras `GET /obras/{id}/diario` sin `desde` ni `hasta` (los últimos 30 días), en paralelo con las partidas y el stock. Si Obras responde `403` o `404` para esa obra, se envía `diario: []`; otra falla cuenta como falla del paquete. Entra en `versionDatos` (ordenado por `id`).
- `versionDatos` = SHA-256 (hexadecimal) del JSON del paquete sin `generadoEn`, con las claves ordenadas y las listas ordenadas por `id` (el stock, por `materialId`).
- `obraActivaId` opcional (UUID); solo se guarda en `estado_dispositivo`.
- Actualiza `estado_dispositivo` (`usuario_id`, `obra_id` si vino `obraActivaId`, `version_datos`, `ultima_sincronizacion`), también cuando responde `304`.
- Errores: `401` · `403 SIN_PERMISO` · `400 DISPOSITIVO_REQUERIDO` · `400 DATOS_INVALIDOS` (`obraActivaId` que no es UUID) · `503 SERVICIO_NO_DISPONIBLE` si Obras o Materiales fallan (error de red o respuesta inesperada) · `504 TIEMPO_AGOTADO` si alguno tarda más de 5 s. Cualquier respuesta que no sea `2xx` de Obras o Materiales (salvo el `404` del stock) cuenta como falla.

### POST /fotos/url-subida · 102
Roles: `maestro` (los mismos que `POST /obras/{obraId}/fotos/url-subida` de Obras desde la app). Recibe `{ "obraId": "uuid", "fotoId": "uuid" }`.

Reenvía a Obras `POST /obras/{obraId}/fotos/url-subida { fotoId }` con el token del usuario (tiempo máximo 5 s) y devuelve su respuesta tal cual, con el mismo estado: `{ "url": "https://…", "claveArchivo": "fotos/{obraId}/{fotoId}.jpg", "expiraEn": "…" }`. La app sube la foto con `PUT` directo a esa URL (vence a los 10 minutos: se pide una nueva en cada intento).

- `400`, `403`, `404` o `422` de Obras (y cualquier otro `4xx`) → mismo `status` y `codigo` (también `detail` y `errores`).
- `5xx` de Obras, otra respuesta o error de red → `503 SERVICIO_NO_DISPONIBLE`; tiempo agotado → `504 TIEMPO_AGOTADO`.
- `400 DATOS_INVALIDOS` si `obraId` o `fotoId` faltan o no son UUID (sin llamar a Obras).
- Sin estado: no guarda nada en DynamoDB.

### POST /lotes · 101
Roles: `maestro`, `almacenero`. Cuerpo de hasta 256 KB (más: `413 ARCHIVO_DEMASIADO_GRANDE`).

```json
{
  "operaciones": [{
    "idOperacion": "uuid creado en el celular",
    "tipo": "MOVIMIENTO_MATERIAL",
    "creadaEn": "2026-11-15T14:00:00Z",
    "datos": {
      "id": "uuid (igual a idOperacion)", "obraId": "uuid", "materialId": "id",
      "tipo": "SALIDA", "cantidad": 12.5, "partidaId": "uuid", "registradoEn": "2026-11-15T14:00:00Z"
    }
  }]
}
```

- `operaciones`: de 1 a 20; cada una con `idOperacion` UUID, `tipo` texto no vacío, `creadaEn` ISO 8601 con zona y `datos` objeto. Sin repetir `idOperacion` dentro del lote. Si no: `400 LOTE_INVALIDO` (con `errores[]` por campo).
- Devuelve `200` con un resultado por operación, en el mismo orden:

```json
{
  "resultados": [
    { "idOperacion": "uuid", "estado": "PROCESADO", "repetida": false, "status": 201,
      "respuesta": { "id": "uuid", "periodo": "2026-11", "superaStock": false, "stock": { "cantidad": 107.5, "minimo": 100.0, "estado": "JUSTO" } } },
    { "idOperacion": "uuid", "estado": "ERROR", "repetida": true, "status": 409,
      "respuesta": { "title": "El periodo está cerrado", "status": 409, "detail": "El periodo 2026-10 ya está cerrado.", "codigo": "PERIODO_CERRADO" } },
    { "idOperacion": "uuid", "estado": "REINTENTAR", "repetida": false, "status": 503,
      "respuesta": { "title": "Servicio no disponible", "status": 503, "codigo": "SERVICIO_NO_DISPONIBLE" } }
  ]
}
```

- `estado`: `PROCESADO` (el dueño lo aceptó), `ERROR` (rechazo definitivo; no se reintenta) o `REINTENTAR` (la app lo vuelve a enviar con el mismo `idOperacion`). `repetida: true` cuando sale de lo guardado y no se llamó al dueño.

#### Tipos de operación

| `tipo` | Servicio | Llamada | Espec. |
|---|---|---|---|
| `MOVIMIENTO_MATERIAL` | Materiales | `POST /movimientos` con cuerpo = `datos` | 101 |
| `FOTO_AVANCE` | Obras | `POST /obras/{datos.obraId}/fotos` con `{ id, partidaId, claveArchivo, tomadaEn }` de `datos` (la 301 agrega `deteccion`) | 102 |
| `ENTRADA_DIARIO` | Obras | `POST /obras/{datos.obraId}/diario` con `{ id, fecha, clima, texto }` de `datos` | 103 |

- `tipo` que no está en la tabla → `ERROR` con `400 TIPO_OPERACION_DESCONOCIDO` (no se guarda en DynamoDB).
- En los tipos que crean un registro (`MOVIMIENTO_MATERIAL`, `FOTO_AVANCE`, `ENTRADA_DIARIO`), `idOperacion` debe ser igual a `datos.id` (en `FOTO_AVANCE`, el `fotoId`); si no → `ERROR` con `400 OPERACION_INVALIDA` (no se guarda).
- En los tipos cuya ruta lleva la obra (`FOTO_AVANCE`, `ENTRADA_DIARIO`), sin `datos.obraId` de texto → `ERROR` con `400 OPERACION_INVALIDA` (no se guarda).

#### Procesamiento de cada operación (en orden, una tras otra)

1. `PutItem` en `operacion_procesada` (`PROCESANDO`) solo si no existe.
2. Si ya existía (lectura consistente):
   - de otro usuario → `ERROR` con `403 OPERACION_AJENA` (sin la respuesta guardada);
   - `PROCESADO` o `ERROR` → `status` y `respuesta` guardados con `repetida: true`;
   - `PROCESANDO` de hace más de 60 s → se toma (condicionado al `actualizada_en` leído) y sigue; si otro la tomó antes → `REINTENTAR` con `409 OPERACION_EN_PROCESO`;
   - `PROCESANDO` reciente → `REINTENTAR` con `409 OPERACION_EN_PROCESO`.
3. Llama al dueño con el token del usuario y `X-Request-Id` (tiempo máximo 5 s).
4. Respuesta del dueño:
   - `2xx` → guarda `PROCESADO` → resultado `PROCESADO`;
   - `400`, `403`, `404`, `409`, `422` → guarda `ERROR` con el Problem Details → resultado `ERROR`;
   - `401`, `408`, `429`, `5xx`, tiempo agotado o error de red → borra el elemento (condicionado a `PROCESANDO`) → `REINTENTAR` con el `status` recibido (`401` con código `TOKEN_VENCIDO`), `504 TIEMPO_AGOTADO` o `503 SERVICIO_NO_DISPONIBLE`.
   - otro estado que el diseño no lista (decisión de implementación, a confirmar): otro `4xx` se trata como `ERROR` (el dueño rechazó la petición tal como está) y un `1xx` o `3xx` como `REINTENTAR` con `503 SERVICIO_NO_DISPONIBLE`.
5. Si pasaron 20 s desde que empezó el lote, las que faltan vuelven `REINTENTAR` con `504 TIEMPO_AGOTADO` sin empezarse.
6. Al terminar, actualiza `estado_dispositivo` (`usuario_id`, `ultima_sincronizacion`).

Si DynamoDB falla, la operación vuelve `REINTENTAR` con `503 SERVICIO_NO_DISPONIBLE`.

Errores del lote completo: `400 LOTE_INVALIDO` · `401` · `403 SIN_PERMISO` · `400 DISPOSITIVO_REQUERIDO` · `413 ARCHIVO_DEMASIADO_GRANDE`.

## REST que consume (con el token del usuario y `X-Request-Id`, tiempo máximo 5 s)

| Servicio | Llamada | Para |
|---|---|---|
| Obras (`OBRAS_URL`) | `GET /obras?estado=EN_EJECUCION` | obras del paquete (Obras ya filtra por asignadas) |
| Obras | `GET /obras/{id}` | partidas de cada obra |
| Materiales (`MATERIALES_URL`) | `GET /materiales?soloActivos=true&pagina=&tamano=100` | materiales activos del paquete |
| Materiales | `GET /obras/{obraId}/stock` | stock de cada obra (`404` → `[]`) |
| Materiales | `POST /movimientos` | operación `MOVIMIENTO_MATERIAL` |
| Obras | `POST /obras/{obraId}/fotos/url-subida` | `POST /fotos/url-subida` (102) |
| Obras | `POST /obras/{obraId}/fotos` | operación `FOTO_AVANCE` (102) |
| Obras | `POST /obras/{obraId}/diario` | operación `ENTRADA_DIARIO` (103) |
| Obras | `GET /obras/{obraId}/diario` | `diario` de cada obra en el paquete del maestro (103; `403`/`404` → `[]`) |

## Eventos

No publica ni escucha eventos.
