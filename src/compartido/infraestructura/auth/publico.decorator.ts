import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

/** Marca una ruta que no exige token ni `X-Dispositivo-Id` (solo `GET /salud`). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
