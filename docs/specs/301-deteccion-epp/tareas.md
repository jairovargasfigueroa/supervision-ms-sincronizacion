# 301 · Detección de casco y chaleco · tareas de `services/sincronizacion`

Requisitos y diseño: `docs/specs/301-deteccion-epp/` de la carpeta que agrupa los proyectos («Cambios a contratos y datos», `docs/specs/102-fotos-mala-conexion/diseno.md` y contratos de Sincronización). Contratos: `docs/contratos.md` de este proyecto.

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] `FOTO_AVANCE` de `POST /lotes` acepta `deteccion` opcional en `datos` y la reenvía tal cual a Obras `POST /obras/{obraId}/fotos` (sin validarla: la valida Obras); actualizar `docs/contratos.md`; pruebas con y sin `deteccion`
