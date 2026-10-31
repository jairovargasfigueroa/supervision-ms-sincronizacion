/**
 * Presupuesto de tiempo de un lote (101, paso 5): pasados `limiteMs` desde que empezó, las
 * operaciones que faltan no se empiezan y vuelven `REINTENTAR` con `504 TIEMPO_AGOTADO`.
 */
export class Presupuesto {
  private readonly inicio: number;

  constructor(
    private readonly limiteMs: number,
    private readonly reloj: () => number = () => Date.now(),
  ) {
    this.inicio = reloj();
  }

  agotado(): boolean {
    return this.reloj() - this.inicio >= this.limiteMs;
  }
}
