import * as THREE from 'three';
import { SceneManager } from './core/SceneManager';
import { ExplodedModel } from './core/ExplodedModel';
import { PieceSelector } from './core/PieceSelector';
import { createProceduralDrone } from './core/proceduralModel';
import { HandTracker } from './hands/HandTracker';
import { GestureEngine } from './gestures/GestureEngine';
import { GestureController } from './gestures/GestureController';
import { Hud } from './ui/Hud';
import { VideoPreview } from './ui/VideoPreview';
import { InfoPanel } from './ui/InfoPanel';
import { ModelPicker, type SampleModel } from './ui/ModelPicker';

const SAMPLES: SampleModel[] = [
  { name: 'Dron (procedural)', url: 'procedural' },
  { name: 'Buggy', url: '/models/Buggy.glb' },
  { name: 'Gearbox', url: '/models/GearboxAssy.glb' },
];

const ROTATE_SENSITIVITY = 4.0; // radianes por unidad normalizada de movimiento

async function main(): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
  const video = document.getElementById('webcam') as HTMLVideoElement;
  const previewCanvas = document.getElementById('video-preview') as HTMLCanvasElement;
  const laserCursor = document.getElementById('laser-cursor') as HTMLElement;

  const hud = new Hud();
  const sceneManager = new SceneManager(canvas);
  const model = new ExplodedModel(sceneManager.scene);
  const selector = new PieceSelector(sceneManager.camera, model);
  const infoPanel = new InfoPanel();
  const preview = new VideoPreview(previewCanvas, video);

  // --- Carga de modelos ---
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
      hud.showStatus(`ERROR CARGANDO ${sample.name.toUpperCase()} — USANDO DRON PROCEDURAL`);
      model.setModel(createProceduralDrone());
      hud.setModelName('Dron (procedural)');
      resetView();
      setTimeout(() => hud.hideStatus(), 2500);
    }
  }

  async function loadFile(file: File): Promise<void> {
    hud.showStatus(`CARGANDO ${file.name.toUpperCase()}…`);
    selector.deselect();
    try {
      await model.loadFile(file);
      hud.setModelName(file.name);
      picker.setCustomLabel(file.name);
      hud.hideStatus();
      resetView();
    } catch (err) {
      console.error(err);
      hud.showStatus('ERROR: ARCHIVO GLB NO VÁLIDO');
      setTimeout(() => hud.hideStatus(), 2500);
    }
  }

  const picker = new ModelPicker(SAMPLES, {
    onSelectSample: loadSample,
    onSelectFile: loadFile,
  });

  // --- Gestos ---
  let zoomBase = 1; // escala del pivote al iniciar zoom global

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
      // Cursor en pantalla (espejado como el preview).
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
      if (piece) hud.setPiece(piece.name || 'pieza sin nombre');
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
      // Deshabilitar OrbitControls solo durante manipulación activa.
      const manipulating =
        label !== null && label !== 'APUNTANDO' && !label.includes('%');
      sceneManager.controls.enabled = !manipulating;
    },
  });

  const gestureEngine = new GestureEngine();
  gestureEngine.register(controller);

  // --- Tracking de manos ---
  const tracker = new HandTracker(video);
  tracker.onFrame((frame) => {
    hud.setHands(frame.hands.length);
    gestureEngine.update(frame);
    preview.render(frame);
  });

  // --- Render loop ---
  sceneManager.onUpdate((dt) => {
    model.update(dt);
  });

  // Hook de debug (consola): __jarvis.model.setExplosion(0.8)
  (window as unknown as Record<string, unknown>).__jarvis = {
    model,
    selector,
    controller,
    infoPanel,
  };

  // --- Arranque ---
  await loadSample(SAMPLES[0]);

  hud.showStatus('INICIANDO CÁMARA Y MODELO DE MANOS…');
  try {
    await tracker.start();
    hud.hideStatus();
  } catch (err) {
    console.error(err);
    hud.showStatus(
      'CÁMARA NO DISPONIBLE — CONCEDE PERMISO Y RECARGA. PUEDES USAR EL RATÓN (ORBIT) MIENTRAS TANTO.',
    );
  }
}

main();
