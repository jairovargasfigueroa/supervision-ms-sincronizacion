# Sincronización: qué hace

Puerta de la app de obra para trabajar sin señal (capa 1). Se crea en la funcionalidad 101; diseño en `docs/specs/101-registro-sin-senal/diseno.md` de la carpeta general.

## Responsabilidades

- Recibir lotes de operaciones registradas en el celular (`POST /lotes`) y procesar cada una **una sola vez**: guarda cada `idOperacion` en DynamoDB («guardar solo si no existe») y, si se repite, devuelve la respuesta guardada sin volver a llamar al servicio dueño.
- Repartir cada operación por REST al servicio dueño (Materiales u Obras) con el token del usuario y clasificar su respuesta en `PROCESADO`, `ERROR` (rechazo definitivo) o `REINTENTAR`.
- Armar el paquete de datos que la app guarda para trabajar sin señal (`GET /paquete-datos`): obras asignadas en ejecución con sus partidas, su stock y, para el maestro, su diario de los últimos 30 días (103), y materiales activos; con versión (`ETag`) para no volver a descargar lo que no cambió.
- Pedir a Obras la URL firmada de S3 para subir una foto de avance (`POST /fotos/url-subida`, 102): la foto va directo del celular a S3 y no pasa por Sincronización.
- Recordar, por celular, el último usuario, la obra con la que trabaja, la última sincronización y la versión de datos entregada (`estado_dispositivo`).

## Casos de uso

| Caso de uso | Quién | Etapa |
|---|---|---|
| Procesar un lote de operaciones (`ProcesarLote`) | App (maestro, almacenero) | 101 (`MOVIMIENTO_MATERIAL`), 102 (`FOTO_AVANCE`), 103 (`ENTRADA_DIARIO`) |
| Armar el paquete de datos (`ArmarPaqueteDatos`) | App (maestro, almacenero) | 101; 103 (diario de cada obra para el maestro) |
| Pedir la URL de subida de una foto (`PedirUrlSubida`) | App (maestro) | 102 |

## Qué no hace

- No recibe archivos: las fotos se suben directo a S3 con la URL firmada de Obras (102).
- No guarda datos del negocio: solo el registro de operaciones procesadas (30 días) y el estado de cada celular.
- No valida reglas del negocio (obras asignadas, periodo cerrado, material activo, roles por endpoint): las aplica el servicio dueño con el token del usuario, y Sincronización devuelve su respuesta.
- No publica ni escucha eventos (no usa RabbitMQ).
- No tiene cliente propio en Keycloak: reenvía el token del usuario.

## Reglas

- Primera barrera de idempotencia (convenciones, «Idempotencia»); la segunda es la idempotencia por `id` de cada servicio dueño.
- Nunca registra el contenido de `datos` de una operación ni tokens: un renglón por operación con `X-Request-Id`, `idOperacion`, `tipo`, resultado y `status`.
