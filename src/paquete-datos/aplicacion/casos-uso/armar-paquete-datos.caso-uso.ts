import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorAplicacion } from '../../../compartido/dominio/error-aplicacion.js';
import {
  ESTADO_DISPOSITIVO_REPOSITORIO,
  type EstadoDispositivoRepositorio,
} from '../../../dispositivos/aplicacion/puertos/estado-dispositivo.repositorio.js';
import {
  ordenarContenido,
  type PaqueteDatos,
} from '../../dominio/paquete-datos.js';
import { calcularVersionDatos } from '../../dominio/version-datos.js';
import {
  type ContextoFuente,
  FUENTE_DATOS,
  type FuenteDatos,
  FuenteNoDisponibleError,
} from '../puertos/fuente-datos.js';

export interface EntradaPaquete {
  usuarioId: string;
  idDispositivo: string;
  obraActivaId?: string;
  contexto: ContextoFuente;
}

/**
 * `GET /paquete-datos` (101): arma el paquete con el token del usuario (obras en ejecución con
 * sus partidas y su stock, y materiales activos), calcula `versionDatos` y actualiza
 * `estado_dispositivo`. Si Obras o Materiales fallan: `503 SERVICIO_NO_DISPONIBLE` o
 * `504 TIEMPO_AGOTADO` (la app conserva los datos que ya tenía).
 */
@Injectable()
export class ArmarPaqueteDatosCasoUso {
  private readonly registro = new Logger('PaqueteDatos');

  constructor(
    @Inject(FUENTE_DATOS) private readonly fuente: FuenteDatos,
    @Inject(ESTADO_DISPOSITIVO_REPOSITORIO)
    private readonly dispositivos: EstadoDispositivoRepositorio,
  ) {}

  async ejecutar(entrada: EntradaPaquete): Promise<PaqueteDatos> {
    const { contexto } = entrada;
    let contenido;
    try {
      const [obras, materiales] = await Promise.all([
        this.fuente.obrasEnEjecucion(contexto).then((obras) =>
          // Por cada obra, en paralelo: partidas (Obras) y stock (Materiales).
          Promise.all(
            obras.map(async (obra) => {
              const [partidas, stock] = await Promise.all([
                this.fuente.partidas(obra.id, contexto),
                this.fuente.stock(obra.id, contexto),
              ]);
              return { ...obra, partidas, stock };
            }),
          ),
        ),
        this.fuente.materialesActivos(contexto),
      ]);
      contenido = ordenarContenido({ obras, materiales });
    } catch (error) {
      if (error instanceof FuenteNoDisponibleError) {
        this.registro.warn(
          `requestId=${contexto.requestId} ${error.servicio}: ${error.motivo} (${error.message})`,
        );
        throw error.motivo === 'TIEMPO_AGOTADO'
          ? new ErrorAplicacion(
              'TIEMPO_AGOTADO',
              `El servicio de ${nombre(error.servicio)} tardó demasiado en responder.`,
              504,
            )
          : new ErrorAplicacion(
              'SERVICIO_NO_DISPONIBLE',
              `El servicio de ${nombre(error.servicio)} no está disponible.`,
              503,
            );
      }
      throw error;
    }

    const paquete: PaqueteDatos = {
      versionDatos: calcularVersionDatos(contenido),
      generadoEn: new Date().toISOString(),
      ...contenido,
    };
    await this.actualizarDispositivo(entrada, paquete);
    return paquete;
  }

  private async actualizarDispositivo(
    entrada: EntradaPaquete,
    paquete: PaqueteDatos,
  ): Promise<void> {
    try {
      await this.dispositivos.registrarPaquete(
        entrada.idDispositivo,
        entrada.usuarioId,
        entrada.obraActivaId,
        paquete.versionDatos,
        paquete.generadoEn,
      );
    } catch (error) {
      // El paquete se entrega igual: estado_dispositivo es informativo.
      this.registro.warn(
        `requestId=${entrada.contexto.requestId} no se pudo actualizar estado_dispositivo: ${error instanceof Error ? error.name : 'desconocido'}`,
      );
    }
  }
}

function nombre(servicio: 'obras' | 'materiales'): string {
  return servicio === 'obras' ? 'Obras' : 'Materiales';
}
