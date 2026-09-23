import type { Gesture } from './GestureEngine';
import type { HandFrame } from '../hands/HandTracker';
import type { Point3 } from '../hands/smoothing';
import { PoseClassifier, type HandPose } from './poses';

export interface GestureCallbacks {
  /** ¿Hay una pieza seleccionada? Decide el destino de rotar/zoom. */
  isPieceSelected(): boolean;
  /** Factor global de explosión (solo sin selección). */
  onExplode(factor: number): void;
  /** Deltas de rotación en espacio de pantalla (ya con espejo aplicado). */
  onRotateDelta(dx: number, dy: number): void;
  /** Inicio de zoom: el receptor guarda la escala base. */
  onZoomStart(): void;
  /** Multiplicador relativo al inicio del gesto de zoom. */
  onZoom(mult: number): void;
  /** Apuntando con el índice (coords de video 0..1, sin espejar). */
  onPoint(videoX: number, videoY: number): void;
  onPointEnd(): void;
  /** Pinch con la otra mano mientras se apunta → seleccionar. */
  onSelect(): void;
  /** Palma abierta 2 s → deseleccionar. */
  onDeselect(): void;
  /** Like 2 s → mostrar/ocultar info técnica. */
  onToggleInfo(): void;
  /** Etiqueta del gesto activo para el HUD (null = ninguno). */
  onGesture(label: string | null): void;
}

const HOLD_MS = 2000;

