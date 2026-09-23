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
      <h1>Lego Lab <span style="font-size:11px;font-weight:600;color:var(--accent-warm)">Beta</span></h1>
      <div class="row"><span>Hands</span><span class="value" id="lg-hands">0</span></div>
      <div class="row"><span>Gesture</span><span class="value" id="lg-mode">—</span></div>
      <div class="row"><span>Piece</span><span class="value" id="lg-brick">—</span></div>
      <div class="row"><span>Placed</span><span class="value" id="lg-count">0</span></div>
    </div>
  </div>

  <div id="lg-help" class="gesture-help glass">
    <h2>Gestures</h2>
    <div><b>Index extended</b>: move the ghost piece</div>
    <div><b>Index plus a pinch on the other hand</b>: place the piece</div>
    <div><b>Pinch without an index</b>: turn the piece 90°</div>
    <div><b>Thumb, index, and middle together</b>: open or close the piece catalog</div>
    <div><b>Open palm</b> for 1.5 s: undo</div>
    <div><b>Like with both hands</b>: show or hide this help</div>
  </div>

  <button id="open-palette" class="glass">Pieces</button>

  <div id="brick-modal" class="glass">
    <h2>Piece catalog</h2>
    <div class="grid"></div>
    <div class="modal-close" data-action="close">Close</div>
  </div>

  <div id="lg-laser" class="laser-cursor"></div>
  <div id="lg-status" class="status-message glass"></div>
