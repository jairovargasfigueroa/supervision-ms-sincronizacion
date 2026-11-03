# syntax=docker/dockerfile:1
# Imagen de Sincronización (601): dos etapas, sin herramientas de compilación ni configuración.
# Todo (Keycloak, Obras, Materiales, DynamoDB) entra por variables de entorno al arrancar.
# Sin adaptador de Lambda: si la 602 la pone en Lambda, lo agrega allá.

FROM node:24.22.0-alpine3.24 AS construir
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.22.0-alpine3.24 AS final
LABEL org.opencontainers.image.source="https://github.com/jairovargasfigueroa/supervision-ms-sincronizacion" \
      org.opencontainers.image.title="supervision-ms-sincronizacion" \
      org.opencontainers.image.description="Servicio Sincronización de la Plataforma de supervisión de obras"
ENV NODE_ENV=production \
    PORT=8084
WORKDIR /app
# Archivos de root y solo lectura para el proceso; corre con el usuario sin privilegios de la imagen
COPY --from=construir /app/package.json ./
COPY --from=construir /app/node_modules ./node_modules
COPY --from=construir /app/dist ./dist
USER node
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8084) + '/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
