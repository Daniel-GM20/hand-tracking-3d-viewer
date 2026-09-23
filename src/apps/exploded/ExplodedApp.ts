import * as THREE from 'three';
import type { MiniApp } from '../../shell/MiniApp';
import { SceneManager } from '../../core/SceneManager';
import { ExplodedModel } from '../../core/ExplodedModel';
import { PieceSelector } from '../../core/PieceSelector';
import { createProceduralDrone } from '../../core/proceduralModel';
import { getHandTracker } from '../../hands/tracker';
import { GestureEngine } from '../../gestures/GestureEngine';
import { GestureController } from '../../gestures/GestureController';
import { Hud } from '../../ui/Hud';
import { VideoPreview } from '../../ui/VideoPreview';
import { InfoPanel } from '../../ui/InfoPanel';
import { ModelPicker, type SampleModel } from '../../ui/ModelPicker';

const SAMPLES: SampleModel[] = [
  { name: 'Drone (procedural)', url: 'procedural' },
  { name: 'Buggy', url: '/models/Buggy.glb' },
  { name: 'Gearbox', url: '/models/GearboxAssy.glb' },
];

const ROTATE_SENSITIVITY = 4.0;

const TEMPLATE = `
  <canvas id="scene-canvas" class="scene"></canvas>

  <div id="hud" class="hud">
    <div class="panel glass">
      <div class="row"><span>Hands</span><span class="value" id="hud-hands">0</span></div>
      <div class="row"><span>Gesture</span><span class="value" id="hud-gesture">—</span></div>
      <div class="row"><span>Part</span><span class="value" id="hud-piece">—</span></div>
      <div class="row"><span>Model</span><span class="value" id="hud-model">—</span></div>
      <div id="explosion-bar"><div id="explosion-fill"></div></div>
      <div id="explosion-label">Explosion</div>
    </div>
  </div>

  <aside class="side-stack">
    <div id="ex-help" class="gesture-help glass">
      <h2>Gestures</h2>
      <div><b>Both hands pinch</b>: pull the model apart</div>
      <div><b>One pinch</b>: rotate</div>
      <div><b>Both open palms</b>: zoom</div>
      <div><b>Point, then pinch the other hand</b>: select a part</div>
      <div><b>Open palm</b> for 2 s: release the part</div>
      <div><b>Like</b> for 2 s: show or hide part details</div>
    </div>
    <div id="info-panel" class="glass">
      <h2 id="info-title">Part</h2>
      <div id="info-body"></div>
    </div>
  </aside>

  <div class="app-dock">
    <div id="model-picker">
      <select id="model-select"></select>
      <button id="load-file-btn" type="button">Open GLB…</button>
      <input id="file-input" type="file" accept=".glb,.gltf" style="display:none" />
    </div>
    <canvas id="video-preview" class="video-preview" width="480" height="360"></canvas>
  </div>

  <div id="laser-cursor" class="laser-cursor"></div>
  <div id="drop-overlay">Drop a GLB file</div>
  <div id="status-message" class="status-message glass"></div>
`;

/** Mini-app: vista explosionada 3D controlada por gestos. */
export class ExplodedApp implements MiniApp {
  private sceneManager!: SceneManager;
  private picker!: ModelPicker;
  private unsubscribe: (() => void) | null = null;

