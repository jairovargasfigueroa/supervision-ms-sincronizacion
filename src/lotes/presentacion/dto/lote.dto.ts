import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { aplanar } from '../../../compartido/infraestructura/http/validacion.js';

/** Máximo de operaciones por lote (decisión del equipo, 101). */
export const MAXIMO_OPERACIONES = 20;

export class OperacionDto {
  @IsUUID('all')
  idOperacion: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsISO8601({ strict: true })
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/, {
    message: 'creadaEn debe llevar hora y zona (Z o ±hh:mm)',
  })
  creadaEn: string;

  /** Se envía tal cual al servicio dueño, que valida su contenido. */
  @IsDefined()
  @IsObject()
  datos: Record<string, unknown>;
}

export class LoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAXIMO_OPERACIONES)
  @ValidateNested({ each: true })
  @Type(() => OperacionDto)
  operaciones: OperacionDto[];
}

/**
 * Valida el cuerpo de `POST /lotes`. Todo error del lote completo es `400 LOTE_INVALIDO`
 * (vacío, más de 20 operaciones, `idOperacion` repetido dentro del lote, datos mal formados),
 * con `errores[]` por campo. No usa el `ValidationPipe` global, que respondería `DATOS_INVALIDOS`.
 */
export function validarLote(cuerpo: unknown): LoteDto {
  const lote = plainToInstance(LoteDto, esObjeto(cuerpo) ? cuerpo : {});
  const errores = aplanar(
    validateSync(lote, {
      whitelist: true,
      validationError: { target: false, value: false },
    }),
  );
  if (errores.length === 0) {
    const vistos = new Map<string, number>();
    lote.operaciones.forEach((operacion, indice) => {
      if (vistos.has(operacion.idOperacion)) {
        errores.push({
          campo: `operaciones.${indice}.idOperacion`,
          mensaje: `idOperacion repetido (igual al de operaciones.${vistos.get(operacion.idOperacion)})`,
        });
      } else {
        vistos.set(operacion.idOperacion, indice);
      }
    });
  }
  if (errores.length > 0) {
    throw new BadRequestException({
      codigo: 'LOTE_INVALIDO',
      detail: 'El lote no es válido.',
      errores,
    });
  }
  return lote;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}
