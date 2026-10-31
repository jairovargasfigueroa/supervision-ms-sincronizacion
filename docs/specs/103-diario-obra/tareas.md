# 103 · Registrar entrada del diario de obra · tareas de `services/sincronizacion`

Requisitos y diseño: `docs/specs/103-diario-obra/` de la carpeta que agrupa los proyectos. Requiere la 101 hecha (el proyecto ya existe).

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Tipo `ENTRADA_DIARIO` en `POST /lotes` (Obras `POST /obras/{obraId}/diario`)
- [x] Campo `diario` por obra en `GET /paquete-datos` solo con rol `maestro`
- [ ] Actualizar `docs/contratos.md` del proyecto; pruebas de la spec
