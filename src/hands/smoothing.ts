/**
 * Filtro One-Euro simplificado para suavizar landmarks y eliminar jitter
 * manteniendo baja latencia en movimientos rápidos.
 */
export class OneEuroFilter {
  private prev?: number;
  private prevDeriv = 0;

  constructor(
    private minCutoff = 1.5,
    private beta = 0.05,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, dt: number): number {
    if (this.prev === undefined || dt <= 0) {
      this.prev = value;
      return value;
    }
    const deriv = (value - this.prev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.prevDeriv = aD * deriv + (1 - aD) * this.prevDeriv;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.prevDeriv);
    const a = this.alpha(cutoff, dt);
    this.prev = a * value + (1 - a) * this.prev;
    return this.prev;
  }

  reset(): void {
    this.prev = undefined;
    this.prevDeriv = 0;
  }
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Suaviza un conjunto de landmarks (21 puntos × xyz) con One-Euro. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = [];

  constructor(private numPoints = 21) {
    for (let i = 0; i < this.numPoints; i++) {
      this.filters.push([
        new OneEuroFilter(),
        new OneEuroFilter(),
        new OneEuroFilter(),
      ]);
    }
  }

  smooth(landmarks: Point3[], dt: number): Point3[] {
    return landmarks.map((p, i) => {
      const f = this.filters[i];
      if (!f) return p;
      return {
        x: f[0].filter(p.x, dt),
        y: f[1].filter(p.y, dt),
        z: f[2].filter(p.z, dt),
      };
    });
  }

  reset(): void {
    for (const f of this.filters) f.forEach((x) => x.reset());
  }
}
