import type { MiniApp } from '../../shell/MiniApp';
import { getHandTracker } from '../../hands/tracker';
import type { HandFrame } from '../../hands/HandTracker';
import { PoseClassifier } from '../../gestures/poses';
import { VideoPreview } from '../../ui/VideoPreview';

const COLORS = [
  '#6ee7ff', '#4dffb8', '#ffd34d', '#ff8a3d',
  '#ff5d73', '#c26bff', '#ffffff', '#2b6cff',
];

const BRUSH_SIZE = 5;
const ERASER_SIZE = 44;
/** Radio (px) donde se colocan los items de la rueda. */
const WHEEL_RADIUS = 100;
/** Dentro de este radio la selección es "centro" = cancelar. */
const WHEEL_DEADZONE = 46;

interface WheelSlot {
  el: HTMLElement;
  color?: string;
  action?: 'clear';
}

const TEMPLATE = `
  <canvas id="draw-canvas"></canvas>
  <canvas id="video-preview" class="video-preview" width="480" height="360"></canvas>

  <div class="hud">
    <div class="panel glass">
      <h1>PIZARRA</h1>
      <div class="row"><span>MANOS</span><span class="value" id="wb-hands">0</span></div>
      <div class="row"><span>MODO</span><span class="value" id="wb-mode">—</span></div>
      <div class="row"><span>COLOR</span><span class="value" id="wb-color">■</span></div>
    </div>
  </div>

  <div class="gesture-help glass">
    <h2>GESTOS</h2>
    <div><b>Pinch</b> (pulgar+índice): dibujar</div>
    <div><b>Pulgar+índice+medio juntos</b>: rueda de colores — mueve en círculo y <b>suelta</b> para elegir; suelta en el <b>centro</b> para cancelar</div>
    <div><b>Índice+medio</b> extendidos: borrador</div>
  </div>

  <div id="color-wheel" class="glass"></div>
  <div id="wb-draw-cursor" class="draw-cursor"></div>
  <div id="wb-eraser-cursor" class="eraser-cursor"></div>
  <div id="wb-status" class="status-message glass"></div>
`;

/**
 * Pizarra por gestos: pinch dibuja, índice+medio borran, y tri-pinch
 * (pulgar+índice+medio juntos) abre una rueda radial de colores alrededor
 * del cursor. Con la rueda abierta el dibujo queda deshabilitado: mover en
 * círculo resalta un color (el selector salta entre posiciones), soltar
 * selecciona, y soltar en el centro cancela sin cambiar el color.
 */
export class WhiteboardApp implements MiniApp {
  private classifier = new PoseClassifier();
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private unsubscribe: (() => void) | null = null;
  private abort = new AbortController();

  private color = COLORS[0];
  private lastDraw: { x: number; y: number } | null = null;
  private lastErase: { x: number; y: number } | null = null;

  // Rueda radial
  private wheelEl!: HTMLElement;
  private wheelCenterEl!: HTMLElement;
  private wheelSlots: WheelSlot[] = [];
  private wheelOpen = false;
  private wheelAnchor = { x: 0, y: 0 };
  private wheelHighlight: number | null = null;
  /** Tras cerrar la rueda, no dibujar hasta soltar el pinch por completo. */
  private drawLocked = false;

  private modeEl!: HTMLElement;
  private handsEl!: HTMLElement;
  private colorEl!: HTMLElement;
  private drawCursor!: HTMLElement;
  private eraserCursor!: HTMLElement;

  async mount(container: HTMLElement): Promise<void> {
    const root = document.createElement('div');
    root.className = 'miniapp';
    root.innerHTML = TEMPLATE;
    container.appendChild(root);

    this.canvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas(), {
      signal: this.abort.signal,
    });

    this.modeEl = document.getElementById('wb-mode')!;
    this.handsEl = document.getElementById('wb-hands')!;
    this.colorEl = document.getElementById('wb-color')!;
    this.drawCursor = document.getElementById('wb-draw-cursor')!;
    this.eraserCursor = document.getElementById('wb-eraser-cursor')!;
    this.colorEl.style.color = this.color;

    this.buildWheel();

