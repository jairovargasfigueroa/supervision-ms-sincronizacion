# Especificaciones de Sincronización

Una carpeta por funcionalidad: `NNN-nombre/` con su `tareas.md`. El número coincide con el del plan general (`docs/plan.md` de la carpeta general).

- `requisitos.md` y `diseno.md`: como este servicio solo existe para las funcionalidades de las capas que cruzan la app y los servicios dueños (101, 102, 103), los requisitos y el diseño están en `docs/specs/NNN-nombre/` de la carpeta general; aquí va solo `tareas.md`.
- `tareas.md`: lista de tareas chicas con casillas `- [ ]`; se marcan al terminar cada una (con sus pruebas y su commit).

| Funcionalidad | Qué agrega aquí |
|---|---|
| 101 · Registro de material sin señal | El servicio: `GET /paquete-datos`, `POST /lotes` con `MOVIMIENTO_MATERIAL`, tablas `operacion_procesada` y `estado_dispositivo` |
| 102 · Fotos sin señal | Tipo de operación `FOTO_AVANCE` y `POST /fotos/url-subida` |
| 103 · Diario de obra | Tipo de operación `ENTRADA_DIARIO` y campos del diario en el paquete |
| 301 · Detección de casco y chaleco | Campo opcional `deteccion` en los `datos` de `FOTO_AVANCE`, reenviado tal cual a Obras |
