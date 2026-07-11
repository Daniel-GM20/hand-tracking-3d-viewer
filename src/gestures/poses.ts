import type { HandData } from '../hands/HandTracker';
import type { Point3 } from '../hands/smoothing';
import { PinchDetector } from './PinchDetector';

export interface HandPose {
  handedness: 'Left' | 'Right';
  /** Pulgar + índice juntos (con histéresis). */
  pinch: boolean;
  /** Los 4 dedos extendidos, sin pinch. */
  openPalm: boolean;
  /** Solo índice extendido (apuntando). */
  pointing: boolean;
  /** Pulgar arriba, resto de dedos cerrados. */
  like: boolean;
  /** Punto medio pulgar–índice (coords de video 0..1). */
  pinchPoint: Point3;
  /** Punta del índice (coords de video 0..1). */
  indexTip: Point3;
  /** Centro aproximado de la palma (coords de video 0..1). */
  palmCenter: Point3;
}

function dist(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Clasifica la pose de cada mano a partir de los 21 landmarks de MediaPipe.
 * Dedo extendido = punta más lejos de la muñeca que su articulación PIP.
 */
export class PoseClassifier {
  private pinch = new PinchDetector();

  classify(hand: HandData): HandPose {
    const lm = hand.landmarks;
    const wrist = lm[0];
    // Slot por lateralidad para que la histéresis del pinch no salte
    // cuando MediaPipe reordena las manos.
    const slot = hand.handedness === 'Left' ? 0 : 1;
    const pinchState = this.pinch.detect(hand, slot);

    const extended = (pip: number, tip: number) =>
      dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.15;

    const indexExt = extended(6, 8);
    const middleExt = extended(10, 12);
    const ringExt = extended(14, 16);
    const pinkyExt = extended(18, 20);
    // Pulgar extendido: punta más lejos del MCP del meñique que su IP.
    const thumbExt = dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.05;

    const fourFingers = indexExt && middleExt && ringExt && pinkyExt;
    const fingersCurled = !indexExt && !middleExt && !ringExt && !pinkyExt;

    return {
      handedness: hand.handedness,
      pinch: pinchState.active,
      openPalm: fourFingers && !pinchState.active,
      pointing: indexExt && !middleExt && !ringExt && !pinkyExt && !pinchState.active,
      like: fingersCurled && thumbExt && lm[4].y < wrist.y - 0.03,
      pinchPoint: pinchState.point,
      indexTip: lm[8],
      palmCenter: {
        x: (wrist.x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
        y: (wrist.y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
        z: (wrist.z + lm[5].z + lm[9].z + lm[13].z + lm[17].z) / 5,
      },
    };
  }

  resetSlot(handedness: 'Left' | 'Right'): void {
    this.pinch.reset(handedness === 'Left' ? 0 : 1);
  }
}