`;

/**
 * Constructor LEGO beta, gestos sin colisiones:
 * - Índice extendido → posiciona la pieza fantasma (snap + apilado).
 * - Índice + pinch de la OTRA mano → coloca la pieza.
 * - Pinch sin ningún índice extendido → gira la pieza 90°.
 * - Tri-pinch → abre/cierra el catálogo modal (índice para apuntar,
 *   pinch para elegir).
 * - Palma abierta 1.5 s → deshacer. Doble like → ayuda.
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

  private placed: PlacedBrick[] = [];
  private heights = new Map<string, number>();

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Latches de gestos
  private anyPinchWas = false;
  private triWas = false;
  private bothLikeWas = false;
  private palmStart = 0;
  private undoFired = false;

  private modalOpen = false;
  private hoveredItem: HTMLElement | null = null;

  private modeEl!: HTMLElement;
  private handsEl!: HTMLElement;
  private brickEl!: HTMLElement;
  private countEl!: HTMLElement;
  private laser!: HTMLElement;
  private modalEl!: HTMLElement;
  private helpEl!: HTMLElement;

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
    this.modalEl = document.getElementById('brick-modal')!;
    this.helpEl = document.getElementById('lg-help')!;
    if (window.innerWidth <= 600) this.helpEl.classList.add('hidden');

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

    this.buildModal();
    document
      .getElementById('open-palette')!
      .addEventListener('click', () => this.toggleModal());
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
    status.textContent = 'Starting the camera…';
    status.classList.add('visible');
    try {
      await tracker.start();
      status.classList.remove('visible');
    } catch (err) {
      console.error(err);
      status.textContent = 'Camera unavailable. Allow camera access and reload.';
    }
  }

  unmount(): void {
    this.unsubscribe?.();
    getHandTracker().stop();
    this.sceneManager.dispose();
  }

  // --- Catálogo modal ---

  private buildModal(): void {
    const grid = this.modalEl.querySelector('.grid')!;
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
      item.addEventListener('click', () => {
        this.setBrick(def);
        this.closeModal();
      });
      grid.appendChild(item);
    }
    this.modalEl
      .querySelector('.modal-close')!
      .addEventListener('click', () => this.closeModal());
  }

  private toggleModal(): void {
    if (this.modalOpen) this.closeModal();
    else {
      this.modalOpen = true;
      this.modalEl.classList.add('visible');
      this.hideGhost();
    }
  }

  private closeModal(): void {
    this.modalOpen = false;
    this.modalEl.classList.remove('visible');
    this.updateHover(-1, -1);
    this.laser.classList.remove('visible');
  }

  private setBrick(def: BrickDef): void {
    this.currentDef = def;
    this.rotated = false;
    this.brickEl.textContent = `${def.kind === 'plate' ? 'Plate' : 'Brick'} ${def.label}`;
    document.querySelectorAll('#brick-modal .brick-item').forEach((el) => {
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

    // Doble like → ayuda.
    const bothLike = poses.length === 2 && poses.every((p) => p.like);
    if (bothLike && !this.bothLikeWas) this.helpEl.classList.toggle('hidden');
    this.bothLikeWas = bothLike;

    // Tri-pinch (flanco) → abrir/cerrar catálogo.
    const triNow = poses.some((p) => p.triPinch);
    if (triNow && !this.triWas) this.toggleModal();
    this.triWas = triNow;

    const pointer = poses.find((p) => p.pointing);
    // El pinch de una mano en tri-pinch no cuenta como pinch de acción.
    const anyPinch = poses.some((p) => p.pinch && !p.triPinch);
    const pinchRising = anyPinch && !this.anyPinchWas;
    this.anyPinchWas = anyPinch;

    // --- Catálogo abierto: modal (índice apunta, pinch elige) ---
    if (this.modalOpen) {
      if (pointer) {
        const sx = (1 - pointer.indexTip.x) * window.innerWidth;
        const sy = pointer.indexTip.y * window.innerHeight;
        this.laser.style.left = `${sx}px`;
        this.laser.style.top = `${sy}px`;
        this.laser.classList.add('visible');
        this.updateHover(sx, sy);
      } else {
        this.laser.classList.remove('visible');
      }
      if (pinchRising && this.hoveredItem) {
        if (this.hoveredItem.dataset.action === 'close') {
          this.closeModal();
        } else {
          const def = BRICK_CATALOG.find(
            (b) => b.id === this.hoveredItem!.dataset.brick,
          );
          if (def) {
            this.setBrick(def);
            this.closeModal();
          }
        }
      }
      this.setMode('Catalog');
      this.hideGhost();
      this.palmStart = 0;
      return;
    }

    // --- Deshacer con palma sostenida (una sola mano) ---
    const palm = poses.length === 1 && poses[0].openPalm;
    if (palm) {
      if (this.palmStart === 0) this.palmStart = frame.timestamp;
      const elapsed = frame.timestamp - this.palmStart;
      if (elapsed >= UNDO_HOLD_MS && !this.undoFired) {
        this.undoFired = true;
        this.undo();
      }
      if (!this.undoFired) {
        this.setMode(`Undo ${Math.round((elapsed / UNDO_HOLD_MS) * 100)}%`);
      }
    } else {
      this.palmStart = 0;
      this.undoFired = false;
    }

    // --- Posicionar con el índice ---
    if (pointer) {
      this.updateGhost(pointer.indexTip.x, pointer.indexTip.y);
      if (!anyPinch) this.setMode('Moving');
    } else {
      this.hideGhost();
      if (!palm && !anyPinch && !triNow) this.setMode(null);
    }

    // --- Acciones con pinch (flanco de subida) ---
    if (pinchRising) {
      if (pointer && this.ghostValid) {
        // Índice + pinch de la otra mano → colocar.
        this.placeBrick();
      } else if (!pointer) {
        // Pinch sin índice → girar 90°.
        this.rotated = !this.rotated;
        this.rebuildGhost();
        this.setMode('Turned 90°');
      }
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
    const cx = Math.round(hit.x / STUD - w / 2);
    const cz = Math.round(hit.z / STUD - l / 2);
    const clampedX = THREE.MathUtils.clamp(cx, -half, half - w);
    const clampedZ = THREE.MathUtils.clamp(cz, -half, half - l);

    const y = this.stackHeight(clampedX, clampedZ, w, l);
    this.ghostPos.set((clampedX + w / 2) * STUD, y, (clampedZ + l / 2) * STUD);
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
    this.setMode('Placed');
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
    this.setMode('Undone');
  }

  // --- UI ---

  private updateHover(sx: number, sy: number): void {
    let target: HTMLElement | null = null;
    if (sx >= 0) {
      const el = document.elementFromPoint(sx, sy) as HTMLElement | null;
      target = (el?.closest('.brick-item') ??
        el?.closest('.modal-close')) as HTMLElement | null;
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
