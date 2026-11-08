/** Datos del usuario que se toman del token ya validado. */
export interface UsuarioAutenticado {
  /** `sub` del token. */
  id: string;
  /** `realm_access.roles` del token. */
  roles: string[];
  /** Cliente desde el que se inició sesión (`azp`): decide qué roles cuentan (convenciones). */
  azp?: string;
  /**
   * Token crudo, para reenviarlo a Obras y Materiales (Sincronización no tiene cliente propio
   * en Keycloak). Nunca se registra.
   */
  token: string;
}
