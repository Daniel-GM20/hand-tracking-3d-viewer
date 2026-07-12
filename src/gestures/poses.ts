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
  /** Índice + medio extendidos, anular y meñique cerrados (borrador). */
  twoFingers: boolean;
  /** Pulgar + índice + medio juntos (rueda de colores). */
  triPinch: boolean;
  /** Centroide de pulgar–índice–medio (coords de video 0..1). */
  triPoint: Point3;
  /** Punto medio pulgar–índice (coords de video 0..1). */
  pinchPoint: Point3;
  /** Punta del índice (coords de video 0..1). */
  indexTip: Point3;
  /** Punta del dedo medio (coords de video 0..1). */
  middleTip: Point3;
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
  private triActive = [false, false];

  classify(hand: HandData): HandPose {
    const lm = hand.landmarks;
    const wrist = lm[0];
    // Slot por lateralidad para que la histéresis del pinch no salte
    // cuando MediaPipe reordena las manos.
    const slot = hand.handedness === 'Left' ? 0 : 1;
    const pinchState = this.pinch.detect(hand, slot);

    // Tri-pinch: pulgar+índice+medio juntos (con histéresis propia).
    const handSize = dist(wrist, lm[9]) || 1e-6;
    const maxTipDist =
      Math.max(dist(lm[4], lm[8]), dist(lm[4], lm[12]), dist(lm[8], lm[12])) /
      handSize;
    // Umbral estricto: los TRES dedos deben tocarse de verdad, para no
    // confundirse con un pinch normal con el medio cerca.
    const wasTri = this.triActive[slot];
    const triPinch = wasTri ? maxTipDist < 0.6 : maxTipDist < 0.38;
    this.triActive[slot] = triPinch;

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
      twoFingers:
        indexExt && middleExt && !ringExt && !pinkyExt && !pinchState.active,
      triPinch,
      triPoint: {
        x: (lm[4].x + lm[8].x + lm[12].x) / 3,
        y: (lm[4].y + lm[8].y + lm[12].y) / 3,
        z: (lm[4].z + lm[8].z + lm[12].z) / 3,
      },
      pinchPoint: pinchState.point,
      indexTip: lm[8],
      middleTip: lm[12],
      palmCenter: {
        x: (wrist.x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
        y: (wrist.y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
        z: (wrist.z + lm[5].z + lm[9].z + lm[13].z + lm[17].z) / 5,
      },
    };
  }

  resetSlot(handedness: 'Left' | 'Right'): void {
    const slot = handedness === 'Left' ? 0 : 1;
    this.pinch.reset(slot);
    this.triActive[slot] = false;
  }
}
