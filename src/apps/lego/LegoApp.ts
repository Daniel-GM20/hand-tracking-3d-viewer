import * as THREE from 'three';
import type { MiniApp } from '../../shell/MiniApp';
import { SceneManager } from '../../core/SceneManager';
import { getHandTracker } from '../../hands/tracker';
import type { HandFrame } from '../../hands/HandTracker';
import { PoseClassifier } from '../../gestures/poses';
import { VideoPreview } from '../../ui/VideoPreview';
import {
  BRICK_CATALOG,
  STUD,
  type BrickDef,
  brickHeight,
  createBrickMesh,
  disposeBrick,
} from './bricks';

/** Studs de la base (16×16). */
const BASE = 16;
const UNDO_HOLD_MS = 1500;

interface PlacedBrick {
  group: THREE.Group;
  cells: string[];
  prevHeights: Map<string, number>;
}

const TEMPLATE = `
  <canvas id="lego-canvas" class="scene"></canvas>
  <canvas id="video-preview" class="video-preview" width="480" height="360"></canvas>

  <div class="hud">
    <div class="panel glass">
      <h1>LEGO LAB <span style="font-size:9px;color:#ffc14d">BETA</span></h1>
      <div class="row"><span>MANOS</span><span class="value" id="lg-hands">0</span></div>
      <div class="row"><span>GESTO</span><span class="value" id="lg-mode">—</span></div>
      <div class="row"><span>PIEZA</span><span class="value" id="lg-brick">—</span></div>
      <div class="row"><span>COLOCADAS</span><span class="value" id="lg-count">0</span></div>
    </div>
  </div>

  <div class="gesture-help glass">
    <h2>GESTOS</h2>
    <div><b>Índice</b> a la bandeja + <b>pinch</b> de la otra mano: elegir pieza</div>
    <div><b>Pinch</b>: mover la pieza fantasma; <b>soltar</b>: colocarla</div>
    <div><b>Like</b>: rotar pieza 90°</div>
    <div><b>Palma abierta</b> 1.5 s: deshacer</div>
  </div>

  <div id="brick-palette" class="glass"></div>
  <div id="lg-laser" class="laser-cursor"></div>
  <div id="lg-status" class="status-message glass"></div>
`;

/**
 * Constructor LEGO beta: elige piezas de la bandeja (apuntar + pinch de la
 * otra mano), arrastra el fantasma con pinch y suéltalo para colocarlo con
 * snap a la rejilla y apilado automático. Like rota, palma 1.5 s deshace.
 */
export class LegoApp implements MiniApp {
  private classifier = new PoseClassifier();
  private sceneManager!: SceneManager;
  private unsubscribe: (() => void) | null = null;

  private currentDef: BrickDef = BRICK_CATALOG[7]; // 2×4 azul
  private rotated = false;
  private ghost: THREE.Group | null = null;
  private ghostValid = false;
  private ghostPos = new THREE.Vector3();
  private wasPinching = false;

  private placed: PlacedBrick[] = [];
  private heights = new Map<string, number>();

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private selectPinchWas = false;
  private hoveredItem: HTMLElement | null = null;
  private likeWas = false;
  private palmStart = 0;
  private undoFired = false;

  private modeEl!: HTMLElement;
  private handsEl!: HTMLElement;
  private brickEl!: HTMLElement;
  private countEl!: HTMLElement;
  private laser!: HTMLElement;