  async mount(container: HTMLElement): Promise<void> {
    const root = document.createElement('div');
    root.className = 'miniapp';
    root.innerHTML = TEMPLATE;
    container.appendChild(root);
    if (window.innerWidth <= 600) document.getElementById('ex-help')?.classList.add('hidden');

    const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
    const previewCanvas = document.getElementById('video-preview') as HTMLCanvasElement;
    const laserCursor = document.getElementById('laser-cursor') as HTMLElement;

    const tracker = getHandTracker();
    const hud = new Hud();
    const sceneManager = new SceneManager(canvas);
    this.sceneManager = sceneManager;
    const model = new ExplodedModel(sceneManager.scene);
    const selector = new PieceSelector(sceneManager.camera, model);
    const infoPanel = new InfoPanel();
    const preview = new VideoPreview(previewCanvas, tracker.video);

    function resetView(): void {
      controller.setExplodeFactor(0);
      hud.setExplosion(0);
      hud.setPiece(null);
      infoPanel.hide();
      laserCursor.classList.remove('visible');
    }

    async function loadSample(sample: SampleModel): Promise<void> {
      hud.showStatus(`CARGANDO ${sample.name.toUpperCase()}…`);
      selector.deselect();
      try {
        if (sample.url === 'procedural') {
          model.setModel(createProceduralDrone());
        } else {
          await model.loadUrl(sample.url);
        }
        hud.setModelName(sample.name);
        hud.hideStatus();
        resetView();
      } catch (err) {
        console.error(err);
        hud.showStatus(`Could not load ${sample.name}. Showing the procedural drone.`);
        model.setModel(createProceduralDrone());
        hud.setModelName('Drone (procedural)');
        resetView();
        setTimeout(() => hud.hideStatus(), 2500);
      }
    }

    async function loadFile(file: File): Promise<void> {
      hud.showStatus(`Loading ${file.name}…`);
      selector.deselect();
      try {
        await model.loadFile(file);
        hud.setModelName(file.name);
        picker.setCustomLabel(file.name);
        hud.hideStatus();
        resetView();
      } catch (err) {
        console.error(err);
        hud.showStatus('That GLB file could not be read.');
        setTimeout(() => hud.hideStatus(), 2500);
      }
    }

    const picker = new ModelPicker(SAMPLES, {
      onSelectSample: loadSample,
      onSelectFile: loadFile,
    });
    this.picker = picker;

    let zoomBase = 1;
    const controller = new GestureController({
      isPieceSelected: () => selector.selected !== null,
      onExplode: (f) => {
        model.setExplosion(f);
        hud.setExplosion(f);
      },
      onRotateDelta: (dx, dy) => {
        if (selector.selected) {
          selector.rotateSelected(dx * ROTATE_SENSITIVITY, dy * ROTATE_SENSITIVITY);
        } else {
          model.pivot.rotation.y += dx * ROTATE_SENSITIVITY;
          model.pivot.rotation.x = THREE.MathUtils.clamp(
            model.pivot.rotation.x + dy * ROTATE_SENSITIVITY,
            -1.2,
            1.2,
          );
        }
      },
      onZoomStart: () => {
        if (selector.selected) selector.beginZoom();
        else zoomBase = model.pivot.scale.x;
      },
      onZoom: (mult) => {
        if (selector.selected) {
          selector.scaleSelected(mult);
        } else {
          const s = THREE.MathUtils.clamp(zoomBase * mult, 0.3, 3);
          model.pivot.scale.setScalar(s);
        }
      },
      onPoint: (x, y) => {
        selector.pointAt(x, y);
        laserCursor.style.left = `${(1 - x) * window.innerWidth}px`;
        laserCursor.style.top = `${y * window.innerHeight}px`;
        laserCursor.classList.add('visible');
      },
      onPointEnd: () => {
        selector.clearPointer();
        laserCursor.classList.remove('visible');
      },
      onSelect: () => {
        const piece = selector.select();
        if (piece) hud.setPiece(piece.name || 'Unnamed part');
      },
      onDeselect: () => {
        selector.deselect();
        infoPanel.hide();
        hud.setPiece(null);
      },
      onToggleInfo: () => {
        if (selector.selected) infoPanel.toggle(selector.selected);
      },
      onGesture: (label) => {
        hud.setGesture(label);
        const manipulating =
          label !== null && label !== 'Pointing' && !label.includes('%');
        sceneManager.controls.enabled = !manipulating;
      },
    });

    const gestureEngine = new GestureEngine();
    gestureEngine.register(controller);

    this.unsubscribe = tracker.onFrame((frame) => {
      hud.setHands(frame.hands.length);
      gestureEngine.update(frame);
      preview.render(frame);
    });

    sceneManager.onUpdate((dt) => model.update(dt));

    (window as unknown as Record<string, unknown>).__jarvis = {
      model,
      selector,
      controller,
      infoPanel,
    };

    await loadSample(SAMPLES[0]);

    hud.showStatus('Starting the camera and hand model…');
    try {
      await tracker.start();
      hud.hideStatus();
    } catch (err) {
      console.error(err);
      hud.showStatus(
        'Camera unavailable. Allow camera access and reload. You can orbit with the mouse until then.',
      );
    }
  }

  unmount(): void {
    this.unsubscribe?.();
    getHandTracker().stop();
    this.picker.dispose();
    this.sceneManager.dispose();
  }
}
