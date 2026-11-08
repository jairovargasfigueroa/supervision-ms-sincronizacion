import { Injectable } from '@nestjs/common';
import type { ResultadoLlamada } from '../../compartido/infraestructura/servicios/cliente-rest.js';
import {
  MaterialesCliente,
  TAMANO_PAGINA_MATERIALES,
} from '../../compartido/infraestructura/servicios/materiales.cliente.js';
import { ObrasCliente } from '../../compartido/infraestructura/servicios/obras.cliente.js';
import {
  type ContextoFuente,
  type FuenteDatos,
  FuenteNoDisponibleError,
  type ObraEnEjecucion,
} from '../aplicacion/puertos/fuente-datos.js';
import type {
  EntradaDiarioPaquete,
  MaterialPaquete,
  PartidaPaquete,
  StockPaquete,
} from '../dominio/paquete-datos.js';

/** Tope de páginas de `GET /materiales` (10 000 materiales activos): evita un bucle sin fin. */
const MAXIMO_PAGINAS = 100;

type Objeto = Record<string, unknown>;
type Servicio = 'obras' | 'materiales';

/**
 * `FuenteDatos` con los clientes REST de Obras y Materiales. Solo copia los campos del paquete
 * (datos livianos). Una respuesta que no es `2xx` (salvo el `404` del stock), con otra forma,
 * un error de red o un tiempo agotado lanzan `FuenteNoDisponibleError`.
 */
@Injectable()
export class FuenteDatosRest implements FuenteDatos {
  constructor(
    private readonly obras: ObrasCliente,
    private readonly materiales: MaterialesCliente,
  ) {}

  async obrasEnEjecucion(contexto: ContextoFuente): Promise<ObraEnEjecucion[]> {
    const cuerpo = exigirExito(
      'obras',
      'GET /obras',
      await this.obras.listarEnEjecucion(contexto),
    );
    return lista('obras', 'GET /obras', cuerpo).map((obra) => ({
      id: texto('obras', obra.id),
      nombre: texto('obras', obra.nombre),
      ubicacion: texto('obras', obra.ubicacion ?? ''),
    }));
  }

  async partidas(
    obraId: string,
    contexto: ContextoFuente,
  ): Promise<PartidaPaquete[]> {
    const cuerpo = exigirExito(
      'obras',
      'GET /obras/{id}',
      await this.obras.obtener(obraId, contexto),
    );
    const partidas = esObjeto(cuerpo) ? cuerpo.partidas : undefined;
    return lista('obras', 'GET /obras/{id}', partidas).map((partida) => ({
      id: texto('obras', partida.id),
      codigo: texto('obras', partida.codigo),
      nombre: texto('obras', partida.nombre),
      unidad: texto('obras', partida.unidad),
    }));
  }

  async stock(
    obraId: string,
    contexto: ContextoFuente,
  ): Promise<StockPaquete[]> {
    const resultado = await this.materiales.stockDeObra(obraId, contexto);
    // Obra recién registrada: Materiales todavía no recibió ObraRegistrada.
    if (resultado.tipo === 'RESPUESTA' && resultado.status === 404) return [];
    const cuerpo = exigirExito(
      'materiales',
      'GET /obras/{id}/stock',
      resultado,
    );
    return lista('materiales', 'GET /obras/{id}/stock', cuerpo).map((fila) => ({
      materialId: texto('materiales', fila.materialId),
      cantidad: numero('materiales', fila.cantidad),
      minimo: numero('materiales', fila.minimo),
      estado: texto('materiales', fila.estado),
    }));
  }

  async diario(
    obraId: string,
    contexto: ContextoFuente,
  ): Promise<EntradaDiarioPaquete[]> {
    const resultado = await this.obras.listarDiario(obraId, contexto);
    // 103: si Obras no deja ver el diario de esa obra, va vacío (no falla el paquete).
    if (
      resultado.tipo === 'RESPUESTA' &&
      (resultado.status === 403 || resultado.status === 404)
    ) {
      return [];
    }
    const cuerpo = exigirExito('obras', 'GET /obras/{id}/diario', resultado);
    return lista('obras', 'GET /obras/{id}/diario', cuerpo).map((entrada) => ({
      id: texto('obras', entrada.id),
      fecha: texto('obras', entrada.fecha),
      clima: texto('obras', entrada.clima),
      texto: texto('obras', entrada.texto),
    }));
  }

  async materialesActivos(
    contexto: ContextoFuente,
  ): Promise<MaterialPaquete[]> {
    const materiales: MaterialPaquete[] = [];
    for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina++) {
      const cuerpo = exigirExito(
        'materiales',
        'GET /materiales',
        await this.materiales.listarActivos(pagina, contexto),
      );
      if (!esObjeto(cuerpo)) {
        throw formaInesperada('materiales', 'GET /materiales');
      }
      const items = lista('materiales', 'GET /materiales', cuerpo.items);
      for (const material of items) {
        materiales.push({
          id: texto('materiales', material.id),
          codigo: texto('materiales', material.codigo),
          nombre: texto('materiales', material.nombre),
          unidad: texto('materiales', material.unidad),
          unidadPlural: texto('materiales', material.unidadPlural),
        });
      }
      const total = Number(cuerpo.total);
      if (
        items.length < TAMANO_PAGINA_MATERIALES ||
        !Number.isFinite(total) ||
        materiales.length >= total
      ) {
        return materiales;
      }
    }
    return materiales;
  }
}

function exigirExito(
  servicio: Servicio,
  llamada: string,
  resultado: ResultadoLlamada,
): unknown {
  if (resultado.tipo === 'TIEMPO_AGOTADO') {
    throw new FuenteNoDisponibleError(
      servicio,
      'TIEMPO_AGOTADO',
      `${llamada}: tiempo agotado`,
    );
  }
  if (resultado.tipo === 'ERROR_RED') {
    throw new FuenteNoDisponibleError(
      servicio,
      'SERVICIO_NO_DISPONIBLE',
      `${llamada}: error de red`,
    );
  }
  if (resultado.status < 200 || resultado.status >= 300) {
    throw new FuenteNoDisponibleError(
      servicio,
      'SERVICIO_NO_DISPONIBLE',
      `${llamada}: respondió ${resultado.status}`,
    );
  }
  return resultado.cuerpo;
}

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function lista(servicio: Servicio, llamada: string, valor: unknown): Objeto[] {
  if (!Array.isArray(valor) || !valor.every(esObjeto)) {
    throw formaInesperada(servicio, llamada);
  }
  return valor;
}

function texto(servicio: Servicio, valor: unknown): string {
  if (typeof valor !== 'string') throw formaInesperada(servicio, 'campo');
  return valor;
}

function numero(servicio: Servicio, valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw formaInesperada(servicio, 'campo');
  }
  return valor;
}

function formaInesperada(
  servicio: Servicio,
  llamada: string,
): FuenteNoDisponibleError {
  return new FuenteNoDisponibleError(
    servicio,
    'SERVICIO_NO_DISPONIBLE',
    `${llamada}: respuesta con otra forma`,
  );
}
