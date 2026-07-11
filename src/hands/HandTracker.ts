import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { LandmarkSmoother, type Point3 } from './smoothing';

export interface HandData {
  /** 21 landmarks normalizados (0..1 en x/y, z relativo). */
  landmarks: Point3[];
  handedness: 'Left' | 'Right';
}

export interface HandFrame {
  hands: HandData[];
  timestamp: number;
}

type FrameListener = (frame: HandFrame) => void;

/**
 * Webcam + MediaPipe HandLandmarker. La inferencia corre por frame de video
 * (requestVideoFrameCallback), desacoplada del render loop de Three.js.
 * El último resultado queda disponible en `latestFrame`.
 */
export class HandTracker {
  latestFrame: HandFrame = { hands: [], timestamp: 0 };

  private landmarker?: HandLandmarker;
  private smoothers = [new LandmarkSmoother(), new LandmarkSmoother()];
  private listeners: FrameListener[] = [];
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private running = false;

  constructor(private video: HTMLVideoElement) {}

  onFrame(cb: FrameListener): void {
    this.listeners.push(cb);
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise<void>((resolve) => {
      this.video.onloadedmetadata = () => resolve();
    });
    await this.video.play();

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    );
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    this.running = true;
    this.scheduleDetection();
  }

  private scheduleDetection(): void {
    const loop = () => {
      if (!this.running) return;
      this.detect();
      if ('requestVideoFrameCallback' in this.video) {
        this.video.requestVideoFrameCallback(loop);
      } else {
        requestAnimationFrame(loop);
      }
    };
    loop();
  }

  private detect(): void {
    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const now = performance.now();
    const dt = this.lastTimestamp > 0 ? (now - this.lastTimestamp) / 1000 : 1 / 30;
    this.lastTimestamp = now;

    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(this.video, now);
    } catch {
      return;
    }

    const hands: HandData[] = [];
    for (let i = 0; i < result.landmarks.length && i < 2; i++) {
      const raw = result.landmarks[i] as Point3[];
      const smoothed = this.smoothers[i].smooth(raw, dt);
      const handedness =
        (result.handednesses[i]?.[0]?.categoryName as 'Left' | 'Right') ?? 'Right';
      hands.push({ landmarks: smoothed, handedness });
    }
    if (hands.length === 0) {
      this.smoothers.forEach((s) => s.reset());
    }

    this.latestFrame = { hands, timestamp: now };
    for (const cb of this.listeners) cb(this.latestFrame);
  }

  stop(): void {
    this.running = false;
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
  }
}
