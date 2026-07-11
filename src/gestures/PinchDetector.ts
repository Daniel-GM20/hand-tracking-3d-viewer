import type { HandData } from '../hands/HandTracker';
import type { Point3 } from '../hands/smoothing';

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_MCP = 9;

export interface PinchState {
  active: boolean;
  /** Punto medio entre pulgar e índice (normalizado 0..1). */
  point: Point3;
}

function dist(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Detecta pinch (pulgar+índice) por mano, con histéresis para evitar
 * parpadeo. La distancia se normaliza por el tamaño de la mano
 * (muñeca → nudillo medio) para ser independiente de la distancia a cámara.
 */
export class PinchDetector {
  private active = [false, false];

  private readonly onThreshold = 0.45; // relativo al tamaño de la mano
  private readonly offThreshold = 0.65;

  detect(hand: HandData, slot: number): PinchState {
    const lm = hand.landmarks;
    const thumb = lm[THUMB_TIP];
    const index = lm[INDEX_TIP];
    const handSize = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-6;
    const pinchDist = dist(thumb, index) / handSize;

    const wasActive = this.active[slot];
    const isActive = wasActive
      ? pinchDist < this.offThreshold
      : pinchDist < this.onThreshold;
    this.active[slot] = isActive;

    return {
      active: isActive,
      point: {
        x: (thumb.x + index.x) / 2,
        y: (thumb.y + index.y) / 2,
        z: (thumb.z + index.z) / 2,
      },
    };
  }

  reset(slot: number): void {
    this.active[slot] = false;
  }
}
