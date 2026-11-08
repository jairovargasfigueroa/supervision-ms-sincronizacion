import { IsUUID } from 'class-validator';

/** Cuerpo de `POST /fotos/url-subida` (102). */
export class UrlSubidaDto {
  @IsUUID('all')
  obraId: string;

  /** UUID creado en el celular; es el `id` de la foto y su `idOperacion` en el lote. */
  @IsUUID('all')
  fotoId: string;
}
