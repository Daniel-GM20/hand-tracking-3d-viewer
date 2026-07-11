import type { HandFrame } from '../hands/HandTracker';

/**
 * Interfaz para gestos modulares: cada gesto recibe el frame de manos
 * y decide su propio estado. Agregar un gesto nuevo = implementar esta
 * interfaz y registrarlo en el GestureEngine.
 */
export interface Gesture {
  update(frame: HandFrame): void;
}

export class GestureEngine {
  private gestures: Gesture[] = [];

  register(gesture: Gesture): void {
    this.gestures.push(gesture);
  }

  update(frame: HandFrame): void {
    for (const g of this.gestures) g.update(frame);
  }
}
