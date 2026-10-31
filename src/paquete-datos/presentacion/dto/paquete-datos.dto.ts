import { IsOptional, IsUUID } from 'class-validator';

/** Consulta de `GET /paquete-datos`. */
export class PaqueteDatosConsultaDto {
  /** Obra con la que trabaja el usuario en la app: solo se guarda en `estado_dispositivo`. */
  @IsOptional()
  @IsUUID('all')
  obraActivaId?: string;
}