    const tracker = getHandTracker();
    const preview = new VideoPreview(
      document.getElementById('video-preview') as HTMLCanvasElement,
      tracker.video,
    );
    this.unsubscribe = tracker.onFrame((frame) => {
      this.handsEl.textContent = String(frame.hands.length);
      this.handsEl.className = frame.hands.length > 0 ? 'value ok' : 'value';
      this.handleFrame(frame);
      preview.render(frame);
    });

    const status = document.getElementById('wb-status')!;
    status.textContent = 'INICIANDO CÁMARA…';
    status.classList.add('visible');
    try {
      await tracker.start();
      status.classList.remove('visible');
    } catch (err) {
      console.error(err);
      status.textContent = 'CÁMARA NO DISPONIBLE — CONCEDE PERMISO Y RECARGA.';
    }
  }

  unmount(): void {
    this.unsubscribe?.();
    getHandTracker().stop();
    this.abort.abort();
  }

  // --- Rueda radial de colores ---

  private buildWheel(): void {
    this.wheelEl = document.getElementById('color-wheel')!;

    this.wheelCenterEl = document.createElement('div');
    this.wheelCenterEl.className = 'wheel-center';
    this.wheelCenterEl.textContent = 'CANCELAR';
    this.wheelEl.appendChild(this.wheelCenterEl);

    const defs: Array<{ color?: string; action?: 'clear' }> = [
      ...COLORS.map((c) => ({ color: c })),
      { action: 'clear' as const },
    ];
    const n = defs.length;
    const cx = 145; // centro del contenedor (290/2)
    defs.forEach((def, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2; // empieza arriba
      const el = document.createElement('div');
      el.className = 'wheel-item' + (def.action ? ' action' : '');
      if (def.color) {
        el.style.background = def.color;
        el.style.color = def.color;
      } else {
        el.textContent = '✕';
        el.style.color = '#ffffff';
      }
      el.style.left = `${cx + WHEEL_RADIUS * Math.cos(angle)}px`;
      el.style.top = `${cx + WHEEL_RADIUS * Math.sin(angle)}px`;
      this.wheelEl.appendChild(el);
      this.wheelSlots.push({ el, ...def });
    });
  }

  private openWheel(pt: { x: number; y: number }): void {
    const m = 160; // que la rueda quepa en pantalla
    this.wheelAnchor = {
      x: Math.min(Math.max(pt.x, m), window.innerWidth - m),
      y: Math.min(Math.max(pt.y, m), window.innerHeight - m),
    };
    this.wheelEl.style.left = `${this.wheelAnchor.x}px`;
    this.wheelEl.style.top = `${this.wheelAnchor.y}px`;
    this.wheelEl.classList.add('visible');
    this.wheelOpen = true;
    this.setWheelHighlight(null);
    this.lastDraw = null;
    this.lastErase = null;
    this.setCursors({});
  }

  private updateWheel(pt: { x: number; y: number }): void {
    const dx = pt.x - this.wheelAnchor.x;
    const dy = pt.y - this.wheelAnchor.y;
    if (Math.hypot(dx, dy) < WHEEL_DEADZONE) {
      this.setWheelHighlight(null); // zona central → cancelar
      return;
    }
    // El selector salta al color cuyo sector angular contiene la mano.
    const n = this.wheelSlots.length;
    let angle = Math.atan2(dy, dx) + Math.PI / 2; // 0 = arriba
    angle = (angle + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round(angle / ((Math.PI * 2) / n)) % n;
    this.setWheelHighlight(idx);
  }

  /** Cierra la rueda aplicando la selección (o cancelando en el centro). */
  private closeWheel(stillPinching: boolean): void {
    const slot =
      this.wheelHighlight !== null ? this.wheelSlots[this.wheelHighlight] : null;
    if (slot?.color) {
      this.setColor(slot.color);
      this.setMode('COLOR ✓');
    } else if (slot?.action === 'clear') {
      this.clearCanvas();
      this.setMode('PIZARRA LIMPIA');
    } else {
      this.setMode('CANCELADO');
    }
    this.wheelEl.classList.remove('visible');
    this.wheelOpen = false;
    this.setWheelHighlight(null);
    // Si el pulgar+índice siguen juntos (solo soltó el medio), no dibujar
    // hasta que suelte el pinch por completo.
    this.drawLocked = stillPinching;
  }

  private setWheelHighlight(idx: number | null): void {
    if (idx === this.wheelHighlight) return;
    this.wheelSlots.forEach((s, i) => s.el.classList.toggle('hovered', i === idx));
    this.wheelCenterEl.classList.toggle('active', idx === null);
    this.wheelHighlight = idx;
  }

  // --- Gestos (público para pruebas con frames sintéticos) ---

  handleFrame(frame: HandFrame): void {
    const poses = frame.hands.map((h) => this.classifier.classify(h));
    const seen = new Set(poses.map((p) => p.handedness));
    if (!seen.has('Left')) this.classifier.resetSlot('Left');
    if (!seen.has('Right')) this.classifier.resetSlot('Right');

    const toScreen = (p: { x: number; y: number }) => ({
      x: (1 - p.x) * window.innerWidth,
      y: p.y * window.innerHeight,
    });

    const tri = poses.find((p) => p.triPinch);

    // Rueda abierta: es modal, solo se atiende el gesto tri-pinch.
    if (this.wheelOpen) {
      if (tri) {
        this.updateWheel(toScreen(tri.triPoint));
        this.setMode('RUEDA DE COLOR');
      } else {
        this.closeWheel(poses.some((p) => p.pinch));
      }
      return;
    }

    if (tri) {
      this.openWheel(toScreen(tri.triPoint));
      this.setMode('RUEDA DE COLOR');
      return;
    }

    const eraser = poses.find((p) => p.twoFingers);
    const pincher = poses.find((p) => p.pinch);

    // Tras cerrar la rueda, esperar a que se suelte el pinch por completo.
    if (this.drawLocked) {
      if (!pincher) this.drawLocked = false;
      this.setCursors({});
      this.lastDraw = null;
      return;
    }

    if (eraser) {
      const mid = toScreen({
        x: (eraser.indexTip.x + eraser.middleTip.x) / 2,
        y: (eraser.indexTip.y + eraser.middleTip.y) / 2,
      });
      this.eraseAt(mid);
      this.setCursors({ eraser: mid });
      this.setMode('BORRANDO');
      this.lastDraw = null;
    } else if (pincher) {
      const pt = toScreen(pincher.pinchPoint);
      this.drawAt(pt);
      this.setCursors({ draw: pt });
      this.setMode('DIBUJANDO');
      this.lastErase = null;
    } else {
      this.setCursors({});
      this.setMode(null);
      this.lastDraw = null;
      this.lastErase = null;
    }
  }

  // --- Dibujo ---

  private setColor(c: string): void {
    this.color = c;
    this.colorEl.style.color = c;
  }

  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private resizeCanvas(): void {
    const old = document.createElement('canvas');
    old.width = this.canvas.width;
    old.height = this.canvas.height;
    if (old.width > 0) old.getContext('2d')!.drawImage(this.canvas, 0, 0);
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (old.width > 0) this.ctx.drawImage(old, 0, 0);
  }

  private drawAt(pt: { x: number; y: number }): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = BRUSH_SIZE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(this.lastDraw?.x ?? pt.x, this.lastDraw?.y ?? pt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.lastDraw = pt;
  }

  private eraseAt(pt: { x: number; y: number }): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = ERASER_SIZE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastErase?.x ?? pt.x, this.lastErase?.y ?? pt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    this.lastErase = pt;
  }

  // --- Cursores / HUD ---

  private setCursors(c: {
    draw?: { x: number; y: number };
    eraser?: { x: number; y: number };
  }): void {
    const place = (el: HTMLElement, pt?: { x: number; y: number }) => {
      el.classList.toggle('visible', !!pt);
      if (pt) {
        el.style.left = `${pt.x}px`;
        el.style.top = `${pt.y}px`;
      }
    };
    place(this.drawCursor, c.draw);
    place(this.eraserCursor, c.eraser);
    if (c.draw) {
      this.drawCursor.style.background = this.color;
      this.drawCursor.style.color = this.color;
    }
  }

  private setMode(mode: string | null): void {
    this.modeEl.textContent = mode ?? '—';
    this.modeEl.className = mode ? 'value active' : 'value';
  }
}