function dist2D(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

type Mode =
  | 'none'
  | 'explode'
  | 'rotate'
  | 'zoom'
  | 'point'
  | 'palmHold'
  | 'likeHold';

/**
 * Máquina de estados que arbitra todos los gestos (por prioridad):
 * 1. Ambas manos en pinch → explosión (relativa; solo sin selección).
 * 2. Una mano apuntando (índice) → láser; pinch de la otra mano → seleccionar.
 * 3. Una sola mano en pinch → rotar (modelo o pieza seleccionada).
 * 4. Ambas palmas abiertas → zoom (separar = +, juntar = −).
 * 5. Una sola palma 2 s (con selección) → deseleccionar.
 * 6. Like 2 s (con selección) → mostrar/ocultar info técnica.
 */
export class GestureController implements Gesture {
  private classifier = new PoseClassifier();
  private mode: Mode = 'none';

  // Explosión (delta relativo)
  private explodeFactor = 0;
  private explodeStartDist = 0;
  private explodeStartFactor = 0;
  private readonly explodeSensitivity = 2.2;

  // Rotación
  private rotatePrev: Point3 | null = null;

  // Zoom
  private zoomStartDist = 0;
  private readonly zoomSensitivity = 2.5;

  // Holds (palma / like)
  private holdStart = 0;
  private likeFired = false;

  // Selección: flanco de subida del pinch de la mano que no apunta
  private selectPinchWas = false;

  constructor(private cb: GestureCallbacks) {}

  setExplodeFactor(f: number): void {
    this.explodeFactor = Math.min(1, Math.max(0, f));
  }

  update(frame: HandFrame): void {
    const poses = frame.hands.map((h) => this.classifier.classify(h));

    // Resetear histéresis de pinch de manos que ya no se ven.
    const seen = new Set(poses.map((p) => p.handedness));
    if (!seen.has('Left')) this.classifier.resetSlot('Left');
    if (!seen.has('Right')) this.classifier.resetSlot('Right');

    const selected = this.cb.isPieceSelected();
    const pinching = poses.filter((p) => p.pinch);
    const palms = poses.filter((p) => p.openPalm);
    const pointing = poses.find((p) => p.pointing);

    let nextMode: Mode = 'none';
    if (poses.length === 2 && pinching.length === 2) {
      nextMode = selected ? 'none' : 'explode';
    } else if (!selected && pointing) {
      nextMode = 'point';
    } else if (pinching.length === 1) {
      nextMode = 'rotate';
    } else if (poses.length === 2 && palms.length === 2) {
      nextMode = 'zoom';
    } else if (selected && poses.length === 1 && palms.length === 1) {
      nextMode = 'palmHold';
    } else if (selected && poses.some((p) => p.like)) {
      nextMode = 'likeHold';
    }

    if (nextMode !== this.mode) {
      this.exitMode(this.mode);
      this.enterMode(nextMode, poses, frame.timestamp);
      this.mode = nextMode;
    }

    this.runMode(poses, frame.timestamp, selected);
  }

  private enterMode(mode: Mode, poses: HandPose[], now: number): void {
    switch (mode) {
      case 'explode':
        this.explodeStartDist = dist2D(poses[0].pinchPoint, poses[1].pinchPoint);
        this.explodeStartFactor = this.explodeFactor;
        break;
      case 'rotate':
        this.rotatePrev = null;
        break;
      case 'zoom':
        this.zoomStartDist = dist2D(poses[0].palmCenter, poses[1].palmCenter);
        this.cb.onZoomStart();
        break;
      case 'point':
        this.selectPinchWas = false;
        break;
      case 'palmHold':
      case 'likeHold':
        this.holdStart = now;
        break;
      case 'none':
        break;
    }
  }

  private exitMode(mode: Mode): void {
    if (mode === 'point') this.cb.onPointEnd();
    // Al soltar el like se libera el latch para poder volver a togglear.
    if (mode === 'likeHold') this.likeFired = false;
  }

  private runMode(poses: HandPose[], now: number, selected: boolean): void {
    switch (this.mode) {
      case 'explode': {
        const d = dist2D(poses[0].pinchPoint, poses[1].pinchPoint);
        const target =
          this.explodeStartFactor + (d - this.explodeStartDist) * this.explodeSensitivity;
        this.explodeFactor = Math.min(1, Math.max(0, target));
        this.cb.onExplode(this.explodeFactor);
        this.cb.onGesture('Explode');
        break;
      }
      case 'rotate': {
        const hand = poses.find((p) => p.pinch)!;
        const pt = hand.pinchPoint;
        if (this.rotatePrev) {
          // Espejo horizontal: la cámara está de frente al usuario.
          const dx = -(pt.x - this.rotatePrev.x);
          const dy = pt.y - this.rotatePrev.y;
          this.cb.onRotateDelta(dx, dy);
        }
        this.rotatePrev = pt;
        this.cb.onGesture(selected ? 'Rotate part' : 'Rotate');
        break;
      }
      case 'zoom': {
        const d = dist2D(poses[0].palmCenter, poses[1].palmCenter);
        const mult = 1 + (d - this.zoomStartDist) * this.zoomSensitivity;
        this.cb.onZoom(Math.max(0.05, mult));
        this.cb.onGesture(selected ? 'Zoom part' : 'Zoom');
        break;
      }
      case 'point': {
        const pointer = poses.find((p) => p.pointing);
        if (!pointer) break;
        this.cb.onPoint(pointer.indexTip.x, pointer.indexTip.y);
        // Selección: flanco de subida del pinch de la otra mano.
        const other = poses.find((p) => p !== pointer);
        const otherPinch = other?.pinch ?? false;
        if (otherPinch && !this.selectPinchWas) this.cb.onSelect();
        this.selectPinchWas = otherPinch;
        this.cb.onGesture('Pointing');
        break;
      }
      case 'palmHold': {
        const elapsed = now - this.holdStart;
        if (elapsed >= HOLD_MS) {
          this.cb.onDeselect();
          this.cb.onGesture(null);
          this.mode = 'none';
        } else {
          this.cb.onGesture(`Release ${Math.round((elapsed / HOLD_MS) * 100)}%`);
        }
        break;
      }
      case 'likeHold': {
        const elapsed = now - this.holdStart;
        if (elapsed >= HOLD_MS && !this.likeFired) {
          this.likeFired = true;
          this.cb.onToggleInfo();
          this.cb.onGesture(null);
        } else if (!this.likeFired) {
          this.cb.onGesture(`INFO ${Math.round((elapsed / HOLD_MS) * 100)}%`);
        }
        break;
      }
      case 'none':
        this.cb.onGesture(null);
        break;
    }
  }
}