  async mount(container: HTMLElement): Promise<void> {
    const root = document.createElement('div');
    root.className = 'miniapp';
    root.innerHTML = TEMPLATE;
    container.appendChild(root);

    this.modeEl = document.getElementById('lg-mode')!;
    this.handsEl = document.getElementById('lg-hands')!;
    this.brickEl = document.getElementById('lg-brick')!;
    this.countEl = document.getElementById('lg-count')!;
    this.laser = document.getElementById('lg-laser')!;

    const canvas = document.getElementById('lego-canvas') as HTMLCanvasElement;
    this.sceneManager = new SceneManager(canvas);
    this.sceneManager.camera.position.set(5.5, 5.5, 7);
    this.sceneManager.controls.target.set(0, 0.5, 0);

    // Base de construcción
    const baseSize = BASE * STUD;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 0.15, baseSize),
      new THREE.MeshStandardMaterial({
        color: 0x1d5c37,
        metalness: 0.2,
        roughness: 0.6,
        emissive: 0x0a2a18,
      }),
    );
    base.position.y = -0.075;
    this.sceneManager.scene.add(base);

    this.buildPalette();
    this.setBrick(this.currentDef);

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

    const status = document.getElementById('lg-status')!;
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
    this.sceneManager.dispose();
  }

  // --- Paleta ---

  private buildPalette(): void {
    const bar = document.getElementById('brick-palette')!;
    for (const def of BRICK_CATALOG) {
      const item = document.createElement('div');
      item.className = 'brick-item';
      item.dataset.brick = def.id;
      const chip = document.createElement('div');
      chip.className = 'brick-chip';
      chip.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      const label = document.createElement('span');
      label.textContent = def.label;
      item.append(chip, label);
      item.addEventListener('click', () => this.setBrick(def));
      bar.appendChild(item);
    }
  }

  private setBrick(def: BrickDef): void {
    this.currentDef = def;
    this.rotated = false;
    this.brickEl.textContent = `${def.kind === 'plate' ? 'PLACA' : 'LADRILLO'} ${def.label}`;
    document.querySelectorAll('#brick-palette .brick-item').forEach((el) => {
      el.classList.toggle('selected', (el as HTMLElement).dataset.brick === def.id);
    });
    this.rebuildGhost();
  }

  private dims(): { w: number; l: number } {
    return this.rotated
      ? { w: this.currentDef.l, l: this.currentDef.w }
      : { w: this.currentDef.w, l: this.currentDef.l };
  }

  private rebuildGhost(): void {
    if (this.ghost) {
      this.sceneManager.scene.remove(this.ghost);
      disposeBrick(this.ghost);
      this.ghost = null;
    }
    this.ghost = createBrickMesh(this.currentDef, 0.5);
    if (this.rotated) this.ghost.rotation.y = Math.PI / 2;
    this.ghost.visible = false;
    this.sceneManager.scene.add(this.ghost);
  }

  // --- Gestos (público para pruebas con frames sintéticos) ---

  handleFrame(frame: HandFrame): void {
    const poses = frame.hands.map((h) => this.classifier.classify(h));
    const seen = new Set(poses.map((p) => p.handedness));
    if (!seen.has('Left')) this.classifier.resetSlot('Left');
    if (!seen.has('Right')) this.classifier.resetSlot('Right');

    const pointer = poses.find((p) => p.pointing);
    const pincher = poses.find((p) => p.pinch);
    const like = poses.some((p) => p.like);
    const palm = poses.length === 1 && poses[0].openPalm;

    // Rotación con like (flanco de subida).
    if (like && !this.likeWas) {
      this.rotated = !this.rotated;
      this.rebuildGhost();
      this.setMode('ROTAR 90°');
    }
    this.likeWas = like;

    // Deshacer con palma sostenida.
    if (palm) {
      if (this.palmStart === 0) this.palmStart = frame.timestamp;
      const elapsed = frame.timestamp - this.palmStart;
      if (elapsed >= UNDO_HOLD_MS && !this.undoFired) {
        this.undoFired = true;
        this.undo();
      }
      if (!this.undoFired) {
        this.setMode(`DESHACER ${Math.round((elapsed / UNDO_HOLD_MS) * 100)}%`);
      }
    } else {
      this.palmStart = 0;
      this.undoFired = false;
    }

    if (pointer) {
      // Prioridad al apuntado: el pinch de la otra mano selecciona pieza,
      // nunca arrastra el fantasma.
      // Apuntar a la bandeja + pinch de la otra mano.
      const sx = (1 - pointer.indexTip.x) * window.innerWidth;
      const sy = pointer.indexTip.y * window.innerHeight;
      this.laser.style.left = `${sx}px`;
      this.laser.style.top = `${sy}px`;
      this.laser.classList.add('visible');
      this.updateHover(sx, sy);

      const other = poses.find((p) => p !== pointer);
      const otherPinch = other?.pinch ?? false;
      if (otherPinch && !this.selectPinchWas && this.hoveredItem) {
        const def = BRICK_CATALOG.find(
          (b) => b.id === this.hoveredItem!.dataset.brick,
        );
        if (def) this.setBrick(def);
      }
      this.selectPinchWas = otherPinch;
      this.setMode('ELIGIENDO PIEZA');
      this.hideGhost();
      this.wasPinching = false;
    } else if (pincher) {
      // Arrastrar el fantasma; al soltar se coloca.
      this.laser.classList.remove('visible');
      this.updateGhost(pincher.pinchPoint.x, pincher.pinchPoint.y);
      this.setMode('COLOCANDO…');
      this.wasPinching = true;
      this.selectPinchWas = false;
    } else {
      this.laser.classList.remove('visible');
      this.updateHover(-1, -1);
      if (this.wasPinching && this.ghostValid) this.placeBrick();
      this.wasPinching = false;
      this.hideGhost();
      if (!palm && !like) this.setMode(null);
    }
  }

  // --- Fantasma y colocación ---

  private updateGhost(videoX: number, videoY: number): void {
    if (!this.ghost) return;
    const ndc = new THREE.Vector2((1 - videoX) * 2 - 1, -(videoY * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.sceneManager.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.hideGhost();
      return;
    }

    const { w, l } = this.dims();
    const half = BASE / 2;
    // Snap: celda de origen (esquina) limitada a la base.
    const cx = Math.round(hit.x / STUD - w / 2);
    const cz = Math.round(hit.z / STUD - l / 2);
    const clampedX = THREE.MathUtils.clamp(cx, -half, half - w);
    const clampedZ = THREE.MathUtils.clamp(cz, -half, half - l);

    const y = this.stackHeight(clampedX, clampedZ, w, l);
    this.ghostPos.set(
      (clampedX + w / 2) * STUD,
      y,
      (clampedZ + l / 2) * STUD,
    );
    this.ghost.position.copy(this.ghostPos);
    this.ghost.visible = true;
    this.ghostValid = true;
  }

  private hideGhost(): void {
    if (this.ghost) this.ghost.visible = false;
    this.ghostValid = false;
  }

  private cellsFor(cx: number, cz: number, w: number, l: number): string[] {
    const cells: string[] = [];
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < l; j++) cells.push(`${cx + i},${cz + j}`);
    }
    return cells;
  }

  private stackHeight(cx: number, cz: number, w: number, l: number): number {
    let y = 0;
    for (const c of this.cellsFor(cx, cz, w, l)) {
      y = Math.max(y, this.heights.get(c) ?? 0);
    }
    return y;
  }

  private placeBrick(): void {
    const { w, l } = this.dims();
    const cx = Math.round(this.ghostPos.x / STUD - w / 2);
    const cz = Math.round(this.ghostPos.z / STUD - l / 2);
    const cells = this.cellsFor(cx, cz, w, l);

    const prevHeights = new Map<string, number>();
    const top = this.ghostPos.y + brickHeight(this.currentDef);
    for (const c of cells) {
      prevHeights.set(c, this.heights.get(c) ?? 0);
      this.heights.set(c, top);
    }

    const group = createBrickMesh(this.currentDef, 1);
    if (this.rotated) group.rotation.y = Math.PI / 2;
    group.position.copy(this.ghostPos);
    this.sceneManager.scene.add(group);
    this.placed.push({ group, cells, prevHeights });
    this.countEl.textContent = String(this.placed.length);
    this.setMode('COLOCADA ✓');
  }

  private undo(): void {
    const last = this.placed.pop();
    if (!last) return;
    this.sceneManager.scene.remove(last.group);
    disposeBrick(last.group);
    for (const [c, h] of last.prevHeights) {
      if (h === 0) this.heights.delete(c);
      else this.heights.set(c, h);
    }
    this.countEl.textContent = String(this.placed.length);
    this.setMode('DESHECHO');
  }

  // --- UI ---

  private updateHover(sx: number, sy: number): void {
    let target: HTMLElement | null = null;
    if (sx >= 0) {
      const el = document.elementFromPoint(sx, sy) as HTMLElement | null;
      target = el?.closest('.brick-item') ?? null;
    }
    if (target !== this.hoveredItem) {
      this.hoveredItem?.classList.remove('hovered');
      this.hoveredItem = target;
      this.hoveredItem?.classList.add('hovered');
    }
  }

  private setMode(mode: string | null): void {
    this.modeEl.textContent = mode ?? '—';
    this.modeEl.className = mode ? 'value active' : 'value';
  }
}
