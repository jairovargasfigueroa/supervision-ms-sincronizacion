# supervision-ms-sincronizacion

Servicio de Sincronización de la Plataforma de supervisión de obras: puerta de la app de obra para trabajar sin señal (paquete de datos y lotes de operaciones sin duplicados). Se crea en la funcionalidad 101 (capa 1).

## Arranque

```sh
npm install
cp .env.example .env
# en infra: docker compose up -d dynamodb keycloak
npm run start:dev
```

Documentación: `CLAUDE.md` y `docs/`.
