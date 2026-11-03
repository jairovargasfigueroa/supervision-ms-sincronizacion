# 601 · Preparar el despliegue · tareas de `services/sincronizacion`

Requisitos y diseño: `docs/specs/601-contenedores-ci/` de la carpeta que agrupa los proyectos. Al implementarla, estas tareas reemplazan a `services/sincronizacion/docs/specs/601-contenedores-ci/tareas.md` (eran del borrador anterior).

Marca cada tarea al terminarla (con sus pruebas y su commit).

- [x] Aplicar «Cambios a contratos y datos» que tocan este proyecto (`docs/`, `CLAUDE.md`, `.env.example`)
- [ ] Revisar que no quede ninguna dirección fija; `NODE_ENV=production`
- [ ] `Dockerfile` en dos etapas y `.dockerignore` (Node 24, usuario `node`, `HEALTHCHECK`); prueba con `/salud`
- [ ] `.github/workflows/ci.yml`: job `prueba` (lint, pruebas unitarias y e2e con DynamoDB Local como servicio, compilación) y job `imagen` (build en PR; *push* a GHCR con `sha-<7>` y `main` en `main`)
