import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Escena Three.js con look holográfico: fondo oscuro, grid tenue,
 * luces frías y bloom sutil. Expone un render loop con callbacks.
 */
export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private composer: EffectComposer;
  private updateCallbacks: Array<(dt: number) => void> = [];
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070d);
    this.scene.fog = new THREE.FogExp2(0x04070d, 0.035);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(4, 3, 6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1, 0);

    // Luces frías estilo holograma
    const ambient = new THREE.AmbientLight(0x334455, 1.2);
    const key = new THREE.DirectionalLight(0xbfe8ff, 2.2);
    key.position.set(5, 8, 5);
    const rim = new THREE.DirectionalLight(0x0088ff, 1.4);
    rim.position.set(-6, 3, -6);
    const fill = new THREE.PointLight(0x00c8ff, 8, 20);
    fill.position.set(0, 4, 0);
    this.scene.add(ambient, key, rim, fill);

    // Grid tenue
    const grid = new THREE.GridHelper(40, 40, 0x0e5f7a, 0x0a2f40);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);

    // Postprocessing: bloom sutil
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, // strength
      0.6, // radius
      0.82, // threshold
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  onUpdate(cb: (dt: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    for (const cb of this.updateCallbacks) cb(dt);
    this.controls.update();
    this.composer.render();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
}
