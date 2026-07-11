import type { HandFrame } from '../hands/HandTracker';

/** Conexiones entre landmarks de la mano (esqueleto de MediaPipe). */
const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8], // índice
  [5, 9], [9, 10], [10, 11], [11, 12], // medio
  [9, 13], [13, 14], [14, 15], [15, 16], // anular
  [13, 17], [17, 18], [18, 19], [19, 20], // meñique
  [0, 17],
];

/**
 * Miniatura de la webcam con los landmarks dibujados encima
 * (feedback visual tipo Iron Man).
 */
export class VideoPreview {
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  render(frame: HandFrame): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    if (this.video.readyState >= 2) {
      ctx.drawImage(this.video, 0, 0, w, h);
    }

    for (const hand of frame.hands) {
      // Esqueleto
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.85)';
      ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        const pa = hand.landmarks[a];
        const pb = hand.landmarks[b];
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
      }
      // Puntos (pulgar e índice resaltados)
      for (let i = 0; i < hand.landmarks.length; i++) {
        const p = hand.landmarks[i];
        const highlight = i === 4 || i === 8;
        ctx.fillStyle = highlight ? '#ffd34d' : '#6ee7ff';
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, highlight ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
